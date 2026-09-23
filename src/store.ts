import { create } from "zustand";
import { spanFor } from "./measure.ts";
import { addTile, bounds, ensureTracks, type Grid, type Move, nextId, seed, type TextStyle, type TileKind } from "./model.ts";

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
      tile.kind === "text" && tile.text
        ? { ...tile, span: spanFor(tile.style ?? "title", tile.text) }
        : tile,
    ),
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
    const still = { dc: 0, dr: 0 };
    if (moves.length === 0) return still;
    // Tracks for every destination first, so no move is ever dropped for lack of one.
    const before = get().grid;
    const shape = (id: string) => {
      const tile = before.tiles.find((x) => x.id === id);
      if (tile) return { span: tile.span ?? 1, rows: tile.rows ?? 1 };
      const scope = before.scopes.find((x) => x.id === id);
      return scope ? bounds(before, scope) : { span: 1, rows: 1 };
    };
    const reach = moves.reduce(
      (r, m) => {
        const s = shape(m.id);
        return {
          ci: Math.min(r.ci, m.ci),
          ri: Math.min(r.ri, m.ri),
          c1: Math.max(r.c1, m.ci + s.span),
          r1: Math.max(r.r1, m.ri + s.rows),
        };
      },
      { ci: Infinity, ri: Infinity, c1: -Infinity, r1: -Infinity },
    );
    const made = ensureTracks(before, { ci: reach.ci, ri: reach.ri, span: reach.c1 - reach.ci, rows: reach.r1 - reach.ri });
    const g = made.grid;
    const at = new Map(moves.map((m) => [m.id, { ...m, ci: m.ci + made.dc, ri: m.ri + made.dr }]));
    const track = (tracks: Grid["columns"], i: number) => tracks[i]?.id;
    set({
      grid: {
        ...g,
        tiles: g.tiles.map((tile) => {
          const m = at.get(tile.id);
          const columnId = m && track(g.columns, m.ci);
          const rowId = m && track(g.rows, m.ri);
          return columnId && rowId ? { ...tile, columnId, rowId } : tile;
        }),
        // A scope moves whole: its four edges shift by the same amount its tiles did.
        scopes: g.scopes.map((scope) => {
          const m = at.get(scope.id);
          if (!m) return scope;
          const b = bounds(g, scope);
          const columnStart = track(g.columns, m.ci);
          const columnEnd = track(g.columns, m.ci + b.span - 1);
          const rowStart = track(g.rows, m.ri);
          const rowEnd = track(g.rows, m.ri + b.rows - 1);
          return columnStart && columnEnd && rowStart && rowEnd
            ? { ...scope, columnStart, columnEnd, rowStart, rowEnd }
            : scope;
        }),
      },
    });
    return { dc: made.dc, dr: made.dr };
  },
}));
