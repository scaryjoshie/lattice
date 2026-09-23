import { CELL, type Camera, visible, worldX } from "./geometry.ts";
import { MARK, MARK_UNITS, MARKS, path } from "./marks.ts";
import { clip, fontOf, METRICS, nameFont, wrap } from "./measure.ts";
import type { OccupantKind, TextStyle } from "./model.ts";
import { hue, theme } from "./theme.ts";

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


/** Below roughly this many screen pixels a line is noise rather than structure. */
const FADE_FROM = 8;
const FADE_TO = 24;
/** Screen pixels, independent of zoom. */
const RULE = 1;
const FOCUS_EDGE = 2.5;
const LINK_EDGE = 2;
const LINK_DASH = [7, 6];
const LINK_DOT = 3.5;
/** A chevron's reach along the path and across it, its spacing and its weight — all in
 *  screen pixels. Wider than it is long, so it reads as an arrowhead rather than a tick. */
const CHEVRON_LONG = 4.5;
const CHEVRON_WIDE = 7.5;
const CHEVRON_GAP = 17;
const CHEVRON_EDGE = 2.25;
/** How fast the chevrons travel, as a multiple of the shared crawl. */
const CHEVRON_SPEED = 0.55;
/** How far each direction of an exchange sits off the centre line. */
const LANE = 11;
/** Names stop being drawn below this many screen pixels of cell, fading over the next few. */
const NAME_FROM = 34;
const NAME_FADE = 14;

/** Corner radius as a fraction of the cell, so the turn scales with the grid. */
const LINK_TURN = 0.3;

/** Half the plus's width, as a fraction of the cell. Its stroke is screen pixels. */
const PLUS = 0.16;
const PLUS_EDGE = 2;

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export interface Cell {
  hue: number | null;
  occupied: boolean;
  /** Which tile owns this cell, so any part of a run can be acted on. */
  tileId?: string;
  /** For a tile larger than one cell, the whole of it — so focus can cover all of it. */
  extent?: { ci: number; ri: number; span: number; rows: number };
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
  /** Cells occupied, starting at (ci, ri). A title is always one row tall. */
  span: number;
  rows: number;
  style: TextStyle;
  text: string;
  hue: number | null;
}

/** Occupants as a list. Searching the viewport for them allocated a key per cell. */
export interface Occupant {
  ci: number;
  ri: number;
  kind: OccupantKind;
  name?: string;
  hue: number | null;
}

/** The focused agent and everyone it is talking to, in cell coordinates. */
export interface Focus {
  ci: number;
  ri: number;
  /** Where the lines leave from. Normally the tile; while it is being carried, where it
   *  was picked up, so the connections do not swing about as it moves. */
  anchor: { ci: number; ri: number };
  hue: number | null;
  partners: readonly { ci: number; ri: number }[];
}

/** A move being proposed: where it came from, where it would land, and whether it may. */
export interface Proposal {
  from: { ci: number; ri: number; span: number; rows: number };
  to: { ci: number; ri: number; span: number; rows: number };
  hue: number | null;
  ok: boolean;
  /** Something would come back the other way, so the chevrons run both directions. */
  swaps: boolean;
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
  focus: Focus | null;
  /**
   * What is being acted on — renamed, shown a menu, or proposed as a place to put
   * something. Ringed, but nothing is veiled. `warn` means the thing it describes would
   * not be allowed.
   */
  selected: { ci: number; ri: number; span: number; rows: number; hue: number | null } | null;
  proposal: Proposal | null;
  hover: readonly [number, number] | null;
}

/** One occupant's mark, scaled from its own 24-unit space into the cell. */
function mark(
  ctx: CanvasRenderingContext2D,
  spot: Occupant,
  x: number,
  y: number,
  size: number,
): void {
  const side = size * MARK;
  const scale = side / MARK_UNITS;
  // The mark sits in the same place whether or not the tile has a name. Moving it to make
  // room made named and unnamed tiles disagree about where a mark belongs, and made the
  // mark jump the moment a name was committed. The name fits underneath as it is.
  ctx.save();
  ctx.translate(x + (size - side) / 2, y + (size - side) / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = hue(spot.hue).ink;
  ctx.strokeStyle = hue(spot.hue).ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of MARKS[spot.kind]) {
    const shape = path(stroke.d);
    if (stroke.width === undefined) {
      ctx.fill(shape, "evenodd");
    } else {
      ctx.lineWidth = stroke.width;
      ctx.stroke(shape);
    }
  }
  ctx.restore();

  // The name, under the mark, cut to the one cell it has. It disappears before it becomes
  // unreadable rather than shrinking into a smudge.
  if (!spot.name || size <= NAME_FROM) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (size - NAME_FROM) / NAME_FADE);
  ctx.font = nameFont(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hue(spot.hue).ink;
  ctx.fillText(clip(ctx, spot.name, size * 0.86), x + size / 2, y + size * 0.79);
  ctx.restore();
}

export function paint(ctx: CanvasRenderingContext2D, scene: Scene, dash = 0): void {
  const { camera, width, height, dpr, plates, cells, occupied, texts, focus, selected, proposal, hover } =
    scene;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const palette = theme();
  ctx.fillStyle = palette.page;
  ctx.fillRect(0, 0, width, height);

  const k = camera.k;
  const [c0, c1] = visible(camera.x, width, k);
  const [r0, r1] = visible(camera.y, height, k);
  const size = CELL * k;
  const rule = clamp((size - FADE_FROM) / (FADE_TO - FADE_FROM));
  const at = (ci: number, ri: number) => cells.get(`${ci},${ri}`);
  /** Half a pixel, so a one-pixel line lands on a pixel rather than across two. */
  const snap = (n: number) => Math.round(n) + 0.5;
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

  /*
   * Boundaries that fall inside a text run, which the ruling omits.
   *
   * A run's extent is canonical — it owns whole cells — so the lines inside it are known
   * and can simply not be drawn. The previous version drew them and then painted over
   * them, which is why the ends came out uneven: painting over a line at a fractional
   * position antialiases differently cell by cell, and the overdraw needed to close the
   * seams spilled into whatever was next door.
   */
  const insideRun = new Set<string>();
  for (const run of texts) {
    for (let dy = 0; dy < run.rows; dy++) {
      for (let dx = 1; dx < run.span; dx++) insideRun.add(`v${run.ci + dx},${run.ri + dy}`);
    }
    for (let dy = 1; dy < run.rows; dy++) {
      for (let dx = 0; dx < run.span; dx++) insideRun.add(`h${run.ci + dx},${run.ri + dy}`);
    }
  }

  if (rule > 0) {
    const rules = (a: number, b: number, p: number, q: number): Path2D => {
      const path = new Path2D();
      for (let ci = a; ci <= b + 1; ci++) {
        const x = snap(sx(ci));
        for (let ri = p; ri <= q; ri++) {
          if (insideRun.has(`v${ci},${ri}`)) continue;
          const y = sy(ri);
          path.moveTo(x, y);
          path.lineTo(x, y + size);
        }
      }
      for (let ri = p; ri <= q + 1; ri++) {
        const y = snap(sy(ri));
        for (let ci = a; ci <= b; ci++) {
          if (insideRun.has(`h${ci},${ri}`)) continue;
          const x = sx(ci);
          path.moveTo(x, y);
          path.lineTo(x + size, y);
        }
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
  for (const [style, shape] of fills) {
    ctx.fillStyle = style;
    ctx.fill(shape);
  }
  for (const spot of occupied) {
    if (spot.ci < c0 || spot.ci > c1 || spot.ri < r0 || spot.ri > r1) continue;
    mark(ctx, spot, sx(spot.ci), sy(spot.ri), size);
  }

  /*
   * Text. One path for every run: wrap to the width it owns, draw the lines that fit in
   * the height it owns, clipped to both. A title is not a special case of this — it is
   * this, with a leading of one whole cell, which puts its single line in the middle of
   * its single cell. The two styles differ only in how big they are.
   *
   * Nothing is cleared: the ruling already left these cells unruled, because a run owns
   * whole cells and which lines fall inside it is known rather than discovered.
   */
  if (rule > 0) {
    ctx.globalAlpha = rule;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const run of texts) {
      if (run.ci + run.span - 1 < c0 || run.ci > c1) continue;
      if (run.ri + run.rows - 1 < r0 || run.ri > r1) continue;
      const m = METRICS[run.style];
      const h = hue(run.hue);
      const x = sx(run.ci);
      const y = sy(run.ri);
      const inset = size * m.inset;
      ctx.font = fontOf(run.style, size);
      ctx.fillStyle = h.ink;
      const box = { w: size * run.span, h: size * run.rows };
      const leading = size * m.leading;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, box.w, box.h);
      ctx.clip();
      /*
       * Cut with an ellipsis rather than at the glyph, on both axes. A word sheared
       * through the middle reads as a rendering fault; an ellipsis reads as "there is
       * more", which is what is true. Names already do this — runs did not.
       */
      const room = box.w - inset * 2;
      const lines = wrap(ctx, run.text, room);
      const fits = Math.max(1, Math.floor((box.h - size * m.pad) / leading));
      for (let i = 0; i < Math.min(lines.length, fits); i++) {
        const last = i === fits - 1 && lines.length > fits;
        const line = lines[i] as string;
        ctx.fillText(clip(ctx, last ? `${line} ${lines[i + 1] ?? ""}` : line, room), x + inset, y + size * m.pad + leading * (i + 0.5));
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /*
   * Focus on an agent: everything else is veiled back toward the page, then the agent, the
   * ones it is talking to, and the lines between them are drawn over the veil. Dimming is
   * one rectangle rather than a decision made per cell, and lines are only ever drawn
   * inside a focus — which is what keeps a canvas of relationships from becoming a web.
   */
  if (focus) {
    const centre = (c: number, r: number) => [sx(c) + size / 2, sy(r) + size / 2] as const;
    ctx.fillStyle = palette.veil;
    ctx.fillRect(0, 0, width, height);

    const h = hue(focus.hue);
    const restore = (c: number, r: number, tint: number | null) => {
      ctx.fillStyle = hue(tint).fill;
      ctx.fillRect(sx(c), sy(r), size, size);
    };
    for (const partner of focus.partners) {
      restore(partner.ci, partner.ri, at(partner.ci, partner.ri)?.hue ?? null);
    }
    restore(focus.ci, focus.ri, focus.hue);
    for (const spot of occupied) {
      const lit =
        (spot.ci === focus.ci && spot.ri === focus.ri) ||
        focus.partners.some((p) => p.ci === spot.ci && p.ri === spot.ri);
      if (lit) mark(ctx, spot, sx(spot.ci), sy(spot.ri), size);
    }

    /*
     * Lines run over the tiles rather than stopping at their edges, and end in a dot at
     * each agent's centre. Two agents in neighbouring cells would otherwise have their
     * connection entirely hidden underneath them.
     *
     * The route turns rather than cutting across: a diagonal ignores the grid it is drawn
     * on, and on a ruled surface that reads as a mistake. One corner, rounded.
     */
    const [fx, fy] = centre(focus.anchor.ci, focus.anchor.ri);
    ctx.strokeStyle = h.edge;
    ctx.lineWidth = LINK_EDGE;
    ctx.lineCap = "round";
    ctx.setLineDash(LINK_DASH);
    ctx.lineDashOffset = -dash;
    ctx.beginPath();
    for (const partner of focus.partners) {
      const [px, py] = centre(partner.ci, partner.ri);
      // The focused agent is already ringed, so its line leaves from the edge rather than
      // from under its own mark. Partners are only identified by what arrives at them.
      const half = size / 2;
      const out: readonly [number, number] =
        px === fx ? [fx, fy + Math.sign(py - fy) * half] : [fx + Math.sign(px - fx) * half, fy];
      ctx.moveTo(out[0], out[1]);
      const turn = Math.min(size * LINK_TURN, Math.abs(px - out[0]), Math.abs(py - out[1]));
      if (turn > 0.5) ctx.arcTo(px, out[1], px, py, turn);
      else ctx.lineTo(px, out[1]);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = "butt";

    ctx.fillStyle = h.edge;
    const stop = (x: number, y: number) => {
      ctx.beginPath();
      ctx.arc(x, y, LINK_DOT, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const partner of focus.partners) stop(...centre(partner.ci, partner.ri));
    // And where each line leaves the focused agent, so a connection is marked at both
    // ends. Two partners in the same direction share a departure point, which is correct:
    // the dot says links leave this way, not how many.
    for (const partner of focus.partners) {
      const [px, py] = centre(partner.ci, partner.ri);
      const half = size / 2;
      if (px === fx && py === fy) continue;
      if (px === fx) stop(fx, fy + Math.sign(py - fy) * half);
      else stop(fx + Math.sign(px - fx) * half, fy);
    }

    ctx.lineWidth = FOCUS_EDGE;
    ctx.strokeStyle = h.edge;
    const inset = FOCUS_EDGE / 2;
    ctx.strokeRect(sx(focus.ci) + inset, sy(focus.ri) + inset, size - FOCUS_EDGE, size - FOCUS_EDGE);
  }

  // What is being acted on stays ringed for as long as it is being acted on, so a menu or
  // a rename does not make the thing it is about stop being pointed at.
  if (selected && rule > 0) {
    const inset = FOCUS_EDGE / 2;
    ctx.lineWidth = FOCUS_EDGE;
    ctx.strokeStyle = hue(selected.hue).edge;
    ctx.strokeRect(
      sx(selected.ci) + inset,
      sy(selected.ri) + inset,
      size * selected.span - FOCUS_EDGE,
      size * selected.rows - FOCUS_EDGE,
    );
  }

  /*
   * A proposed move: an arrow from where a thing was to where it would go, and a ring
   * around the destination. Refused proposals are drawn the same way in the one colour
   * that means no, so the shape of the answer does not change with the answer.
   */
  if (proposal && rule > 0) {
    const centre = (r: Proposal["to"]) =>
      [sx(r.ci) + (size * r.span) / 2, sy(r.ri) + (size * r.rows) / 2] as const;
    /*
     * Both regions are lit and outlined, always. A proposal is a statement about two
     * places, so both are shown — rather than leaving one of them to whatever the focus
     * veil happened to restore, which lit a cell only when it was a link partner of the
     * dragged agent and so worked or did not depending on something unrelated.
     */
    const relight = (r: Proposal["to"]) => {
      for (let dy = 0; dy < r.rows; dy++) {
        for (let dx = 0; dx < r.span; dx++) {
          const ci = r.ci + dx;
          const ri = r.ri + dy;
          const cell = at(ci, ri);
          ctx.fillStyle = cell?.hue == null ? palette.page : hue(cell.hue).tint;
          ctx.fillRect(sx(ci), sy(ri), size, size);
        }
      }
      for (const spot of occupied) {
        if (spot.ci < r.ci || spot.ci >= r.ci + r.span) continue;
        if (spot.ri < r.ri || spot.ri >= r.ri + r.rows) continue;
        ctx.fillStyle = hue(spot.hue).fill;
        ctx.fillRect(sx(spot.ci), sy(spot.ri), size, size);
        mark(ctx, spot, sx(spot.ci), sy(spot.ri), size);
      }
    };
    relight(proposal.from);
    relight(proposal.to);

    const [ax, ay] = centre(proposal.from);
    const [bx, by] = centre(proposal.to);
    /** Where a ray from the centre leaves a region's edge, so the path runs edge to edge
     *  rather than centre to centre and is not buried under what it connects. */
    const toEdge = (r: Proposal["to"], ux: number, uy: number) => {
      const hw = (size * r.span) / 2;
      const hh = (size * r.rows) / 2;
      const tx = Math.abs(ux) < 1e-6 ? Number.POSITIVE_INFINITY : hw / Math.abs(ux);
      const ty = Math.abs(uy) < 1e-6 ? Number.POSITIVE_INFINITY : hh / Math.abs(uy);
      return Math.min(tx, ty);
    };
    // The act has its own colour. It is not the hue of the thing being moved, because it
    // is not describing the thing — it is describing what is happening to it.
    const colour = proposal.ok ? palette.flow : palette.warn;
    const inset = FOCUS_EDGE / 2;

    /*
     * Chevrons flowing along the path rather than a dashed line. A dash says "there is a
     * connection here"; a row of arrowheads moving one way says "this is going that way",
     * which is the thing a move needs to say. They are spaced in screen pixels and slide
     * by the same counter the links crawl on, so everything in flight moves together.
     */
    const far = Math.hypot(bx - ax, by - ay);
    if (far > 1) {
      const ux = (bx - ax) / far;
      const uy = (by - ay) / far;
      /*
       * Normally the path runs edge to edge, so none of it is buried under what it
       * connects. Adjacent regions share an edge and have no gap to run through, so it
       * runs centre to centre instead — over the tiles, which is the only place left to
       * say anything.
       */
      let start = toEdge(proposal.from, ux, uy) + CHEVRON_LONG;
      let end = far - toEdge(proposal.to, ux, uy);
      if (end - start < CHEVRON_GAP) {
        start = CHEVRON_WIDE;
        end = far - CHEVRON_WIDE;
      }

      ctx.strokeStyle = colour;
      ctx.lineWidth = CHEVRON_EDGE;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const slide = ((dash * CHEVRON_SPEED) % CHEVRON_GAP) + CHEVRON_GAP;
      /*
       * Two lanes rather than two streams on one line: an exchange has traffic both ways,
       * and arrowheads pointing opposite directions through each other read as neither.
       */
      const stream = (dx: number, dy: number, from: readonly [number, number], lane: number) => {
        const ox = -dy * lane;
        const oy = dx * lane;
        for (let d = start + ((slide + lane) % CHEVRON_GAP); d < end; d += CHEVRON_GAP) {
          const px = from[0] + dx * d + ox;
          const py = from[1] + dy * d + oy;
          ctx.moveTo(
            px - dx * CHEVRON_LONG - dy * CHEVRON_WIDE,
            py - dy * CHEVRON_LONG + dx * CHEVRON_WIDE,
          );
          ctx.lineTo(px, py);
          ctx.lineTo(
            px - dx * CHEVRON_LONG + dy * CHEVRON_WIDE,
            py - dy * CHEVRON_LONG - dx * CHEVRON_WIDE,
          );
        }
      };
      stream(ux, uy, [ax, ay], proposal.swaps ? LANE : 0);
      if (proposal.swaps) stream(-ux, -uy, [bx, by], LANE);
      ctx.stroke();
      ctx.lineCap = "butt";
    }

    ctx.lineWidth = FOCUS_EDGE;
    ctx.strokeStyle = colour;
    for (const r of [proposal.from, proposal.to]) {
      ctx.strokeRect(
        sx(r.ci) + inset,
        sy(r.ri) + inset,
        size * r.span - FOCUS_EDGE,
        size * r.rows - FOCUS_EDGE,
      );
    }
  }

  // Focus: the cell's own hue, inset by half its stroke so the ring sits inside the cell.
  // An empty cell also gets a plus, because the point of pointing at one is to put
  // something there.
  if (hover && rule > 0 && !focus) {
    const [ci, ri] = hover;
    const cell = at(ci, ri);
    const colour = hue(cell?.hue ?? null).edge;
    const inset = FOCUS_EDGE / 2;
    // Whatever is under the pointer is selected whole, not by the cell it was touched on.
    const box = cell?.extent ?? { ci, ri, span: 1, rows: 1 };
    const x = sx(box.ci);
    const y = sy(box.ri);
    ctx.lineWidth = FOCUS_EDGE;
    ctx.strokeStyle = colour;
    ctx.strokeRect(
      x + inset,
      y + inset,
      size * box.span - FOCUS_EDGE,
      size * box.rows - FOCUS_EDGE,
    );

    if (!cell?.occupied) {
      const arm = size * PLUS;
      const cx = sx(ci) + size / 2;
      const cy = sy(ri) + size / 2;
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
