import { CELL, type Camera, GUTTER, RADIUS, visible, worldX } from "./geometry.ts";
import { hue, LOOSE } from "./palette.ts";

/**
 * The lattice is painted, never built. One canvas, redrawn from the camera, iterating only
 * the indices on screen — so the cost follows the window rather than the world, and nothing
 * about it exists in the DOM to be reconciled.
 *
 * An empty cell is an outline, one screen pixel at every zoom, fading out as cells get
 * small so that zooming out dissolves the lattice into the page instead of crowding it with
 * hairlines. A cell that belongs to a region is a tint and gets no outline at all.
 *
 * Contiguous cells of the same colour are drawn as one shape rather than as neighbours:
 * each cell's rectangle reaches half a gutter toward every present neighbour so the gaps
 * close, and a corner is rounded only where both of its edges face nothing. Territory
 * rather than a heatmap, and it needs no region geometry — only a membership test.
 */

const PAGE = "#f5f5f6";
const LINE = "#dcdce2";
const HOVER_LINE = "#b1b4bf";
const HOVER_FILL = "#eceef2";

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
 * One cell of a merged shape. `member` answers whether a neighbour belongs to the same
 * shape; the rectangle grows toward the ones that do and keeps its corner only where it
 * faces nothing.
 */
function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  radius: number,
  reach: number,
  member: (dc: number, dr: number) => boolean,
): void {
  const l = member(-1, 0);
  const r = member(1, 0);
  const u = member(0, -1);
  const d = member(0, 1);
  const x0 = x - (l ? reach : 0);
  const y0 = y - (u ? reach : 0);
  const w = size + (l ? reach : 0) + (r ? reach : 0);
  const h = size + (u ? reach : 0) + (d ? reach : 0);
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, [
    !l && !u ? radius : 0,
    !r && !u ? radius : 0,
    !r && !d ? radius : 0,
    !l && !d ? radius : 0,
  ]);
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
  const reach = (GUTTER / 2) * camera.k;
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
      blob(ctx, sx(ci), sy(ri), size, radius, reach, (dc, dr) => at(ci + dc, ri + dr)?.hue === cell.hue);
      ctx.fill();
    }
  }

  // Occupants, merging only with occupants of the same region.
  for (let ri = r0; ri <= r1; ri++) {
    for (let ci = c0; ci <= c1; ci++) {
      const cell = at(ci, ri);
      if (!cell?.occupied) continue;
      ctx.fillStyle = (cell.hue == null ? LOOSE : hue(cell.hue)).fill;
      blob(ctx, sx(ci), sy(ri), size, radius, reach, (dc, dr) => {
        const n = at(ci + dc, ri + dr);
        return n?.occupied === true && n.hue === cell.hue;
      });
      ctx.fill();
    }
  }

  // Outlines, only where there is no tint. A tinted region never gets a border.
  if (edge > 0) {
    ctx.globalAlpha = edge;
    ctx.strokeStyle = LINE;
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

  // Hover last, so it reads over whatever it lands on.
  if (hover) {
    const [ci, ri] = hover;
    const cell = at(ci, ri);
    ctx.beginPath();
    ctx.roundRect(sx(ci), sy(ri), size, size, radius);
    if (!cell?.hue && !cell?.occupied) {
      ctx.fillStyle = HOVER_FILL;
      ctx.fill();
    }
    if (edge > 0) {
      ctx.globalAlpha = edge;
      ctx.strokeStyle = HOVER_LINE;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
