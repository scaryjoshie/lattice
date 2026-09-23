import { create } from "zustand";
import { spanFor } from "./measure.ts";
import { addTile, type Grid, type Move, nextId, seed, type TextStyle, type TileKind } from "./model.ts";

/** The model, and nothing else. Camera state deliberately does not live here. */
interface Store {
  grid: Grid;
  /** Returns the new tile's id, so a text tile can be opened for editing at once. */
  addAt(columnIndex: number, rowIndex: number, kind: TileKind, style?: TextStyle): string | null;
  setText(tileId: string, text: string, span: number): void;
  setName(tileId: string, name: string): void;
  remove(tileId: string): void;
  apply(moves: readonly Move[]): void;
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
  addAt(columnIndex, rowIndex, kind, style) {
    const g = get().grid;
    const column = g.columns[columnIndex];
    const row = g.rows[rowIndex];
    if (!column || !row) return null;
    const id = nextId("t");
    const next = addTile(g, column.id, row.id, kind, id, style);
    if (next === g) return null;
    set({ grid: next });
    return id;
  },
  setText(tileId, text, span) {
    set((s) => ({
      grid: {
        ...s.grid,
        tiles: s.grid.tiles.map((t) => (t.id === tileId ? { ...t, text, span } : t)),
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
    if (moves.length === 0) return;
    const g = get().grid;
    const at = new Map(moves.map((m) => [m.tileId, m]));
    set({
      grid: {
        ...g,
        tiles: g.tiles.map((tile) => {
          const m = at.get(tile.id);
          if (!m) return tile;
          const column = g.columns[m.ci];
          const row = g.rows[m.ri];
          return column && row ? { ...tile, columnId: column.id, rowId: row.id } : tile;
        }),
      },
    });
  },
}));
