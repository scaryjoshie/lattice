import type { SessionPresence } from "./types.ts";

/** In-memory presence per agent, compared so the loop only announces real changes. */
export class PresenceTable {
  private readonly entries = new Map<string, SessionPresence>();

  get(agentId: string): SessionPresence | undefined {
    return this.entries.get(agentId);
  }

  /** Store; true if anything changed. */
  set(agentId: string, next: SessionPresence | null): boolean {
    const prev = this.entries.get(agentId);
    if (!next) {
      if (!prev) return false;
      this.entries.delete(agentId);
      return true;
    }
    if (
      prev &&
      prev.status === next.status &&
      prev.activeAt === next.activeAt &&
      prev.cwd === next.cwd
    ) {
      return false;
    }
    this.entries.set(agentId, next);
    return true;
  }

  delete(agentId: string): boolean {
    return this.entries.delete(agentId);
  }
}
