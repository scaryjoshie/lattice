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
   *  and for a place the new tile's id. */
  run(command: Command): { ok: boolean; dc: number; dr: number; id?: string };
  /**
   * History is the grids as they were before each command, since the grid is a small
   * immutable value and a snapshot cannot be wrong the way an inverse command can. Undo
   * restores one; redo restores what undo replaced. A new command drops the redo side.
   */
  past: readonly Grid[];
  future: readonly Grid[];
  undo(): boolean;
  redo(): boolean;
}

export const useGrid = create<Store>((set, get) => ({
  grid: seeded.grid,
  propose(command) {
    return propose(get().grid, command);
  },
  run(command) {
    const { grid, past } = get();
    const made = apply(grid, command);
    if (made.ok) set({ grid: made.grid, past: [...past, grid], future: [] });
    return { ok: made.ok, dc: made.dc, dr: made.dr, id: made.id };
  },
  past: [],
  future: [],
  undo() {
    const { grid, past, future } = get();
    const before = past[past.length - 1];
    if (!before) return false;
    set({ grid: before, past: past.slice(0, -1), future: [grid, ...future] });
    return true;
  },
  redo() {
    const { grid, past, future } = get();
    const [next, ...rest] = future;
    if (!next) return false;
    set({ grid: next, past: [...past, grid], future: rest });
    return true;
  },
}));
