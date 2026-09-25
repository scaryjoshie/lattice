import { apply, type Command, type Grid } from "@lattice/model";
import type { Store } from "../core/store.ts";

/** A document saved before hosts had a size: a tile without one is one cell. */
export const upgrade = (grid: Grid): Grid => ({
  ...grid,
  tiles: grid.tiles.map((t) => ({ ...t, span: t.span ?? 1, rows: t.rows ?? 1 })),
});

/**
 * The document, owned here. A command is judged and applied through the model, whole or
 * not at all, then saved and recorded. History is snapshots with the marks they were
 * made with, exactly as the app's store held it; undo hands the mark back.
 */
interface Entry {
  readonly grid: Grid;
  readonly mark?: unknown;
}

export class Document {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private listeners = new Set<(grid: Grid, dc: number, dr: number) => void>();

  constructor(
    private readonly store: Store,
    private grid: Grid,
  ) {}

  current(): Grid {
    return this.grid;
  }

  /** Called with every new grid, before the reply to whatever caused it goes out. */
  onChange(listen: (grid: Grid, dc: number, dr: number) => void): () => void {
    this.listeners.add(listen);
    return () => this.listeners.delete(listen);
  }

  run(command: Command, mark?: unknown): { ok: boolean; dc: number; dr: number; id?: string } {
    const made = apply(this.grid, command);
    if (!made.ok) return { ok: false, dc: 0, dr: 0 };
    this.past.push({ grid: this.grid, mark });
    this.future = [];
    this.replace(made.grid, made.dc, made.dr);
    this.store.record("run", command);
    return { ok: true, dc: made.dc, dr: made.dr, id: made.id };
  }

  undo(mark?: unknown): { ok: boolean; mark?: unknown } {
    const before = this.past.pop();
    if (!before) return { ok: false };
    this.future.unshift({ grid: this.grid, mark });
    this.replace(before.grid, 0, 0);
    this.store.record("undo", null);
    return { ok: true, mark: before.mark };
  }

  redo(mark?: unknown): { ok: boolean; mark?: unknown } {
    const next = this.future.shift();
    if (!next) return { ok: false };
    this.past.push({ grid: this.grid, mark });
    this.replace(next.grid, 0, 0);
    this.store.record("redo", null);
    return { ok: true, mark: next.mark };
  }

  private replace(grid: Grid, dc: number, dr: number): void {
    this.grid = grid;
    this.store.saveDocument(grid);
    for (const listen of this.listeners) listen(grid, dc, dr);
  }
}
