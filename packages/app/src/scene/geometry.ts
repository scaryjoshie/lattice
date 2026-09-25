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

/**
 * The camera that shows every region whole, centred in a viewport with `margin` screen
 * pixels clear on every side, at no more than the drawn size: home frames what is there
 * rather than a fixed place. With nothing to show, the drawn size about the origin.
 */
export function framing(
  regions: readonly { ci: number; ri: number; span: number; rows: number }[],
  width: number,
  height: number,
  margin: number,
): Camera {
  if (regions.length === 0) return { x: width / 2, y: height / 2, k: 1 };
  const c0 = Math.min(...regions.map((r) => r.ci));
  const r0 = Math.min(...regions.map((r) => r.ri));
  const c1 = Math.max(...regions.map((r) => r.ci + r.span));
  const r1 = Math.max(...regions.map((r) => r.ri + r.rows));
  const w = worldX(c1) - worldX(c0);
  const h = worldX(r1) - worldX(r0);
  const k = Math.min(1, (width - 2 * margin) / w, (height - 2 * margin) / h);
  return { x: width / 2 - (worldX(c0) + w / 2) * k, y: height / 2 - (worldX(r0) + h / 2) * k, k };
}
