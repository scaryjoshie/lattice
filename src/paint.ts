import { CELL, type Camera, GUTTER, RADIUS, visible, worldX } from "./geometry.ts";
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
 * Contiguous cells of the same colour are drawn as one shape rather than as neighbours,
 * which needs no region geometry — only a membership test. A cell contributes up to four
 * pieces:
 *
 *   its own rectangle, keeping a corner's radius only where both of that corner's edges
 *   face nothing;
 *   a bridge filling the gutter to its right neighbour, and another to the one below;
 *   a patch over the small square where four cells meet, which no bridge covers.
 *
 * An earlier version instead grew each cell's rectangle half a gutter toward every present
 * neighbour. That is simpler and wrong: the growth runs the whole length of the side, so at
 * an inner corner a cell juts out past the neighbour it was reaching for, and the shape
 * gets a step in it. Bridges only ever occupy the gap they belong to.
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

/**
 * One member cell of a merged shape. `member` answers whether a neighbour belongs to the
 * same shape. Pieces are opaque and never overlap, so they can be filled as they are built.
 */
function piece(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  gap: number,
  radius: number,
  member: (dc: number, dr: number) => boolean,
): void {
  const l = member(-1, 0);
  const r = member(1, 0);
  const u = member(0, -1);
  const d = member(0, 1);

  ctx.beginPath();
  ctx.roundRect(x, y, size, size, [
    !l && !u ? radius : 0,
    !r && !u ? radius : 0,
    !r && !d ? radius : 0,
    !l && !d ? radius : 0,
  ]);
  ctx.fill();

  if (r) ctx.fillRect(x + size, y, gap, size);
  if (d) ctx.fillRect(x, y + size, size, gap);
  // Where four cells meet, the gutters cross and leave a square hole in the middle.
  if (r && d && member(1, 1)) ctx.fillRect(x + size, y + size, gap, gap);
}

export function paint(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { camera, width, height, dpr, cells, hover } = scene;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, width, height);

  const [c0, c1] = visible(camera.x, width, camera.k);
  const [r0, r1] = visible(camera.y, height, camera.k);
  const size = CELL * camera.k;
  const radius = RADIUS * camera.k;
  const gap = GUTTER * camera.k;
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
      piece(ctx, sx(ci), sy(ri), size, gap, radius, (dc, dr) => at(ci + dc, ri + dr)?.hue === cell.hue);
    }
  }

  // Occupants, merging only with occupants of the same region.
  for (let ri = r0; ri <= r1; ri++) {
    for (let ci = c0; ci <= c1; ci++) {
      const cell = at(ci, ri);
      if (!cell?.occupied) continue;
      ctx.fillStyle = hue(cell.hue).fill;
      piece(ctx, sx(ci), sy(ri), size, gap, radius, (dc, dr) => {
        const n = at(ci + dc, ri + dr);
        return n?.occupied === true && n.hue === cell.hue;
      });
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
