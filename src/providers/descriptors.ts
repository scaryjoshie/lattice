/**
 * What can run in a terminal, as data. This is the only place a provider is named. The
 * grid does not know these: a tile is a terminal, and what runs in it is a fact the
 * runtime observes and looks up here. Adding a provider is one row.
 *
 * The descriptor half of a provider; the adapter half — how one is launched, resumed,
 * identified — lives in the daemon when there is one. A plain shell is a program like
 * any other, with a mark and a label: "nothing special" is a case, not an else-branch.
 */
export type ProgramId = "shell" | "claude" | "codex";

/** A mark the painter knows how to draw. Path data lives with the painter. */
export type MarkId = ProgramId | "browser";

export interface Descriptor {
  readonly id: ProgramId;
  readonly label: string;
  /** An agent, as opposed to a utility. The add menu groups by this; the canvas does not. */
  readonly agent: boolean;
  readonly mark: MarkId;
}

export const PROGRAMS: Readonly<Record<ProgramId, Descriptor>> = {
  shell: { id: "shell", label: "terminal", agent: false, mark: "shell" },
  claude: { id: "claude", label: "claude code", agent: true, mark: "claude" },
  codex: { id: "codex", label: "codex", agent: true, mark: "codex" },
};
