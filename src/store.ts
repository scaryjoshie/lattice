import { create } from "zustand";
import { cellsFor, linesFor, spanFor } from "./measure.ts";
import {
  addTile,
  applied,
  ensureTracks,
  type Grid,
  indexOfTrack,
  type Move,
  nextId,
  rowsFor,
  seed,
  type TextStyle,
  type TileKind,
} from "./model.ts";

/** The model, and nothing else. Camera state deliberately does not live here. */
interface Store {
  grid: Grid;
  /**
   * Returns the new tile's id, so a text tile can be opened for editing at once, and how
   * many tracks were prepended to reach the cell, so the camera can stay put.
   */
  addAt(
    columnIndex: number,
    rowIndex: number,
    kind: TileKind,
    style?: TextStyle,
  ): { id: string; dc: number; dr: number } | null;
  setText(tileId: string, text: string, span: number, rows: number): void;
  setName(tileId: string, name: string): void;
  remove(tileId: string): void;
  /** Applies every move together. Returns how many tracks were prepended on the way. */
  apply(moves: readonly Move[]): { dc: number; dr: number };
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
  /**
   * Measure every run again. The seed is measured when this module is evaluated, which is
   * before the web font has loaded, so until then every run is sized against the fallback
   * face — a different width for the same words.
   */
  remeasure() {
    set((s) => ({ grid: measured(s.grid) }));
  },
  addAt(columnIndex, rowIndex, kind, style) {
    const made = ensureTracks(get().grid, { ci: columnIndex, ri: rowIndex, span: 1, rows: 1 });
    const g = made.grid;
    const column = g.columns[columnIndex + made.dc];
    const row = g.rows[rowIndex + made.dr];
    if (!column || !row) return null;
    const id = nextId("t");
    const next = addTile(g, column.id, row.id, kind, id, style);
    if (next === g) return null;
    set({ grid: next });
    return { id, dc: made.dc, dr: made.dr };
  },
  setText(tileId, text, span, rows) {
    set((s) => ({
      grid: {
        ...s.grid,
        tiles: s.grid.tiles.map((t) => (t.id === tileId ? { ...t, text, span, rows } : t)),
      },
    }));
  },
  setName(tileId, name) {
    set((s) => ({
      grid: {
        ...s.grid,
        tiles: s.grid.tiles.map((t) =>
          t.id === tileId ? { ...t, name: name.trim() || undefined } : t,
        ),
      },
    }));
  },
  remove(tileId) {
    set((s) => ({ grid: { ...s.grid, tiles: s.grid.tiles.filter((t) => t.id !== tileId) } }));
  },
  /** Every move a proposal produced, applied together — a swap is not two moves. */
  apply(moves) {
    if (moves.length === 0) return { dc: 0, dr: 0 };
    const made = applied(get().grid, moves);
    set({ grid: refit(made.grid) });
    return { dc: made.dc, dr: made.dr };
  },
}));
