import { describe, expect, test } from "bun:test";
import { apply, propose } from "./command.ts";
import { bounds, footprint, type Grid, type Host } from "./grid.ts";
import type { Region } from "./region.ts";

/** A small world: one scope with a tile in it, and a loose tile beside. */
function world(): Grid {
  const columns = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}` }));
  const rows = Array.from({ length: 6 }, (_, i) => ({ id: `y${i}` }));
  return {
    columns,
    rows,
    tiles: [
      { id: "a", family: "host", surface: "terminal", columnId: "x3", rowId: "y2" },
      { id: "b", family: "host", surface: "terminal", columnId: "x7", rowId: "y2" },
    ],
    scopes: [{ id: "auth", name: "auth", hue: 0, columnStart: "x2", columnEnd: "x4", rowStart: "y1", rowEnd: "y4" }],
    links: [],
  };
}
const at = (g: Grid, id: string): Region => footprint(g, g.tiles.find((t) => t.id === id)!);

describe("commands", () => {
  test("apply judges for itself: a refused command changes nothing", () => {
    const g = world();
    // Cells 4..5 straddle the scope's right edge, which cuts the scope: refused.
    const bad = { kind: "move", from: { ci: 4, ri: 2, span: 2, rows: 1 }, to: { ci: 6, ri: 2, span: 2, rows: 1 } } as const;
    expect(propose(g, bad).ok).toBe(false);
    const done = apply(g, bad);
    expect(done.ok).toBe(false);
    expect(done.grid).toBe(g);
  });

  test("a legal move is applied whole", () => {
    const g = world();
    const done = apply(g, { kind: "move", from: at(g, "a"), to: at(g, "b") });
    expect(done.ok).toBe(true);
    expect(at(done.grid, "a")).toEqual(at(g, "b"));
    expect(at(done.grid, "b")).toEqual(at(g, "a"));
  });

  test("a corner resize is two resizes, answered in the model's indices", () => {
    const g = world();
    const v = propose(g, { kind: "resize", owner: "auth", col: { line: 2, n: -3 }, row: { line: 5, n: 1 } });
    expect(v.ok).toBe(true);
    expect(v.after).toEqual({ ci: -1, ri: 1, span: 6, rows: 5 });
    const done = apply(g, { kind: "resize", owner: "auth", col: { line: 2, n: -3 }, row: { line: 5, n: 1 } });
    expect(done.dc).toBe(1);
    expect(bounds(done.grid, done.grid.scopes[0]!)).toEqual({ ci: 0, ri: 1, span: 6, rows: 5 });
  });

  test("a refused resize still says what it would have made", () => {
    const g: Grid = { ...world(), tiles: [
      { id: "a", family: "host", surface: "terminal", columnId: "x2", rowId: "y2" },
      { id: "b", family: "host", surface: "terminal", columnId: "x3", rowId: "y2" },
      { id: "c", family: "host", surface: "terminal", columnId: "x4", rowId: "y2" },
    ] };
    const v = propose(g, { kind: "resize", owner: "auth", col: { line: 5, n: -1 } });
    expect(v.ok).toBe(false);
    expect(v.moves).toEqual([]);
    expect(v.bands).toHaveLength(1);
  });

  test("place makes tracks before the first, and reports the shift and the id", () => {
    const g = world();
    expect(propose(g, { kind: "place", ci: 3, ri: 2, what: { family: "host", surface: "terminal" } }).ok).toBe(false);
    // A cell inside a run's extent, not its origin, is held too: the model says so, not the view.
    const withRun: Grid = { ...g, tiles: [...g.tiles, { id: "r", family: "text", style: "title", text: "research", columnId: "x5", rowId: "y5", span: 3, rows: 1 }] };
    expect(propose(withRun, { kind: "place", ci: 7, ri: 5, what: { family: "host", surface: "terminal" } }).ok).toBe(false);
    expect(propose(withRun, { kind: "place", ci: 8, ri: 5, what: { family: "host", surface: "terminal" } }).ok).toBe(true);
    const done = apply(g, { kind: "place", ci: -2, ri: 0, what: { family: "host", surface: "terminal" } });
    expect(done.ok).toBe(true);
    expect(done.dc).toBe(2);
    expect(done.id).toBeDefined();
    expect(at(done.grid, done.id!)).toEqual({ ci: 0, ri: 0, span: 1, rows: 1 });
    expect(at(done.grid, "a")).toEqual({ ci: 5, ri: 2, span: 1, rows: 1 });
  });

  test("remove, setText and setName refuse an unknown id and otherwise apply", () => {
    const g = world();
    expect(apply(g, { kind: "remove", id: "zz" }).ok).toBe(false);
    expect(apply(g, { kind: "remove", id: "b" }).grid.tiles.map((t) => t.id)).toEqual(["a"]);
    expect((apply(g, { kind: "setName", id: "a", name: "  ada  " }).grid.tiles[0] as Host).name).toBe("ada");
    expect((apply(g, { kind: "setName", id: "a", name: "  " }).grid.tiles[0] as Host).name).toBeUndefined();
  });
});
