import { describe, expect, test } from "bun:test";
import type { Region } from "@lattice/model";
import { type Point, route } from "./route.ts";

const R = (ci: number, ri: number, span = 1, rows = 1): Region => ({ ci, ri, span, rows });
const P = (c: number, r: number): Point => ({ c, r });

/** Whether a point is strictly inside a region, off its edges. */
const inside = (g: Region, p: Point) => p.c > g.ci && p.c < g.ci + g.span && p.r > g.ri && p.r < g.ri + g.rows;
/** The centres of a region's four edges. */
const edgeCentres = (g: Region): Point[] => [
  P(g.ci + g.span / 2, g.ri),
  P(g.ci + g.span / 2, g.ri + g.rows),
  P(g.ci, g.ri + g.rows / 2),
  P(g.ci + g.span, g.ri + g.rows / 2),
];
const same = (a: Point, b: Point) => Math.abs(a.c - b.c) < 1e-9 && Math.abs(a.r - b.r) < 1e-9;

describe("route", () => {
  test("in line, a straight line from an edge centre into the partner's middle", () => {
    expect(route(R(0, 0), R(4, 0))).toEqual([P(1, 0.5), P(4.5, 0.5)]);
    expect(route(R(2, 5), R(2, 1))).toEqual([P(2.5, 5), P(2.5, 1.5)]);
  });

  test("neighbours: the line runs from the shared edge into the partner, not hidden", () => {
    expect(route(R(0, 0), R(1, 0))).toEqual([P(1, 0.5), P(1.5, 0.5)]);
  });

  test("a partner above and to the side: up, across halfway, up", () => {
    // A wide host with a partner above it, overlapping it across: the ends face top to
    // bottom, and the turn is halfway between, never on either of them.
    expect(route(R(0, 3, 3, 1), R(2, 0))).toEqual([P(1.5, 3), P(1.5, 2), P(2.5, 2), P(2.5, 0.5)]);
  });

  test("a partner level with an edge leaves by the far side, not along the edge", () => {
    // The partner's centre is level with the host's left edge; it is further below than
    // beside, so the line leaves the bottom and does not run down the host's side.
    const path = route(R(3, 2), R(2, 5, 2, 1));
    expect(path[0]).toEqual(P(3.5, 3));
    expect(path.at(-1)).toEqual(P(3, 5.5));
  });

  test("any two things: straight or a Z, from an edge centre into the partner's middle", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let i = 0; i < 2000; i++) {
      const a = R(rand(12), rand(12), 1 + rand(3), 1 + rand(3));
      const b = R(rand(12), rand(12), 1 + rand(3), 1 + rand(3));
      const apart = a.ci + a.span <= b.ci || b.ci + b.span <= a.ci || a.ri + a.rows <= b.ri || b.ri + b.rows <= a.ri;
      if (!apart) continue;
      const path = route(a, b);
      expect([2, 4]).toContain(path.length);
      expect(edgeCentres(a).some((p) => same(p, path[0]!))).toBe(true);
      expect(same(path.at(-1)!, P(b.ci + b.span / 2, b.ri + b.rows / 2))).toBe(true);
      for (let j = 1; j < path.length; j++) {
        const p = path[j - 1]!;
        const q = path[j]!;
        // Every segment runs along one axis.
        expect(p.c === q.c || p.r === q.r).toBe(true);
        // No segment passes through the source, and only the last enters the partner,
        // through the centre of the edge it faces.
        const last = j === path.length - 1;
        for (let t = 0; t <= 20; t++) {
          const x = P(p.c + ((q.c - p.c) * t) / 20, p.r + ((q.r - p.r) * t) / 20);
          expect(inside(a, x)).toBe(false);
          if (!last) expect(inside(b, x)).toBe(false);
        }
        if (last) expect(edgeCentres(b).some((e) => (e.c === q.c && Math.min(p.r, q.r) <= e.r && e.r <= Math.max(p.r, q.r)) || (e.r === q.r && Math.min(p.c, q.c) <= e.c && e.c <= Math.max(p.c, q.c)))).toBe(true);
      }
    }
  });
});
