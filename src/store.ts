import { create } from "zustand";
import { addTile, type Grid, nextId, seed } from "./model.ts";

/** The model, and nothing else. Camera state deliberately does not live here. */
interface Store {
  grid: Grid;
  addAt(columnIndex: number, rowIndex: number): void;
}

export const useGrid = create<Store>((set, get) => ({
  grid: seed(),
  addAt(columnIndex, rowIndex) {
    const g = get().grid;
    const column = g.columns[columnIndex];
    const row = g.rows[rowIndex];
    if (!column || !row) return;
    set({ grid: addTile(g, column.id, row.id, nextId("t")) });
  },
}));
