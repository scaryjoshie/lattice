import { CELL, type Camera, RADIUS, visible, worldX } from "./geometry.ts";
import { hue, NEUTRAL } from "./palette.ts";

/**
 * The lattice is painted, never built. One canvas, redrawn from the camera, iterating only
 * the indices on screen — so the cost follows the window rather than the world, and nothing
 * about it exists in the DOM to be reconciled.
 *
 * What a cell is drawn with is the table in palette.ts and nothing else. An outline is
 * always the hue of the thing it outlines, so a focused cell inside a blue region gets a
 * blue ring rather than a grey box cutting across it; the lattice's grey is that same rule
 * at the neutral hue. Outlines are a fixed screen width at every zoom and fade out as cells
 * get small, so zooming out dissolves the lattice into the page rather than crowding it
 * with hairlines.
 *
 * Every cell is drawn as itself. Contiguous cells of one colour are not merged into a
 * single shape: the grid is supposed to read as cells.
 */

const PAGE = "#f5f5f6";

/** Below roughly this many screen pixels an edge is noise rather than structure. */
const FADE_FROM = 10;
const FADE_TO = 26;
/** Screen pixels, independent of zoom. */
const EDGE = 1.5;

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export interface Cell {
  /** Which region owns this cell, or null for a cell that belongs to none. */
  hue: number | null;
  occupied: boolean;
}

export interface Scene {
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
  cells: ReadonlyMap<string, Cell>;
  hover: readonly [number, number] | null;
}

const key = (ci: number, ri: number) => `${ci},${ri}`;

export function paint(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { camera, width, height, dpr, cells, hover } = scene;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, width, height);

  const [c0, c1] = visible(camera.x, width, camera.k);
  const [r0, r1] = visible(camera.y, height, camera.k);
  const size = CELL * camera.k;
  const radius = RADIUS * camera.k;
  const edge = clamp((size - FADE_FROM) / (FADE_TO - FADE_FROM));
  const at = (ci: number, ri: number) => cells.get(key(ci, ri));
  const sx = (ci: number) => worldX(ci) * camera.k + camera.x;
  const sy = (ri: number) => worldX(ri) * camera.k + camera.y;

  ctx.lineWidth = EDGE;

  // Region tints first, as one merged shape per region, so occupants sit on top of them.
  for (let ri = r0; ri <= r1; ri++) {
    for (let ci = c0; ci <= c1; ci++) {
      const cell = at(ci, ri);
      if (cell?.hue == null) continue;
      ctx.fillStyle = hue(cell.hue).tint;
      ctx.beginPath();
      ctx.roundRect(sx(ci), sy(ri), size, size, radius);
      ctx.fill();
    }
  }

  // Occupants, merging only with occupants of the same region.
  for (let ri = r0; ri <= r1; ri++) {
    for (let ci = c0; ci <= c1; ci++) {
      const cell = at(ci, ri);
      if (!cell?.occupied) continue;
      ctx.fillStyle = hue(cell.hue).fill;
      ctx.beginPath();
      ctx.roundRect(sx(ci), sy(ri), size, size, radius);
      ctx.fill();
    }
  }

  // Outlines at rest belong to the neutral hue only: a tint needs no border.
  if (edge > 0) {
    ctx.globalAlpha = edge;
    ctx.strokeStyle = NEUTRAL.line;
    for (let ri = r0; ri <= r1; ri++) {
      for (let ci = c0; ci <= c1; ci++) {
        const cell = at(ci, ri);
        if (cell?.hue != null || cell?.occupied) continue;
        ctx.beginPath();
        ctx.roundRect(sx(ci), sy(ri), size, size, radius);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Focus: the cell's own hue, so the ring reads as part of what it is on.
  if (hover && edge > 0) {
    const [ci, ri] = hover;
    const cell = at(ci, ri);
    const h = hue(cell?.hue ?? null);
    ctx.globalAlpha = edge;
    ctx.strokeStyle = h.edge;
    ctx.beginPath();
    ctx.roundRect(sx(ci), sy(ri), size, size, radius);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
