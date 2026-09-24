/**
 * Marks are path data drawn onto the canvas with everything else, so there is one layer
 * and one z-order — a DOM layer that once held them sat above the canvas and re-rasterised
 * on every zoom frame. The data lives with each occupant; this is how it is drawn.
 */
const cache = new Map<string, Path2D>();

export function path(d: string): Path2D {
  let p = cache.get(d);
  if (!p) {
    p = new Path2D(d);
    cache.set(d, p);
  }
  return p;
}

/** The mark's side, as a fraction of the cell. */
export const MARK = 0.32;
export const MARK_UNITS = 24;
