/**
 * The lattice is uniform, so a track's position is its index times the pitch. These are the
 * only numbers that convert between the three spaces: cell indices, world pixels, and
 * screen pixels.
 */

export const CELL = 62;
export const GUTTER = 10;
export const PITCH = CELL + GUTTER;
export const RADIUS = 9;

export interface Camera {
  x: number;
  y: number;
  k: number;
}

/** World pixels for the top-left of a cell. */
export const worldX = (index: number): number => index * PITCH;

/** The inclusive index range visible in a viewport of `size` screen pixels. */
export function visible(offset: number, size: number, k: number): [number, number] {
  const first = Math.floor(-offset / k / PITCH) - 1;
  const last = Math.ceil((-offset + size) / k / PITCH);
  return [first, last];
}

/**
 * The cell under a screen point, or null when the point is in a gutter.
 *
 * Rounding the gutter into its neighbouring cell would mean something is always hovered,
 * which reads as a lingering selection rather than as a pointer. The gaps are part of the
 * page, not part of the cells they separate.
 */
export function cellAt(camera: Camera, sx: number, sy: number): [number, number] | null {
  const wx = (sx - camera.x) / camera.k;
  const wy = (sy - camera.y) / camera.k;
  const ci = Math.floor(wx / PITCH);
  const ri = Math.floor(wy / PITCH);
  const withinX = wx - ci * PITCH;
  const withinY = wy - ri * PITCH;
  if (withinX > CELL || withinY > CELL) return null;
  return [ci, ri];
}
