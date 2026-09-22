import { CELL, type Camera, RADIUS, visible, worldX } from "./geometry.ts";
import { hue } from "./palette.ts";

/**
 * The lattice is painted, never built. One canvas, redrawn from the camera, iterating only
 * the indices on screen — so the cost follows the window rather than the world, and nothing
 * about it exists in the DOM to be reconciled.
 *
 * A region is one rounded rectangle laid *under* the lattice, spanning from the outer edge
 * of its first cell to the outer edge of its last, so the cells inside it sit on a
 * different surface. Membership is shown by where a cell is rather than by anything drawn
 * per cell, which is both the clearer reading and one draw call instead of one per cell.
 *
 * Everything else follows the table in palette.ts: an outline means the cell is empty, a
 * fill means it holds something, and an outline is always the hue of what it outlines.
 * Outlines are a fixed screen width at every zoom and fade out as cells get small, so
 * zooming out dissolves the lattice into the page rather than crowding it with hairlines.
 */

const PAGE = "#f5f5f6";

/** Below roughly this many screen pixels an edge is noise rather than structure. */
const FADE_FROM = 10;
const FADE_TO = 26;
/** Screen pixels, independent of zoom. Focus is a weight, not just a colour. */
const EDGE = 1.5;
const FOCUS_EDGE = 2.5;

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export interface Cell {
  /** Which region owns this cell, or null for a cell that belongs to none. */
  hue: number | null;
  occupied: boolean;
}

/** A region's extent in cell indices. The paint turns it into one rectangle. */
export interface Plate {
  hue: number;
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

export interface Scene {
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
  plates: readonly Plate[];
  cells: ReadonlyMap<string, Cell>;
  hover: readonly [number, number] | null;
}

export function paint(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { camera, width, height, dpr, plates, cells, hover } = scene;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, width, height);

  const k = camera.k;
  const [c0, c1] = visible(camera.x, width, k);
  const [r0, r1] = visible(camera.y, height, k);
  const size = CELL * k;
  const radius = RADIUS * k;
  const edge = clamp((size - FADE_FROM) / (FADE_TO - FADE_FROM));
  const at = (ci: number, ri: number) => cells.get(`${ci},${ri}`);
  const sx = (ci: number) => worldX(ci) * k + camera.x;
  const sy = (ri: number) => worldX(ri) * k + camera.y;

  // Plates, under everything, flush with the cells at their edges.
  for (const plate of plates) {
    if (plate.c1 < c0 || plate.c0 > c1 || plate.r1 < r0 || plate.r0 > r1) continue;
    const x = sx(plate.c0);
    const y = sy(plate.r0);
    ctx.fillStyle = hue(plate.hue).tint;
    ctx.beginPath();
    ctx.roundRect(x, y, sx(plate.c1) + size - x, sy(plate.r1) + size - y, radius);
    ctx.fill();
  }

  // Outlines and fills, each batched into one path per colour. Setting a style is the
  // expensive part of canvas2d, so this is a handful of state changes rather than one per
  // cell — which at low zoom is thousands.
  const strokes = new Map<string, Path2D>();
  const fills = new Map<string, Path2D>();
  const into = (map: Map<string, Path2D>, style: string) => {
    let path = map.get(style);
    if (!path) {
      path = new Path2D();
      map.set(style, path);
    }
    return path;
  };

  for (let ri = r0; ri <= r1; ri++) {
    const y = sy(ri);
    for (let ci = c0; ci <= c1; ci++) {
      const x = sx(ci);
      const cell = at(ci, ri);
      const h = hue(cell?.hue ?? null);
      if (cell?.occupied) {
        into(fills, h.fill).roundRect(x, y, size, size, radius);
      } else if (edge > 0) {
        into(strokes, h.line).roundRect(x, y, size, size, radius);
      }
    }
  }

  for (const [style, path] of fills) {
    ctx.fillStyle = style;
    ctx.fill(path);
  }
  if (edge > 0) {
    ctx.globalAlpha = edge;
    ctx.lineWidth = EDGE;
    for (const [style, path] of strokes) {
      ctx.strokeStyle = style;
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
  }

  // Focus: the cell's own hue, so the ring reads as part of what it is on. Inset by half
  // its stroke, so a thick ring sits inside the cell rather than growing it.
  if (hover && edge > 0) {
    const [ci, ri] = hover;
    const inset = FOCUS_EDGE / 2;
    ctx.globalAlpha = edge;
    ctx.lineWidth = FOCUS_EDGE;
    ctx.strokeStyle = hue(at(ci, ri)?.hue ?? null).edge;
    ctx.beginPath();
    ctx.roundRect(
      sx(ci) + inset,
      sy(ri) + inset,
      size - FOCUS_EDGE,
      size - FOCUS_EDGE,
      Math.max(0, radius - inset),
    );
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
