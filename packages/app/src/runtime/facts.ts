import type { OccupantId } from "../occupants/index.ts";

/**
 * What the runtime has observed: which occupant each host is holding. A fact, never a
 * field on the tile — the tile is a place, and this is what is in it right now. The
 * daemon says; today it takes a start as having happened, and when terminals exist it
 * reads the PTY's process tree instead. A host with no entry shows its surface's idle
 * occupant: a terminal, its shell.
 */
export interface Facts {
  readonly hosting: Readonly<Record<string, OccupantId>>;
}

export const hostedBy = (facts: Facts, hostId: string): OccupantId | null => facts.hosting[hostId] ?? null;

/** What the runtime is asked to do. Not undoable: a process cannot be undone. */
export type RuntimeCommand =
  | { kind: "start"; host: string; occupant: OccupantId }
  | { kind: "stop"; host: string };
