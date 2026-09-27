import { existsSync, type FSWatcher, readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { type Patch, type Preferences as Values, patchPreferences, resolvePreferences, storedPreferences } from "@lattice/protocol";

/**
 * The app's settings, kept in a JSON file that holds only what differs from the defaults,
 * so it reads as a list of what was chosen and can be edited by hand. The definitions are
 * the protocol's; this module is the file. Anything in it that is not a setting's value
 * is ignored and that setting's default used, and a file that is not JSON at all is the
 * defaults at start, so no edit can stop the daemon. Once running, a file that is not JSON
 * changes nothing, since that is also what an editor's save looks like halfway through.
 *
 * The file is watched, so an edit made by hand reaches every window. A write replaces it
 * through a temporary file and a rename, so a reader never sees half of one; the watch is
 * on the folder for the same reason, since a rename puts a new file where the old was.
 */
export class Preferences {
  private values: Values;
  private listeners = new Set<(preferences: Values) => void>();
  private watcher: FSWatcher;

  constructor(private readonly file: string) {
    this.values = this.read() ?? resolvePreferences(undefined);
    this.watcher = watch(dirname(file), (_event, name) => {
      if (name !== basename(file)) return;
      const read = this.read();
      if (read) this.set(read);
    });
  }

  current(): Values {
    return this.values;
  }

  onChange(listen: (preferences: Values) => void): () => void {
    this.listeners.add(listen);
    return () => this.listeners.delete(listen);
  }

  /** Apply a change, write what now differs from the defaults, and tell everyone. */
  prefer(patch: Patch): Values {
    const next = patchPreferences(this.values, patch);
    if (!same(next, this.values)) {
      const temporary = `${this.file}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(storedPreferences(next), null, 2)}\n`, { mode: 0o600 });
      renameSync(temporary, this.file);
      this.set(next);
    }
    return this.values;
  }

  close(): void {
    this.watcher.close();
  }

  /** What the file says, the defaults when there is none, and null when it is not JSON. */
  private read(): Values | null {
    if (!existsSync(this.file)) return resolvePreferences(undefined);
    try {
      return resolvePreferences(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return null;
    }
  }

  /** Only a change is news: the watch also sees this module's own writes. */
  private set(next: Values): void {
    if (same(next, this.values)) return;
    this.values = next;
    for (const listen of this.listeners) listen(next);
  }
}

/** Resolved values are built key by key in one order, so their text compares them. */
const same = (a: Values, b: Values): boolean => JSON.stringify(a) === JSON.stringify(b);
