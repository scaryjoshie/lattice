import type { Region } from "@lattice/model";

/** A point in cells: column and row, fractional. */
export interface Point {
  readonly c: number;
  readonly r: number;
}

/** How far a line goes straight out of its edge, at least, before it turns: half a cell. */
const FORWARD = 0.5;

/**
 * The line between two linked things, as the points it turns at, in cells. It leaves the
 * centre of an edge of `from` toward the facing edge of `to`, both on the axis where the
 * two are further apart, so the two edges face each other: a straight line when their
 * centres line up, else a Z that turns at the halfway line between them. It then runs on,
 * straight, to the middle of `to`, so two neighbours' link is not hidden between them.
 *
 * A line always goes forward out of its edge for at least half a cell before it turns,
 * never sideways first. Where the gap is narrower than that, the turn is past it, over the
 * partner, which it can be since lines run over tiles; the partner's middle is at least
 * half a cell past its edge, so the line never overshoots it, and where the turn lands on
 * the middle's column or row the Z is an L.
 *
 * The Z is React Flow's smooth step (`getSmoothStepPath` in @xyflow/system, MIT) for
 * facing sides, which is the only case this side rule produces. Corners are rounded by
 * whoever draws the points.
 */
export function route(from: Region, to: Region): Point[] {
  const gapC = Math.max(to.ci - (from.ci + from.span), from.ci - (to.ci + to.span));
  const gapR = Math.max(to.ri - (from.ri + from.rows), from.ri - (to.ri + to.rows));
  const mid = (r: Region): Point => ({ c: r.ci + r.span / 2, r: r.ri + r.rows / 2 });
  const a = mid(from);
  const b = mid(to);
  // Halfway to the facing edge, but never less than FORWARD out of this one.
  const turnAt = (start: number, edge: number, sign: number) => start + sign * Math.max(Math.abs(edge - start) / 2, FORWARD);
  if (gapC >= gapR) {
    const sign = b.c > a.c ? 1 : -1;
    const start = { c: sign > 0 ? from.ci + from.span : from.ci, r: a.r };
    if (start.r === b.r) return [start, b];
    const turn = turnAt(start.c, sign > 0 ? to.ci : to.ci + to.span, sign);
    return distinct([start, { c: turn, r: start.r }, { c: turn, r: b.r }, b]);
  }
  const sign = b.r > a.r ? 1 : -1;
  const start = { c: a.c, r: sign > 0 ? from.ri + from.rows : from.ri };
  if (start.c === b.c) return [start, b];
  const turn = turnAt(start.r, sign > 0 ? to.ri : to.ri + to.rows, sign);
  return distinct([start, { c: start.c, r: turn }, { c: b.c, r: turn }, b]);
}

/** Without a point that repeats the one before it, which is how a Z whose turn lands on
 *  the partner's middle becomes an L. */
const distinct = (points: Point[]): Point[] => points.filter((p, i) => i === 0 || p.c !== points[i - 1]!.c || p.r !== points[i - 1]!.r);
