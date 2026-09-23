import { CELL, type Camera, visible, worldX } from "./geometry.ts";
import { hue } from "./palette.ts";

/**
 * A ruled grid. The lattice is two sets of lines rather than a shape per cell, which is
 * both the look and the reason this is cheap: a viewport holds a few dozen lines where it
 * held a few hundred rounded rectangles, and each colour is one path stroked once.
 *
 * A rule takes the hue of what it crosses. The neutral ruling is drawn across the page,
 * then each region redraws the part inside it in its own family — so the grid continues
 * through a region rather than a foreign grey being laid over it.
 *
 * Occupied cells are filled *after* the ruling, which takes it off them for free: an
 * occupant is an object, not paper, and ruling across one makes it read as four quadrants.
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
/** The gap a run cuts into whatever it sits on. */
const CUT = "#ffffff";
/** Cap height as a fraction of the cell, so text scales with the grid it sits in. */
const TEXT = 0.3;
/** Left padding, also as a fraction of the cell, so the inset scales too. */
const TEXT_INSET = 0.26;
/** Half the plus's width, as a fraction of the cell. Its stroke is screen pixels. */
const PLUS = 0.16;
const PLUS_EDGE = 2;
const FONT = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

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

/**
 * Text is canvas content, not a floating tag. It occupies cells like anything else, so it
 * has to be made room for, and because it is redrawn every frame it stays crisp at every
 * zoom rather than being a rasterised layer scaled up.
 */
export interface TextRun {
  ci: number;
  ri: number;
  /** Columns occupied, starting at `ci`. */
  span: number;
  text: string;
  hue: number | null;
}

/** Occupants as a list. Searching the viewport for them allocated a key per cell. */
export interface Occupant {
  ci: number;
  ri: number;
  hue: number | null;
}

export interface Scene {
  camera: Camera;
  width: number;
  height: number;
  dpr: number;
  plates: readonly Plate[];
  cells: ReadonlyMap<string, Cell>;
  occupied: readonly Occupant[];
  texts: readonly TextRun[];
  hover: readonly [number, number] | null;
}

export function paint(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { camera, width, height, dpr, plates, cells, occupied, texts, hover } = scene;
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
    ctx.fillStyle = hue(plate.hue).tint;
    ctx.fillRect(
      sx(plate.c0),
      sy(plate.r0),
      sx(plate.c1) + size - sx(plate.c0),
      sy(plate.r1) + size - sy(plate.r0),
    );
  }

  if (rule > 0) {
    // Half a pixel, so a one-pixel line lands on a pixel rather than across two.
    const snap = (n: number) => Math.round(n) + 0.5;
    const rules = (a: number, b: number, p: number, q: number): Path2D => {
      const path = new Path2D();
      const top = sy(p);
      const bottom = sy(q) + size;
      const left = sx(a);
      const right = sx(b) + size;
      for (let ci = a; ci <= b + 1; ci++) {
        const x = snap(sx(ci));
        path.moveTo(x, top);
        path.lineTo(x, bottom);
      }
      for (let ri = p; ri <= q + 1; ri++) {
        const y = snap(sy(ri));
        path.moveTo(left, y);
        path.lineTo(right, y);
      }
      return path;
    };

    ctx.globalAlpha = rule;
    ctx.lineWidth = RULE;
    ctx.strokeStyle = hue(null).line;
    ctx.stroke(rules(c0, c1, r0, r1));

    // Each region reruns the ruling over its own area, clipped to it, in its own hue.
    for (const plate of plates) {
      if (plate.c1 < c0 || plate.c0 > c1 || plate.r1 < r0 || plate.r0 > r1) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        sx(plate.c0),
        sy(plate.r0),
        sx(plate.c1) + size - sx(plate.c0),
        sy(plate.r1) + size - sy(plate.r0),
      );
      ctx.clip();
      ctx.strokeStyle = hue(plate.hue).line;
      ctx.stroke(
        rules(
          Math.max(plate.c0, c0),
          Math.min(plate.c1, c1),
          Math.max(plate.r0, r0),
          Math.min(plate.r1, r1),
        ),
      );
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Occupied cells last, so the ruling does not cross them.
  const fills = new Map<string, Path2D>();
  for (const spot of occupied) {
    if (spot.ci < c0 || spot.ci > c1 || spot.ri < r0 || spot.ri > r1) continue;
    const style = hue(spot.hue).fill;
    let path = fills.get(style);
    if (!path) {
      path = new Path2D();
      fills.set(style, path);
    }
    path.rect(sx(spot.ci), sy(spot.ri), size, size);
  }
  for (const [style, path] of fills) {
    ctx.fillStyle = style;
    ctx.fill(path);
  }

  // Text runs. The span is cleared back to the surface it sits on, which takes the ruling
  // out from under the words, then outlined so the cells it occupies are visible, then
  // written left-aligned. Clearing rather than skipping keeps the ruling ignorant of text.
  if (rule > 0) {
    ctx.globalAlpha = rule;
    ctx.lineWidth = RULE;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(size * TEXT)}px ${FONT}`;
    for (const run of texts) {
      if (run.ci + run.span - 1 < c0 || run.ci > c1 || run.ri < r0 || run.ri > r1) continue;
      const h = hue(run.hue);
      const x = sx(run.ci);
      const y = sy(run.ri);
      const w = size * run.span;
      ctx.fillStyle = run.hue === null ? PAGE : h.tint;
      ctx.fillRect(x, y, w, size);
      // White, at the focus weight: the run reads as cut out of the surface rather than
      // drawn on top of it, and no new colour enters the palette to do it.
      ctx.lineWidth = FOCUS_EDGE;
      ctx.strokeStyle = CUT;
      const inset = FOCUS_EDGE / 2;
      ctx.strokeRect(x + inset, y + inset, w - FOCUS_EDGE, size - FOCUS_EDGE);
      ctx.lineWidth = RULE;
      ctx.fillStyle = h.ink;
      ctx.fillText(run.text, x + size * TEXT_INSET, y + size / 2);
    }
    ctx.globalAlpha = 1;
  }

  // Focus: the cell's own hue, inset by half its stroke so the ring sits inside the cell.
  // An empty cell also gets a plus, because the point of pointing at one is to put
  // something there.
  if (hover && rule > 0) {
    const [ci, ri] = hover;
    const cell = at(ci, ri);
    const colour = hue(cell?.hue ?? null).edge;
    const inset = FOCUS_EDGE / 2;
    const x = sx(ci);
    const y = sy(ri);
    ctx.lineWidth = FOCUS_EDGE;
    ctx.strokeStyle = colour;
    ctx.strokeRect(x + inset, y + inset, size - FOCUS_EDGE, size - FOCUS_EDGE);

    if (!cell?.occupied) {
      const arm = size * PLUS;
      const cx = x + size / 2;
      const cy = y + size / 2;
      ctx.lineWidth = PLUS_EDGE;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - arm, cy);
      ctx.lineTo(cx + arm, cy);
      ctx.moveTo(cx, cy - arm);
      ctx.lineTo(cx, cy + arm);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
  }
}
