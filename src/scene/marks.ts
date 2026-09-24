import type { Stroke } from "../providers/index.ts";

/**
 * Marks are path data drawn onto the canvas with everything else, so there is one layer
 * and one z-order — a DOM layer that once held them sat above the canvas and re-rasterised
 * on every zoom frame. A provider's mark lives with the provider; the browser is a family
 * of the grid rather than a program, so its mark lives here.
 */
export const BROWSER: readonly Stroke[] = [
  { d: "M5.2 4.2h13.6a2.6 2.6 0 012.6 2.6v10.4a2.6 2.6 0 01-2.6 2.6H5.2a2.6 2.6 0 01-2.6-2.6V6.8a2.6 2.6 0 012.6-2.6z", width: 2 },
  { d: "M2.6 9.1h18.8", width: 2 },
];

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
