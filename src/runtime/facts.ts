import type { ProviderId } from "../providers/index.ts";

/**
 * What the runtime has observed: which provider's agent each terminal is hosting. A
 * fact, never a field on the tile — the tile is a place, and this is what is in it right
 * now. When the daemon exists it reads this from the PTY's process tree; until then the
 * mock says it. A terminal hosting nothing is showing its shell.
 */
export interface Facts {
  readonly hosting: Readonly<Record<string, ProviderId>>;
}

export const noFacts: Facts = { hosting: {} };

export const hostedBy = (facts: Facts, terminalId: string): ProviderId | null => facts.hosting[terminalId] ?? null;

/** What the runtime is asked to do. Not undoable: a process cannot be undone. */
export type RuntimeCommand =
  | { kind: "start"; host: string; provider: ProviderId }
  | { kind: "stop"; host: string };

/** The mock's stand-in for observation: the command is taken as having happened. */
export function observe(facts: Facts, command: RuntimeCommand): Facts {
  const hosting = { ...facts.hosting };
  if (command.kind === "start") hosting[command.host] = command.provider;
  else delete hosting[command.host];
  return { hosting };
}
