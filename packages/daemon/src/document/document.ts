import { apply, bounds, type Command, covers, footprint, type Grid } from "@lattice/model";
import type { Step } from "@lattice/protocol";
import type { Store } from "../core/store.ts";

/** A document saved before hosts had a size: a tile without one is one cell. */
export const upgrade = (grid: Grid): Grid => ({
  ...grid,
  tiles: grid.tiles.map((t) => ({ ...t, span: t.span ?? 1, rows: t.rows ?? 1 })),
});

/**
 * The document, owned here. A command is judged and applied through the model, whole or
 * not at all, then saved and recorded. History is snapshots with the marks they were
 * made with, exactly as the app's store held it; undo hands the mark back. Each entry
 * also keeps the step it was, so a window can list the history without replaying it.
 */
interface Entry {
  readonly grid: Grid;
  readonly mark?: unknown;
  readonly step: Step;
}

/**
 * What a command did, for a history list: the command, and the thing it was done to, found
 * where it can be seen, after for what a command makes or changes and before for what it
 * removes. A move names what it carried when that was one thing: a scope with whatever is
 * in it counts once.
 */
export function stepOf(command: Command, before: Grid, after: Grid, id?: string): Step {
  const find = (g: Grid, key: string) => g.tiles.find((t) => t.id === key) ?? g.scopes.find((s) => s.id === key) ?? null;
  switch (command.kind) {
    case "place":
      return { command, subject: id ? find(after, id) : null, carried: 1 };
    case "remove":
      return { command, subject: find(before, command.id), carried: 1 };
    case "setText":
    case "setName":
      return { command, subject: find(after, command.id), carried: 1 };
    case "resize":
      return { command, subject: find(after, command.owner), carried: 1 };
    case "move": {
      const scopes = before.scopes.filter((s) => covers(command.from, bounds(before, s)));
      const inScope = (t: Grid["tiles"][number]) => scopes.some((s) => covers(bounds(before, s), footprint(before, t)));
      const tiles = before.tiles.filter((t) => covers(command.from, footprint(before, t)) && !inScope(t));
      const carried = [...scopes, ...tiles];
      return { command, subject: carried.length === 1 ? carried[0]! : null, carried: carried.length };
    }
  }
}

export class Document {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private listeners = new Set<(grid: Grid, dc: number, dr: number) => void>();
  private histories = new Set<(history: { past: Step[]; future: Step[] }) => void>();

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

  /** What undo would take back, oldest first, and what redo would do again, next first. */
  history(): { past: Step[]; future: Step[] } {
    return { past: this.past.map((e) => e.step), future: this.future.map((e) => e.step) };
  }

  /** Called with the history after every change, after the grid's listeners. */
  onHistory(listen: (history: { past: Step[]; future: Step[] }) => void): () => void {
    this.histories.add(listen);
    return () => this.histories.delete(listen);
  }

  run(command: Command, mark?: unknown): { ok: boolean; dc: number; dr: number; id?: string } {
    const made = apply(this.grid, command);
    if (!made.ok) return { ok: false, dc: 0, dr: 0 };
    this.past.push({ grid: this.grid, mark, step: stepOf(command, this.grid, made.grid, made.id) });
    this.future = [];
    this.replace(made.grid, made.dc, made.dr);
    this.store.record("run", command);
    return { ok: true, dc: made.dc, dr: made.dr, id: made.id };
  }

  /**
   * Back `steps` steps, one at a time, as that many undos would go: each redo entry keeps
   * the mark the window had when it was undone, which is the mark of the step undone just
   * before it. The mark handed back is the last step's.
   */
  undo(mark?: unknown, steps = 1): { ok: boolean; mark?: unknown } {
    if (steps < 1 || this.past.length === 0) return { ok: false };
    let held = mark;
    let target: Grid = this.grid;
    for (let i = 0; i < steps && this.past.length > 0; i++) {
      const before = this.past.pop()!;
      this.future.unshift({ grid: target, mark: held, step: before.step });
      target = before.grid;
      held = before.mark;
      this.store.record("undo", null);
    }
    this.replace(target, 0, 0);
    return { ok: true, mark: held };
  }

  redo(mark?: unknown, steps = 1): { ok: boolean; mark?: unknown } {
    if (steps < 1 || this.future.length === 0) return { ok: false };
    let held = mark;
    let target: Grid = this.grid;
    for (let i = 0; i < steps && this.future.length > 0; i++) {
      const next = this.future.shift()!;
      this.past.push({ grid: target, mark: held, step: next.step });
      target = next.grid;
      held = next.mark;
      this.store.record("redo", null);
    }
    this.replace(target, 0, 0);
    return { ok: true, mark: held };
  }

  private replace(grid: Grid, dc: number, dr: number): void {
    this.grid = grid;
    this.store.saveDocument(grid);
    for (const listen of this.listeners) listen(grid, dc, dr);
    const history = this.history();
    for (const listen of this.histories) listen(history);
  }
}
