import { CELL, type Camera, visible, worldX } from "./geometry.ts";
import { hue } from "./palette.ts";

/**
 * A ruled grid. The lattice is two sets of lines rather than a shape per cell, which is
 * both the look and the reason this is cheap: a viewport holds a few dozen lines where it
 * held a few hundred rounded rectangles, and they are one path each.
 *
 * Lines are drawn over the fills, the way a ruled sheet works — a filled cell is ink on the
 * paper, not a replacement for it. Everything else follows the table in palette.ts: a fill
 * means the cell holds something, and a region is a filled area beneath the ruling.
 *
 * Lines are a fixed screen width at every zoom and fade out as cells get small, so zooming
 * out dissolves the ruling into the page rather than crowding it.
 */

const PAGE = "#f5f5f6";

/** Below roughly this many screen pixels a line is noise rather than structure. */
const FADE_FROM = 8;
const FADE_TO = 24;
/** Screen pixels, independent of zoom. */
const RULE = 1;
const FOCUS_EDGE = 2.5;

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export interface Cell {
  hue: number | null;
  occupied: boolean;
}

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
  const rule = clamp((size - FADE_FROM) / (FADE_TO - FADE_FROM));
  const at = (ci: number, ri: number) => cells.get(`${ci},${ri}`);
  const sx = (ci: number) => worldX(ci) * k + camera.x;
  const sy = (ri: number) => worldX(ri) * k + camera.y;

  // Regions, beneath the ruling.
  for (const plate of plates) {
    if (plate.c1 < c0 || plate.c0 > c1 || plate.r1 < r0 || plate.r0 > r1) continue;
    const x = sx(plate.c0);
    const y = sy(plate.r0);
    ctx.fillStyle = hue(plate.hue).tint;
    ctx.fillRect(x, y, sx(plate.c1) + size - x, sy(plate.r1) + size - y);
  }

  // Occupied cells, batched by colour so a frame is a handful of state changes.
  const fills = new Map<string, Path2D>();
  for (let ri = r0; ri <= r1; ri++) {
    for (let ci = c0; ci <= c1; ci++) {
      const cell = at(ci, ri);
      if (!cell?.occupied) continue;
      const style = hue(cell.hue).fill;
      let path = fills.get(style);
      if (!path) {
        path = new Path2D();
        fills.set(style, path);
      }
      path.rect(sx(ci), sy(ri), size, size);
    }
  }
  for (const [style, path] of fills) {
    ctx.fillStyle = style;
    ctx.fill(path);
  }

  // The ruling: one path for every line on screen, drawn once.
  if (rule > 0) {
    // Half a pixel, so a one-pixel line lands on a pixel rather than across two.
    const snap = (n: number) => Math.round(n) + 0.5;
    const path = new Path2D();
    const top = sy(r0);
    const bottom = sy(r1) + size;
    const left = sx(c0);
    const right = sx(c1) + size;
    for (let ci = c0; ci <= c1 + 1; ci++) {
      const x = snap(sx(ci));
      path.moveTo(x, top);
      path.lineTo(x, bottom);
    }
    for (let ri = r0; ri <= r1 + 1; ri++) {
      const y = snap(sy(ri));
      path.moveTo(left, y);
      path.lineTo(right, y);
    }
    ctx.globalAlpha = rule;
    ctx.lineWidth = RULE;
    ctx.strokeStyle = hue(null).line;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
  }

  // Focus: the cell's own hue, inset by half its stroke so the ring sits inside the cell.
  if (hover && rule > 0) {
    const [ci, ri] = hover;
    const inset = FOCUS_EDGE / 2;
    ctx.lineWidth = FOCUS_EDGE;
    ctx.strokeStyle = hue(at(ci, ri)?.hue ?? null).edge;
    ctx.strokeRect(sx(ci) + inset, sy(ri) + inset, size - FOCUS_EDGE, size - FOCUS_EDGE);
  }
}
