import type { OccupantId } from "../occupants/index.ts";

/**
 * What the runtime has observed: which occupant each host is holding. A fact, never a
 * field on the tile — the tile is a place, and this is what is in it right now. When the
 * daemon exists it reads this from the PTY's process tree; until then the mock says it.
 * A host with no entry shows its surface's idle occupant: a terminal, its shell.
 */
export interface Facts {
  readonly hosting: Readonly<Record<string, OccupantId>>;
}

export const noFacts: Facts = { hosting: {} };

export const hostedBy = (facts: Facts, hostId: string): OccupantId | null => facts.hosting[hostId] ?? null;

/** What the runtime is asked to do. Not undoable: a process cannot be undone. */
export type RuntimeCommand =
  | { kind: "start"; host: string; occupant: OccupantId }
  | { kind: "stop"; host: string };

/** The mock's stand-in for observation: the command is taken as having happened. */
export function observe(facts: Facts, command: RuntimeCommand): Facts {
  const hosting = { ...facts.hosting };
  if (command.kind === "start") hosting[command.host] = command.occupant;
  else delete hosting[command.host];
  return { hosting };
}
