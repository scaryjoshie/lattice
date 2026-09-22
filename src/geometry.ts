/**
 * A ruled grid: square cells sharing their edges, with no gutter. A track's position is
 * its index times the cell size, and a gridline is the boundary between two cells rather
 * than a gap between two shapes.
 */

export const CELL = 72;
export const PITCH = CELL;

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

/** Screen point to the cell under it. With no gutter every point is in some cell. */
export function cellAt(camera: Camera, sx: number, sy: number): [number, number] {
  return [
    Math.floor((sx - camera.x) / camera.k / PITCH),
    Math.floor((sy - camera.y) / camera.k / PITCH),
  ];
}
