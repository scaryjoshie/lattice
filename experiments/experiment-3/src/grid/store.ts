import { create } from "zustand";
import {
  addTile,
  type Grid,
  insertColumnsAt,
  insertRowsAt,
  moveTile,
  nextId,
  seed,
} from "./model.ts";

/**
 * All product state lives here; components hold only what is true for the duration of a
 * gesture. Every action is a pure model operation applied to the previous grid.
 */

interface Store {
  grid: Grid;
  /** Place a tile at a lane pair. Out-of-range lanes are the margin: the track is made. */
  addAt(columnIndex: number, rowIndex: number): void;
  /** Commit a drag. Same lane rule, so a tile can be dragged into the margin. */
  dropTile(tileId: string, columnIndex: number, rowIndex: number): void;
  insertColumns(at: number, ids: readonly string[]): void;
  insertRows(at: number, ids: readonly string[]): void;
}

/**
 * Space can always be made: a lane outside the current tracks resolves by inserting one,
 * which is the same primitive the gutters use and costs no existing tile its position.
 */
function resolve(
  grid: Grid,
  columnIndex: number,
  rowIndex: number,
): { grid: Grid; columnId: string; rowId: string } | null {
  let g = grid;
  let ci = columnIndex;
  let ri = rowIndex;
  if (ci < 0) {
    g = insertColumnsAt(g, 0, [nextId("c")]);
    ci = 0;
  } else if (ci >= g.columns.length) {
    ci = g.columns.length;
    g = insertColumnsAt(g, ci, [nextId("c")]);
  }
  if (ri < 0) {
    g = insertRowsAt(g, 0, [nextId("r")]);
    ri = 0;
  } else if (ri >= g.rows.length) {
    ri = g.rows.length;
    g = insertRowsAt(g, ri, [nextId("r")]);
  }
  const column = g.columns[ci];
  const row = g.rows[ri];
  return column && row ? { grid: g, columnId: column.id, rowId: row.id } : null;
}

export const useGrid = create<Store>((set, get) => ({
  grid: seed(),
  addAt(columnIndex, rowIndex) {
    const r = resolve(get().grid, columnIndex, rowIndex);
    if (r) set({ grid: addTile(r.grid, r.columnId, r.rowId) });
  },
  dropTile(tileId, columnIndex, rowIndex) {
    const r = resolve(get().grid, columnIndex, rowIndex);
    if (r) set({ grid: moveTile(r.grid, tileId, r.columnId, r.rowId) });
  },
  insertColumns(at, ids) {
    set((s) => ({ grid: insertColumnsAt(s.grid, at, ids) }));
  },
  insertRows(at, ids) {
    set((s) => ({ grid: insertRowsAt(s.grid, at, ids) }));
  },
}));
