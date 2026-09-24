import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Write a private temp file for a launch; the runtime removes it when the process exits. */
export function tempJson(name: string, value: unknown): string {
  const dir = join(tmpdir(), "pane-launch");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${name}-${crypto.randomUUID()}.json`);
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  return path;
}

export function removeQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    /* already gone */
  }
}

/** Quote one argument for a POSIX shell. */
export function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_./:=@%+-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
}
