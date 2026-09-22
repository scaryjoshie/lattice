/**
 * The lattice is uniform, so a track's position is its index times the pitch. These are the
 * only numbers that convert between the three spaces: cell indices, world pixels, and
 * screen pixels.
 */

export const CELL = 62;
export const GUTTER = 13;
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

/** Screen point to the cell under it. Fractional parts inside the gutter still round to a
 *  cell, which is what makes the gutter feel like part of the cell it borders. */
export function cellAt(camera: Camera, sx: number, sy: number): [number, number] {
  return [
    Math.floor((sx - camera.x) / camera.k / PITCH),
    Math.floor((sy - camera.y) / camera.k / PITCH),
  ];
}
