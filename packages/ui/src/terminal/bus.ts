import type { Id } from "@pane/kernel/model";

/** Terminal frames from the one socket, fanned out to the xterm that shows each agent. */

export interface TermListener {
  /** Base64 of the raw bytes, as the socket carries them. */
  data(b64: string): void;
  exit(code: number | null): void;
}

const listeners = new Map<string, Set<TermListener>>();

export const terminalBus = {
  subscribe(agentId: Id<"agent">, l: TermListener): () => void {
    const set = listeners.get(agentId) ?? new Set();
    set.add(l);
    listeners.set(agentId, set);
    return () => {
      set.delete(l);
    };
  },
  data(agentId: Id<"agent">, b64: string): void {
    for (const l of listeners.get(agentId) ?? []) l.data(b64);
  },
  exit(agentId: Id<"agent">, code: number | null): void {
    for (const l of listeners.get(agentId) ?? []) l.exit(code);
  },
};
