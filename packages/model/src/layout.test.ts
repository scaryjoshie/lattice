import { describe, expect, test } from "bun:test";
import { apply } from "./command.ts";
import { footprint, type Grid, proposeMove, type Tile } from "./grid.ts";
import { layout, withText } from "./layout.ts";
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
const title = (id: string, ci: number, ri: number, text: string): Tile => ({ id, family: "text", style: "title", text, columnId: `x${ci}`, rowId: `y${ri}` });
const note = (id: string, ci: number, ri: number, text: string, cap?: { span?: number; rows?: number }): Tile => ({
  id, family: "text", style: "note", text, columnId: `x${ci}`, rowId: `y${ri}`, cap,
});
const at = (g: Grid, id: string) => footprint(g, g.tiles.find((t) => t.id === id)!);

describe("text by arithmetic", () => {
  test("width is characters times size times the advance", () => {
    expect(spanFor("title", "auth")).toBe(2);
    expect(spanFor("title", "research")).toBe(3);
    expect(spanFor("title", "a")).toBe(1);
    expect(spanFor("title", "one\nlonger line here")).toBe(spanFor("title", "longer line here"));
  });

  test("wrapping keeps the writer's breaks and fits by count", () => {
    // A two-cell note has 1.6 cells of room, fourteen characters at 0.19 of a cell each.
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

describe("layout", () => {
  test("a run's extent is what its words need", () => {
    const g = world([title("t", 2, 2, "research")]);
    expect(at(g, "t")).toEqual({ ci: 2, ri: 2, span: 3, rows: 1 });
  });

  test("a host in the way stops it, and moving the host away lets it breathe", () => {
    const g = world([title("t", 2, 2, "research"), host("h", 4, 2)]);
    expect(at(g, "t").span).toBe(2);
    const moved = apply(g, { kind: "move", from: at(g, "h"), to: { ci: 4, ri: 5, span: 1, rows: 1 } }).grid;
    expect(at(moved, "t").span).toBe(3);
  });

  test("text may not leave its scope, and may not enter one", () => {
    const inside = world([title("t", 2, 1, "research")], [{ id: "s", name: "s", hue: 0, columnStart: "x2", columnEnd: "x3", rowStart: "y1", rowEnd: "y3" }]);
    expect(at(inside, "t").span).toBe(2);
    const outside = world([title("t", 0, 1, "research")], [{ id: "s", name: "s", hue: 0, columnStart: "x2", columnEnd: "x3", rowStart: "y1", rowEnd: "y3" }]);
    expect(at(outside, "t").span).toBe(2);
  });

  test("two runs in one row: the earlier is bounded by the later one's origin, the later by the earlier's extent", () => {
    const g = world([title("a", 1, 1, "research"), title("b", 3, 1, "research")]);
    expect(at(g, "a").span).toBe(2);
    expect(at(g, "b").span).toBe(3);
  });

  test("a cap fixes an axis and the words wrap inside it; height follows", () => {
    const g = world([note("n", 1, 1, "the quick brown fox jumps over the lazy dog again and again", { span: 2 })]);
    const f = at(g, "n");
    expect(f.span).toBe(2);
    expect(f.rows).toBe(cellsFor("note", linesFor("note", "the quick brown fox jumps over the lazy dog again and again", 2)));
    expect(f.rows).toBeGreaterThan(1);
  });

  test("a run yields: a move is judged against runs as they are, not as they would grow", () => {
    // A title wanting five cells, cut to two by the scope beside it. Moving the scope one
    // cell further away must not be refused by the room the title would take back.
    const scope = { id: "infra", name: "infra", hue: 1, columnStart: "x4", columnEnd: "x6", rowStart: "y0", rowEnd: "y2" };
    const g = world([title("t", 2, 1, "a very long title here"), host("h", 5, 1)], [scope]);
    expect(at(g, "t").span).toBe(2);
    const from = { ci: 4, ri: 0, span: 3, rows: 3 };
    const v = proposeMove(g, from, { ...from, ci: 5 });
    expect(v.ok).toBe(true);
    const moved = apply(g, { kind: "move", from, to: { ...from, ci: 5 } }).grid;
    expect(at(moved, "t").span).toBe(3);
    // Onto the title's visible cells is still refused: the text is there.
    expect(proposeMove(g, from, { ...from, ci: 2 }).ok).toBe(false);
  });

  test("a draft is laid out without touching the document", () => {
    const g = world([title("t", 2, 2, "a")]);
    expect(at(g, "t").span).toBe(1);
    const typing = withText(g, "t", "a much longer title");
    expect(at(typing, "t").span).toBe(spanFor("title", "a much longer title"));
    expect(at(g, "t").span).toBe(1);
    expect(layout(g)).toBe(layout(g));
  });
});
