import { describe, expect, test } from "bun:test";
import {
  applied,
  bounds,
  close,
  ensureTracks,
  footprint,
  type Grid,
  insertColumnsAt,
  proposeMove,
  proposeResize,
  push,
  seed,
  type Tile,
  wellFormed,
} from "./grid.ts";
import { cells, contains, covers, overlaps, type Region } from "./region.ts";

/**
 * The model, from Bun, with no browser. These began as throwaway probes that found real
 * bugs by asking the model directly; the eye had missed every one of them.
 *
 * `grid` builds a world from indices so a case can be read at a glance: `t("a", 3, 2)` is
 * a one-cell tile at column 3, row 2; `s("auth", 2, 1, 3, 4)` is a scope of three columns
 * and four rows from (2, 1).
 */
const t = (id: string, ci: number, ri: number, span = 1, rows = 1): [string, number, number, number, number] => [id, ci, ri, span, rows];
const s = (id: string, ci: number, ri: number, span: number, rows: number): [string, number, number, number, number] => [id, ci, ri, span, rows];

function grid(
  tiles: readonly (readonly [string, number, number, number, number])[],
  scopes: readonly (readonly [string, number, number, number, number])[] = [],
  size = { columns: 12, rows: 8 },
): Grid {
  const columns = Array.from({ length: size.columns }, (_, i) => ({ id: `c${i}` }));
  const rows = Array.from({ length: size.rows }, (_, i) => ({ id: `r${i}` }));
  return {
    columns,
    rows,
    tiles: tiles.map(([id, ci, ri, span, rows_]) => ({
      id,
      kind: span === 1 && rows_ === 1 ? "claude" : "text",
      columnId: `c${ci}`,
      rowId: `r${ri}`,
      ...(span === 1 && rows_ === 1 ? {} : { style: "title" as const, text: id, span, rows: rows_ }),
    })),
    scopes: scopes.map(([id, ci, ri, span, rows_], n) => ({
      id,
      name: id,
      hue: n,
      columnStart: `c${ci}`,
      columnEnd: `c${ci + span - 1}`,
      rowStart: `r${ri}`,
      rowEnd: `r${ri + rows_ - 1}`,
    })),
    links: [],
  };
}

const at = (g: Grid, id: string): Region => footprint(g, g.tiles.find((x) => x.id === id) as Tile);
const scope = (g: Grid, id: string): Region => bounds(g, g.scopes.find((x) => x.id === id)!);
const region = (ci: number, ri: number, span = 1, rows = 1): Region => ({ ci, ri, span, rows });

/** Two things cannot be in one cell. The invariant every operation must keep. */
function noOverlap(g: Grid): void {
  const seen = new Map<string, string>();
  for (const tile of g.tiles) {
    for (const [ci, ri] of cells(footprint(g, tile))) {
      const key = `${ci},${ri}`;
      expect(seen.get(key), `${tile.id} and ${seen.get(key)} share ${key}`).toBeUndefined();
      seen.set(key, tile.id);
    }
  }
}

/** Nothing is ever pushed out of its worktree: a tile in a scope before is in it after. */
function scopesKeepTheirTiles(before: Grid, after: Grid): void {
  for (const sc of before.scopes) {
    const b = bounds(before, sc);
    for (const tile of before.tiles) {
      if (!covers(b, footprint(before, tile))) continue;
      const a = after.scopes.find((x) => x.id === sc.id)!;
      const moved = after.tiles.find((x) => x.id === tile.id)!;
      expect(covers(bounds(after, a), footprint(after, moved)), `${tile.id} left ${sc.id}`).toBe(true);
    }
  }
}

describe("region", () => {
  test("the three questions", () => {
    const r = region(2, 1, 3, 2);
    expect(contains(r, 4, 2)).toBe(true);
    expect(contains(r, 5, 2)).toBe(false);
    expect(covers(r, region(3, 1, 2, 1))).toBe(true);
    expect(covers(r, region(3, 1, 3, 1))).toBe(false);
    expect(overlaps(r, region(4, 2, 5, 5))).toBe(true);
    expect(overlaps(r, region(5, 2))).toBe(false);
    expect([...cells(region(0, 0, 2, 2))]).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
  });
});

describe("tracks", () => {
  test("inserting a track touches no stored position", () => {
    const g = grid([t("a", 3, 2)]);
    const next = insertColumnsAt(g, 1, ["x"]);
    expect(next.tiles).toBe(g.tiles);
    expect(at(next, "a").ci).toBe(4);
    expect(next.tiles[0]?.columnId).toBe("c3");
  });

  test("tracks are made on demand, before and after", () => {
    const g = grid([t("a", 0, 0)], [], { columns: 3, rows: 3 });
    const made = ensureTracks(g, region(-2, 4, 1, 1));
    expect([made.dc, made.dr]).toEqual([2, 0]);
    expect(made.grid.columns.length).toBe(5);
    expect(made.grid.rows.length).toBe(5);
    expect(at(made.grid, "a")).toEqual(region(2, 0));
  });
});

describe("wellFormed and close", () => {
  const g = grid([t("run", 3, 1, 2, 1), t("a", 6, 6)], [s("auth", 2, 1, 3, 4)]);

  test("a region may not cut a tile", () => {
    expect(wellFormed(g, region(3, 1))).toBe(false);
    expect(wellFormed(g, region(3, 1, 2, 1))).toBe(true);
  });

  test("a region may not cut a scope, but may lie inside it or around it", () => {
    expect(wellFormed(g, region(4, 3, 2, 1))).toBe(false);
    expect(wellFormed(g, region(2, 2, 3, 1))).toBe(true);
    expect(wellFormed(g, region(1, 0, 6, 6))).toBe(true);
  });

  test("closure grows over what it partly touches until nothing straddles", () => {
    expect(close(g, region(4, 1))).toEqual(region(3, 1, 2, 1));
    expect(close(g, region(4, 3, 2, 1))).toEqual(region(2, 1, 4, 4));
    expect(close(g, region(6, 6))).toEqual(region(6, 6));
  });
});

describe("proposeMove", () => {
  test("into empty space: legal, nothing comes back", () => {
    const g = grid([t("a", 1, 1)]);
    const v = proposeMove(g, at(g, "a"), region(4, 4));
    expect(v.ok).toBe(true);
    expect(v.swaps).toBe(false);
    expect(v.moves).toEqual([{ id: "a", ci: 4, ri: 4 }]);
  });

  test("onto another tile of the same size: an exchange, both move", () => {
    const g = grid([t("a", 1, 1), t("b", 5, 5)]);
    const v = proposeMove(g, at(g, "a"), at(g, "b"));
    expect(v.ok).toBe(true);
    expect(v.swaps).toBe(true);
    expect(v.moves).toEqual([{ id: "a", ci: 5, ri: 5 }, { id: "b", ci: 1, ri: 1 }]);
    noOverlap(applied(g, v.moves).grid);
  });

  test("a two-cell run half over another two-cell run is refused", () => {
    const g = grid([t("p", 1, 1, 2, 1), t("q", 5, 1, 2, 1)]);
    expect(proposeMove(g, at(g, "p"), region(4, 1, 2, 1)).ok).toBe(false);
    expect(proposeMove(g, at(g, "p"), region(5, 1, 2, 1)).ok).toBe(true);
  });

  test("a two-cell run and two single tiles trade places", () => {
    const g = grid([t("p", 1, 1, 2, 1), t("a", 5, 1), t("b", 6, 1)]);
    const v = proposeMove(g, at(g, "p"), region(5, 1, 2, 1));
    expect(v.ok).toBe(true);
    expect(v.moves).toHaveLength(3);
    noOverlap(applied(g, v.moves).grid);
  });

  test("a region overlapping its own destination slides, into free space only", () => {
    const g = grid([t("p", 1, 1, 3, 1), t("a", 5, 1)]);
    expect(proposeMove(g, at(g, "p"), region(2, 1, 3, 1)).ok).toBe(true);
    expect(proposeMove(g, at(g, "p"), region(3, 1, 3, 1)).ok).toBe(false);
  });

  test("a tile may cross a scope boundary whole; only cutting a scope is refused", () => {
    const g = grid([t("a", 3, 2), t("b", 8, 2)], [s("auth", 2, 1, 3, 4)]);
    expect(proposeMove(g, at(g, "a"), region(6, 2)).ok).toBe(true);
    expect(proposeMove(g, at(g, "b"), region(4, 3)).ok).toBe(true);
    // A region straddling the scope's edge cannot be exchanged without tearing it.
    expect(proposeMove(g, region(4, 2, 2, 1), region(6, 2, 2, 1)).ok).toBe(false);
    expect(proposeMove(g, at(g, "b"), region(4, 2, 2, 1)).ok).toBe(false);
  });

  test("a region that is exactly a scope carries the scope and everything in it", () => {
    const g = grid([t("a", 3, 2), t("run", 2, 1, 2, 1)], [s("auth", 2, 1, 3, 4)]);
    const v = proposeMove(g, scope(g, "auth"), region(6, 1, 3, 4));
    expect(v.ok).toBe(true);
    expect(v.moves.map((m) => m.id).sort()).toEqual(["a", "auth", "run"]);
    const next = applied(g, v.moves).grid;
    expect(scope(next, "auth")).toEqual(region(6, 1, 3, 4));
    expect(at(next, "a")).toEqual(region(7, 2));
    scopesKeepTheirTiles(g, next);
  });

  test("two scopes of one size may swap", () => {
    const g = grid([t("a", 3, 2), t("b", 8, 2)], [s("x", 2, 1, 3, 3), s("y", 7, 1, 3, 3)]);
    const v = proposeMove(g, scope(g, "x"), scope(g, "y"));
    expect(v.ok).toBe(true);
    expect(v.swaps).toBe(true);
    const next = applied(g, v.moves).grid;
    expect(at(next, "a")).toEqual(region(8, 2));
    expect(at(next, "b")).toEqual(region(3, 2));
    noOverlap(next);
  });

  test("a move past the first track makes tracks and reports the shift", () => {
    const g = grid([t("a", 0, 0)], [], { columns: 3, rows: 3 });
    const v = proposeMove(g, at(g, "a"), region(-1, 0));
    expect(v.ok).toBe(true);
    const made = applied(g, v.moves);
    expect(made.dc).toBe(1);
    expect(at(made.grid, "a")).toEqual(region(0, 0));
  });
});

describe("push", () => {
  test("nothing moves until something is up against it, then by the overlap only", () => {
    const g = grid([t("a", 4, 1), t("b", 6, 1), t("c", 9, 1)]);
    const orig = region(1, 1, 2, 1);
    const moves = push(g, orig, { ...orig, span: 4 }, "col", 1, new Set());
    expect(moves).toEqual([{ id: "a", ci: 5, ri: 1 }]);
    const far = push(g, orig, { ...orig, span: 6 }, "col", 1, new Set());
    expect(far).toEqual([{ id: "a", ci: 7, ri: 1 }, { id: "b", ci: 8, ri: 1 }]);
  });

  test("a scope is pushed whole, with its contents", () => {
    const g = grid([t("a", 5, 1)], [s("x", 4, 0, 3, 3)]);
    const moves = push(g, region(1, 1), region(1, 1, 5, 1), "col", 1, new Set());
    expect(moves.find((m) => m.id === "x")).toEqual({ id: "x", ci: 6, ri: 0 });
    expect(moves.find((m) => m.id === "a")).toEqual({ id: "a", ci: 7, ri: 1 });
  });

  test("only what lies across the pusher moves", () => {
    const g = grid([t("a", 4, 1), t("b", 4, 5)]);
    const moves = push(g, region(1, 1), region(1, 1, 5, 1), "col", 1, new Set());
    expect(moves.map((m) => m.id)).toEqual(["a"]);
  });
});

describe("proposeResize", () => {
  const g = grid([t("a", 3, 2), t("b", 2, 3), t("out", 6, 2)], [s("auth", 2, 1, 3, 4)]);

  test("an interior line inserts: the far side shifts and the world beyond is pushed", () => {
    const v = proposeResize(g, "auth", "col", 3, 1);
    expect(v.ok).toBe(true);
    expect(v.after).toEqual(region(2, 1, 4, 4));
    expect(v.band).toEqual(region(3, 1, 1, 4));
    const next = applied(g, v.moves).grid;
    expect(at(next, "a")).toEqual(region(4, 2));
    expect(at(next, "b")).toEqual(region(2, 3));
    // The scope now ends at column 5 and is not up against `out` at 6, so `out` stays.
    expect(at(next, "out")).toEqual(region(6, 2));
    noOverlap(next);
    scopesKeepTheirTiles(g, next);
  });

  test("an edge dragged outward grows the scope and pushes", () => {
    const v = proposeResize(g, "auth", "col", 5, 2);
    expect(v.ok).toBe(true);
    expect(v.after).toEqual(region(2, 1, 5, 4));
    const next = applied(g, v.moves).grid;
    // The scope reaches column 6, one cell into `out`, so `out` moves by exactly one.
    expect(at(next, "out")).toEqual(region(7, 2));
    expect(at(next, "a")).toEqual(region(3, 2));
  });

  test("an edge dragged inward removes tracks and pushes the contents inward", () => {
    const v = proposeResize(g, "auth", "col", 2, 1);
    expect(v.ok).toBe(true);
    expect(v.after).toEqual(region(3, 1, 2, 4));
    const next = applied(g, v.moves).grid;
    expect(at(next, "b")).toEqual(region(3, 3));
    expect(at(next, "a")).toEqual(region(3, 2));
    scopesKeepTheirTiles(g, next);
    noOverlap(next);
  });

  test("an inward drag is refused when something would have to leave the far side", () => {
    const full = grid([t("a", 2, 2), t("b", 3, 2), t("c", 4, 2)], [s("auth", 2, 1, 3, 4)]);
    expect(proposeResize(full, "auth", "col", 2, 1).ok).toBe(false);
    expect(proposeResize(full, "auth", "col", 5, -1).ok).toBe(false);
    expect(proposeResize(full, "auth", "row", 1, 1).ok).toBe(true);
  });

  test("every legal resize of the seed keeps the invariants", () => {
    const g0 = seed();
    for (const sc of g0.scopes) {
      const b = bounds(g0, sc);
      for (const axis of ["col", "row"] as const) {
        const start = axis === "col" ? b.ci : b.ri;
        const len = axis === "col" ? b.span : b.rows;
        for (let line = start; line <= start + len; line++) {
          for (const n of [-2, -1, 1, 2]) {
            const v = proposeResize(g0, sc.id, axis, line, n);
            if (!v.ok) continue;
            const next = applied(g0, v.moves).grid;
            noOverlap(next);
            scopesKeepTheirTiles(g0, next);
          }
        }
      }
    }
  });

  test("a run resizes by its edges only, and the axis dragged becomes a cap", () => {
    const g1 = grid([t("run", 2, 1, 2, 1), t("a", 4, 1)]);
    const out = proposeResize(g1, "run", "col", 4, 1);
    expect(out.ok).toBe(true);
    expect(at(applied(g1, out.moves).grid, "a")).toEqual(region(5, 1));
    const inward = proposeResize(g1, "run", "col", 4, -1);
    expect(inward.ok).toBe(true);
    expect(applied(g1, inward.moves).grid.tiles.find((x) => x.id === "run")?.cap).toEqual({ span: 1, rows: undefined });
    expect(proposeResize(g1, "run", "col", 3, 1).ok).toBe(false);
  });

  test("a loose run pushes a scope out of its way; a run inside a scope may not leave it", () => {
    const loose = grid([t("run", 0, 2, 2, 1)], [s("auth", 2, 1, 3, 4)]);
    const v = proposeResize(loose, "run", "col", 2, 1);
    expect(v.ok).toBe(true);
    expect(scope(applied(loose, v.moves).grid, "auth")).toEqual(region(3, 1, 3, 4));
    const inside = grid([t("run", 3, 2, 2, 1)], [s("auth", 2, 1, 3, 4)]);
    expect(proposeResize(inside, "run", "col", 5, 1).ok).toBe(false);
  });

  test("a corner is two resizes, the second on the grid the first leaves", () => {
    const g0 = seed();
    const auth = g0.scopes[0]!;
    const b = bounds(g0, auth);
    const col = proposeResize(g0, auth.id, "col", b.ci + 1, -3);
    expect(col.ok).toBe(true);
    const mid = applied(g0, col.moves);
    const row = proposeResize(mid.grid, auth.id, "row", b.ri + 2 + mid.dr, 1);
    expect(row.ok).toBe(true);
    const fin = applied(mid.grid, row.moves).grid;
    noOverlap(fin);
    scopesKeepTheirTiles(g0, fin);
    // Three columns inserted at an interior line, dragged left, grow the scope leftward past
    // the first track, so one track is prepended and every index shifts by it.
    expect(mid.dc).toBe(1);
    expect(bounds(fin, fin.scopes[0]!)).toEqual(region(b.ci - 3 + mid.dc, b.ri, b.span + 3, b.rows + 1));
  });
});
