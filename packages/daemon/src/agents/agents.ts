import type { Facts } from "@lattice/protocol";
import type { Store } from "../core/store.ts";

/**
 * What is hosted where. Today a stand-in: a start is taken as having happened and a stop
 * as having stopped, since nothing runs yet. When terminals exist this is observed from
 * each PTY's process tree instead, and the shape does not change.
 */
export class Agents {
  private listeners = new Set<(facts: Facts) => void>();

  constructor(
    private readonly store: Store,
    private facts: Facts,
  ) {}

  current(): Facts {
    return this.facts;
  }

  onChange(listen: (facts: Facts) => void): () => void {
    this.listeners.add(listen);
    return () => this.listeners.delete(listen);
  }

  start(host: string, occupant: string): void {
    this.set({ hosting: { ...this.facts.hosting, [host]: occupant } });
    this.store.record("start", { host, occupant });
  }

  stop(host: string): void {
    const hosting = { ...this.facts.hosting };
    delete hosting[host];
    this.set({ hosting });
    this.store.record("stop", { host });
  }

  private set(facts: Facts): void {
    this.facts = facts;
    for (const listen of this.listeners) listen(facts);
  }
}
