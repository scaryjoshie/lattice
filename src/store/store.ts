import { create } from "zustand";
import { apply, type Command, propose, type Verdict } from "../model/command.ts";
import { type Grid, indexOfTrack, rowsFor } from "../model/grid.ts";
import { seed } from "../mock/seed.ts";
import { cellsFor, linesFor, spanFor } from "../paint/measure.ts";

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
  remeasure(): void;
}

/**
 * The seed names its runs but cannot size them: measuring text needs a browser, and the
 * model is meant to run without one. Sizing them here keeps the span derived from the
 * words in every case rather than only for the ones someone types.
 */
function measured(grid: Grid): Grid {
  return {
    ...grid,
    tiles: grid.tiles.map((tile) =>
      tile.kind === "text" && tile.text && tile.cap?.span === undefined
        ? { ...tile, span: spanFor(tile.style ?? "title", tile.text) }
        : tile,
    ),
  };
}

/**
 * A run whose width is capped and whose height is not is as tall as its words wrap to at
 * that width, bounded by what is free below. Recomputed after anything that may have
 * changed a width, since only the editor otherwise knows how tall a run is.
 */
function refit(grid: Grid): Grid {
  return {
    ...grid,
    tiles: grid.tiles.map((tile) => {
      if (tile.kind !== "text" || tile.cap?.span === undefined || tile.cap.rows !== undefined) return tile;
      const style = tile.style ?? "title";
      const span = tile.span ?? 1;
      const ci = indexOfTrack(grid.columns, tile.columnId);
      const ri = indexOfTrack(grid.rows, tile.rowId);
      const want = cellsFor(style, linesFor(style, tile.text ?? "", span));
      return { ...tile, rows: rowsFor(grid, tile.id, ci, ri, span, want) };
    }),
  };
}

export const useGrid = create<Store>((set, get) => ({
  grid: measured(seed()),
  propose(command) {
    return propose(get().grid, command);
  },
  run(command) {
    const { grid, past } = get();
    const made = apply(grid, command);
    if (made.ok) set({ grid: refit(made.grid), past: [...past, grid], future: [] });
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
  /**
   * Measure every run again. The seed is measured when this module is evaluated, which is
   * before the web font has loaded, so until then every run is sized against the fallback
   * face — a different width for the same words.
   */
  remeasure() {
    set((s) => ({ grid: measured(s.grid), past: s.past.map(measured), future: s.future.map(measured) }));
  },
}));
