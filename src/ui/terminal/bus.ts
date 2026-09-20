/** Terminal frames from the one socket, fanned out to whichever xterm is mounted. */

export interface TermListener {
  /** Base64 of the raw bytes, as the socket carries them. */
  data(b64: string): void;
  /** A replay of everything the process printed before we attached. */
  replay(b64: string): void;
  exit(code: number | null): void;
}

const listeners = new Map<string, Set<TermListener>>();

export const terminalBus = {
  subscribe(id: string, l: TermListener): () => void {
    const set = listeners.get(id) ?? new Set<TermListener>();
    set.add(l);
    listeners.set(id, set);
    return () => {
      set.delete(l);
    };
  },
  emit(id: string, fn: (l: TermListener) => void): void {
    for (const l of listeners.get(id) ?? []) fn(l);
  },
};
