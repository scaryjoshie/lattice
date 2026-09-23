import { create } from "zustand";
import { addTile, type Grid, nextId, seed, type TextStyle, type TileKind } from "./model.ts";

/** The model, and nothing else. Camera state deliberately does not live here. */
interface Store {
  grid: Grid;
  /** Returns the new tile's id, so a text tile can be opened for editing at once. */
  addAt(columnIndex: number, rowIndex: number, kind: TileKind, style?: TextStyle): string | null;
  setText(tileId: string, text: string, span: number): void;
  remove(tileId: string): void;
}

export const useGrid = create<Store>((set, get) => ({
  grid: seed(),
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
  remove(tileId) {
    set((s) => ({ grid: { ...s.grid, tiles: s.grid.tiles.filter((t) => t.id !== tileId) } }));
  },
}));
