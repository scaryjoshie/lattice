import { describe, expect, test } from "bun:test";
import { apply } from "./command.ts";
import { extentFor } from "./extent.ts";
import { footprint, type Grid, proposeMove, type Run, type Tile } from "./grid.ts";
import { cellsFor, clip, fits, linesFor, spanFor, wrap } from "./text.ts";

function world(tiles: Tile[], scopes: Grid["scopes"] = []): Grid {
  return {
    columns: Array.from({ length: 12 }, (_, i) => ({ id: `x${i}` })),
    rows: Array.from({ length: 8 }, (_, i) => ({ id: `y${i}` })),
    tiles,
    scopes,
    links: [],
  };
}
const host = (id: string, ci: number, ri: number): Tile => ({ id, family: "host", surface: "terminal", columnId: `x${ci}`, rowId: `y${ri}` });
/** A run as placed: one cell, its text not yet committed. */
const run = (id: string, ci: number, ri: number, text: string, style: "title" | "note" = "title"): Run =>
  ({ id, family: "text", style, text, columnId: `x${ci}`, rowId: `y${ri}`, span: 1, rows: 1 });
const at = (g: Grid, id: string) => footprint(g, g.tiles.find((t) => t.id === id)!);
/** Place a run and commit its text, the way the editor does. */
const committed = (g: Grid, r: Run): Grid => apply({ ...g, tiles: [...g.tiles, r] }, { kind: "setText", id: r.id, text: r.text }).grid;

describe("text by arithmetic", () => {
  test("width is characters times size times the advance", () => {
    expect(spanFor("title", "auth")).toBe(2);
    expect(spanFor("title", "research")).toBe(3);
    expect(spanFor("title", "a")).toBe(1);
    expect(spanFor("title", "one\nlonger line here")).toBe(spanFor("title", "longer line here"));
  });

  test("wrapping keeps the writer's breaks and fits by count", () => {
    expect(fits(0.19, 1.6)).toBe(14);
    expect(wrap("note", "the quick brown fox jumps", 2)).toEqual(["the quick", "brown fox", "jumps"]);
    expect(wrap("note", "a\n\nb", 3)).toEqual(["a", "", "b"]);
    expect(cellsFor("note", linesFor("note", "the quick brown fox jumps", 2))).toBe(2);
    expect(cellsFor("title", 2)).toBe(2);
  });

  test("a cut ends in an ellipsis", () => {
    expect(clip("research", 5)).toBe("rese…");
    expect(clip("ok", 5)).toBe("ok");
  });
});

describe("a run's extent", () => {
  test("is what its words need when committed", () => {
    const g = committed(world([]), run("t", 2, 2, "research"));
    expect(at(g, "t")).toEqual({ ci: 2, ri: 2, span: 3, rows: 1 });
  });

  test("is cut by a host in the way, and stays cut when the host leaves", () => {
    const g = committed(world([host("h", 4, 2)]), run("t", 2, 2, "research"));
    expect(at(g, "t").span).toBe(2);
    const moved = apply(g, { kind: "move", from: at(g, "h"), to: { ci: 4, ri: 5, span: 1, rows: 1 } }).grid;
    expect(at(moved, "t").span).toBe(2);
    // The room is there for the taking by a drag; the run does not take it on its own.
  });

  test("may not leave its scope, and may not enter one", () => {
    const scope = { id: "s", name: "s", hue: 0, columnStart: "x2", columnEnd: "x3", rowStart: "y1", rowEnd: "y3" };
    expect(at(committed(world([], [scope]), run("t", 2, 1, "research")), "t").span).toBe(2);
    expect(at(committed(world([], [scope]), run("t", 0, 1, "research")), "t").span).toBe(2);
  });

  test("a note wraps to the width it has and its height follows", () => {
    const g = committed(world([host("h", 3, 1)]), run("n", 1, 1, "the quick brown fox jumps over the lazy dog again and again", "note"));
    const f = at(g, "n");
    expect(f.span).toBe(2);
    expect(f.rows).toBe(cellsFor("note", linesFor("note", "the quick brown fox jumps over the lazy dog again and again", 2)));
    expect(f.rows).toBeGreaterThan(1);
  });

  test("a draft reaches as far as its words do without touching the document", () => {
    const g = committed(world([]), run("t", 2, 2, "a"));
    expect(at(g, "t").span).toBe(1);
    const tile = g.tiles.find((t) => t.id === "t") as Run;
    expect(extentFor(g, tile, "a much longer title").span).toBe(spanFor("title", "a much longer title"));
    expect(at(g, "t").span).toBe(1);
  });

  test("a run's cells are held like a host's: a move onto them is refused, beside them is not", () => {
    const g = committed(world([host("h", 8, 2)]), run("t", 2, 2, "research"));
    expect(proposeMove(g, at(g, "h"), { ci: 3, ri: 2, span: 1, rows: 1 }).ok).toBe(false);
    expect(proposeMove(g, at(g, "h"), { ci: 5, ri: 2, span: 1, rows: 1 }).ok).toBe(true);
  });
});
