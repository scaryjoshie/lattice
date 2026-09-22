import { CELL, type Camera, PITCH, RADIUS, visible, worldX } from "./geometry.ts";

/**
 * The lattice is painted, never built. One canvas, redrawn from the camera, iterating only
 * the indices on screen — so the cost is the size of the window rather than the size of the
 * world, and nothing about it exists in the DOM to be reconciled.
 *
 * Cells are filled, never stroked. The page and the cell sit within a couple of percent of
 * each other, so the grid is felt through the gaps; the moment an edge becomes a real
 * stroke it reads as a spreadsheet.
 */

const PAGE = "#f5f5f6";
const EMPTY = "#eaeaec";
const HOVER = "#dfe0e4";
const FILLED = "#c9ccd4";

export interface Scene {
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
  /** "ci,ri" for every occupied cell. */
  occupied: ReadonlySet<string>;
  hover: readonly [number, number] | null;
}

export function paint(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { camera, width, height, dpr, occupied, hover } = scene;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, width, height);

  const [c0, c1] = visible(camera.x, width, camera.k);
  const [r0, r1] = visible(camera.y, height, camera.k);
  const size = CELL * camera.k;
  const radius = RADIUS * camera.k;

  for (let ri = r0; ri <= r1; ri++) {
    const y = worldX(ri) * camera.k + camera.y;
    for (let ci = c0; ci <= c1; ci++) {
      const x = worldX(ci) * camera.k + camera.x;
      const isHover = hover !== null && hover[0] === ci && hover[1] === ri;
      const isFilled = occupied.has(`${ci},${ri}`);
      ctx.fillStyle = isFilled ? FILLED : isHover ? HOVER : EMPTY;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, radius);
      ctx.fill();
    }
  }
}

/** Cells per screen, used only to decide when the lattice stops being worth drawing. */
export const density = (k: number): number => PITCH * k;
