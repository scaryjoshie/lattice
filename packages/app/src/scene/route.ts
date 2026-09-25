import type { Region } from "@lattice/model";

/** A point in cells: column and row, fractional. */
export interface Point {
  readonly c: number;
  readonly r: number;
}

/**
 * The line between two linked things, as the points it turns at, in cells. It leaves the
 * centre of an edge of `from` and enters the centre of an edge of `to`, on the axis where
 * the two are further apart, so the two edges face each other: a straight line when their
 * centres line up, else a Z that turns at the halfway line between them. Every link is one
 * of the two, so there is no case to patch. It then runs on, straight, to the middle of
 * `to`, so two neighbours' link is not hidden between them.
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
  if (gapC >= gapR) {
    const right = b.c > a.c;
    const start = { c: right ? from.ci + from.span : from.ci, r: a.r };
    const edge = right ? to.ci : to.ci + to.span;
    if (start.r === b.r) return [start, b];
    const turn = (start.c + edge) / 2;
    return [start, { c: turn, r: start.r }, { c: turn, r: b.r }, b];
  }
  const down = b.r > a.r;
  const start = { c: a.c, r: down ? from.ri + from.rows : from.ri };
  const edge = down ? to.ri : to.ri + to.rows;
  if (start.c === b.c) return [start, b];
  const turn = (start.r + edge) / 2;
  return [start, { c: start.c, r: turn }, { c: b.c, r: turn }, b];
}
