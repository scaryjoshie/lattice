import { create } from "zustand";
import { apply, type Command, propose, type Verdict } from "../model/command.ts";
import type { Grid } from "../model/grid.ts";
import { seeded } from "../mock/seed.ts";

/**
 * The document, and the only way it changes. `propose` says what a command would do;
 * `run` does it, judged again and applied whole, or refused. Nothing else writes the
 * grid, and nothing writes it without a command, which is what makes a history possible.
 * Camera and session state deliberately do not live here.
 */
interface Store {
  grid: Grid;
  propose(command: Command): Verdict;
  /** Returns how many tracks were prepended, which shifts every index the caller holds,
   *  and for a place the new tile's id. `mark` is whatever the caller wants back when this
   *  change is undone — the selection — and the store never looks at it. */
  run(command: Command, mark?: unknown): { ok: boolean; dc: number; dr: number; id?: string };
  /**
   * History is the grids as they were before each command, since the grid is a small
   * immutable value and a snapshot cannot be wrong the way an inverse command can. Each
   * entry carries the mark it was made with, so undoing a change hands back what was
   * selected when it was made, and redo hands back what was selected when it was undone.
   * Selecting on its own is not a step. A new command drops the redo side.
   */
  past: readonly Entry[];
  future: readonly Entry[];
  undo(mark?: unknown): { ok: boolean; mark?: unknown };
  redo(mark?: unknown): { ok: boolean; mark?: unknown };
}

interface Entry {
  readonly grid: Grid;
  readonly mark?: unknown;
}

export const useGrid = create<Store>((set, get) => ({
  grid: seeded.grid,
  propose(command) {
    return propose(get().grid, command);
  },
  run(command, mark) {
    const { grid, past } = get();
    const made = apply(grid, command);
    if (made.ok) set({ grid: made.grid, past: [...past, { grid, mark }], future: [] });
    return { ok: made.ok, dc: made.dc, dr: made.dr, id: made.id };
  },
  past: [],
  future: [],
  undo(mark) {
    const { grid, past, future } = get();
    const before = past[past.length - 1];
    if (!before) return { ok: false };
    set({ grid: before.grid, past: past.slice(0, -1), future: [{ grid, mark }, ...future] });
    return { ok: true, mark: before.mark };
  },
  redo(mark) {
    const { grid, past, future } = get();
    const [next, ...rest] = future;
    if (!next) return { ok: false };
    set({ grid: next.grid, past: [...past, { grid, mark }], future: rest });
    return { ok: true, mark: next.mark };
  },
}));
