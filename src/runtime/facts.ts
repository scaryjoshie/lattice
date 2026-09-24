import type { ProgramId } from "../providers/index.ts";

/**
 * What the runtime has observed: which program is in the foreground of each terminal.
 * A fact, never a field on the tile — the tile is a place, and this is what is in it
 * right now. When the daemon exists it reads this from the PTY's process tree; until
 * then the mock says it. Either way a terminal with no entry is running its shell,
 * which is an ordinary program and not the absence of one.
 */
export interface Facts {
  readonly programs: Readonly<Record<string, ProgramId>>;
}

export const noFacts: Facts = { programs: {} };

export const programOf = (facts: Facts, terminalId: string): ProgramId => facts.programs[terminalId] ?? "shell";

/** What the runtime is asked to do. Not undoable: a process cannot be undone. */
export type RuntimeCommand =
  | { kind: "start"; terminal: string; program: ProgramId }
  | { kind: "stop"; terminal: string };

/** The mock's stand-in for observation: the command is taken as having happened. */
export function observe(facts: Facts, command: RuntimeCommand): Facts {
  const programs = { ...facts.programs };
  if (command.kind === "start") programs[command.terminal] = command.program;
  else delete programs[command.terminal];
  return { programs };
}
