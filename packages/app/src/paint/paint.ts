import { ADVANCE, cells as cellsOf, clip, contains, fits, METRICS, NAME, type Region, wrap } from "@lattice/model";
import { CELL, visible, worldX } from "../scene/geometry.ts";
import { MARK, MARK_UNITS, path } from "../scene/marks.ts";
import { FONT, fontOf, nameFont } from "./measure.ts";
import { hue, theme } from "./theme.ts";
import type { Occupant, Scene, TextRun } from "../scene/scene.ts";

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
/** A host's own outline: the ruling's width, in its edge hue at this strength, so it is
 *  always weaker than a hover or selection ring, which is that hue at full strength and
 *  more than twice as wide. */
const RIM = 0.35;
/** The arm of a selection's corner bracket, in screen pixels. */
const CORNER = 10;
/** A lit gridline's weight, the grip's thickness and length, and the hatch spacing of new
 *  cells — all in screen pixels. */
const LINE_LIT = 3.5;
const GRIP = 11;
const GRIP_LEN = 44;
const HATCH = 9;

/** A scope's handle: a square centred on its top-left corner, in screen pixels. */
const HANDLE = 14;
/** The name beside a handle the pointer is on, in screen pixels. */
const HANDLE_NAME = 12;
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

/** The caret's width in screen pixels, and how many counter ticks it stays on or off. */
const CARET = 2;
const CARET_BLINK = 20;

/** Corner radius as a fraction of the cell, so the turn scales with the grid. */
const LINK_TURN = 0.3;

/** Half the plus's width, as a fraction of the cell. Its stroke is screen pixels. */
const PLUS = 0.16;
const PLUS_EDGE = 2;

const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * One occupant's mark, scaled from its own 24-unit space into a cell at the middle of the
 * host, however many cells the host owns. `x` and `y` are the host's first cell.
 */
function mark(
  ctx: CanvasRenderingContext2D,
  spot: Occupant,
  x0: number,
  y0: number,
  size: number,
): void {
  const x = x0 + (size * (spot.span - 1)) / 2;
  const y = y0 + (size * (spot.rows - 1)) / 2;
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
  for (const stroke of spot.mark) {
    const shape = path(stroke.d);
    if (stroke.width === undefined) {
      ctx.fill(shape, "evenodd");
    } else {
      ctx.lineWidth = stroke.width;
      ctx.stroke(shape);
    }
  }
  ctx.restore();

  // The name, under the mark, cut to the width the host has. It disappears before it becomes
  // unreadable rather than shrinking into a smudge.
  if (!spot.name || size <= NAME_FROM) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, (size - NAME_FROM) / NAME_FADE);
  ctx.font = nameFont(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hue(spot.hue).ink;
  ctx.fillText(clip(spot.name, fits(NAME.size, spot.span - 0.14)), x + size / 2, y + size * 0.79);
  ctx.restore();
}

export function paint(ctx: CanvasRenderingContext2D, scene: Scene, dash = 0): void {
  const {
    camera, width, height, dpr, plates, cells, occupied, texts, focus, about, selected, proposal, hover, shift, extending, handles, pointing, lines, growing, caret,
  } = scene;
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

  /**
   * One way to draw a cell: its surface, and the occupant on it if there is one. Used for
   * the ordinary pass and again for any cell that must show through the veil, so the two
   * cannot disagree about what a cell looks like.
   */
  /*
   * A run's words, clipped to a region: the whole run in the ordinary pass, one cell of it
   * when that cell is repainted. One path for every run: wrap to the width it owns, draw
   * the lines that fit in the height it owns. A title is not a special case of this — it
   * is this, with a leading of one whole cell, which centres its single line. The two
   * styles differ only in how big they are. Cut with an ellipsis rather than at the glyph,
   * on both axes: a word sheared through the middle reads as a fault; an ellipsis reads as
   * "there is more", which is what is true.
   */
  const drawRun = (run: TextRun, within: Region) => {
    if (rule <= 0) return;
    const m = METRICS[run.style];
    const x = sx(run.ci);
    const y = sy(run.ri);
    const inset = size * m.inset;
    const box = { w: size * run.span, h: size * run.rows };
    const leading = size * m.leading;
    ctx.save();
    ctx.globalAlpha = rule;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = fontOf(run.style, size);
    ctx.fillStyle = hue(run.hue).ink;
    ctx.beginPath();
    ctx.rect(sx(within.ci), sy(within.ri), size * within.span, size * within.rows);
    ctx.clip();
    const lines = wrap(run.style, run.text, run.span);
    const room = fits(m.size, run.span - m.inset * 2);
    const shown = Math.max(1, Math.floor((box.h - size * m.pad) / leading));
    for (let i = 0; i < Math.min(lines.length, shown); i++) {
      const last = i === shown - 1 && lines.length > shown;
      const line = (lines[i] as string).trimEnd();
      ctx.fillText(
        clip(last ? `${line} ${lines[i + 1] ?? ""}` : line, room),
        x + inset,
        y + size * m.pad + leading * (i + 0.5),
      );
    }
    ctx.restore();
  };

  const spotAt = new Map<string, Occupant>();
  for (const spot of occupied) for (const [ci, ri] of cellsOf(spot)) spotAt.set(`${ci},${ri}`, spot);
  const runAt = new Map<string, TextRun>();
  for (const run of texts) for (const [ci, ri] of cellsOf(run)) runAt.set(`${ci},${ri}`, run);
  /*
   * A host is filled as one rectangle, never cell by cell: adjacent fills at fractional
   * positions antialias along their shared edge and leave a faint seam where no line is
   * drawn. Repainting any of its cells repaints all of it, which is the same pixels.
   */
  const paintSpot = (spot: Occupant) => {
    const x = sx(spot.ci);
    const y = sy(spot.ri);
    const w = size * spot.span;
    const h = size * spot.rows;
    ctx.fillStyle = hue(spot.hue).fill;
    ctx.fillRect(x, y, w, h);
    mark(ctx, spot, x, y, size);
  };
  /*
   * A host's outline is the gridline segments around it, drawn in its edge hue, once
   * each. An edge two hosts share is one segment, so it is drawn once and is exactly as
   * thick as every other edge. Drawn after the hosts it borders are painted.
   */
  const rims = (spots: Iterable<Occupant>) => {
    if (rule <= 0) return;
    const seen = new Set<string>();
    const paths = new Map<number | null, Path2D>();
    const add = (key: string, spot: Occupant, x0: number, y0: number, x1: number, y1: number) => {
      if (seen.has(key)) return;
      seen.add(key);
      const path = paths.get(spot.hue) ?? new Path2D();
      paths.set(spot.hue, path);
      path.moveTo(x0, y0);
      path.lineTo(x1, y1);
    };
    for (const spot of spots) {
      for (let r = spot.ri; r < spot.ri + spot.rows; r++) {
        for (const c of [spot.ci, spot.ci + spot.span]) add(`v${c},${r}`, spot, snap(sx(c)), sy(r), snap(sx(c)), sy(r) + size);
      }
      for (let c = spot.ci; c < spot.ci + spot.span; c++) {
        for (const r of [spot.ri, spot.ri + spot.rows]) add(`h${c},${r}`, spot, sx(c), snap(sy(r)), sx(c) + size, snap(sy(r)));
      }
    }
    ctx.save();
    ctx.globalAlpha = RIM * rule;
    ctx.lineWidth = RULE;
    for (const [h, path] of paths) {
      ctx.strokeStyle = hue(h).edge;
      ctx.stroke(path);
    }
    ctx.restore();
  };
  /** Repaint regions over whatever was drawn, hosts with their outlines. */
  const repaint = (regions: readonly Region[]) => {
    const spots = new Set<Occupant>();
    for (const r of regions) {
      for (const [ci, ri] of cellsOf(r)) {
        paintCell(ci, ri);
        const spot = spotAt.get(`${ci},${ri}`);
        if (spot) spots.add(spot);
      }
    }
    rims(spots);
  };
  const paintCell = (ci: number, ri: number) => {
    const spot = spotAt.get(`${ci},${ri}`);
    if (spot) {
      paintSpot(spot);
      return;
    }
    const cell = at(ci, ri);
    ctx.fillStyle = cell?.hue == null ? palette.page : hue(cell.hue).tint;
    ctx.fillRect(sx(ci), sy(ri), size, size);
    const run = runAt.get(`${ci},${ri}`);
    if (run) drawRun(run, { ci, ri, span: 1, rows: 1 });
  };

  // Scopes, beneath the ruling.
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
   * Boundaries that fall inside a tile, which the ruling omits.
   *
   * A tile's extent is canonical — it owns whole cells — so the lines inside it are known
   * and can simply not be drawn. The previous version drew them and then painted over
   * them, which is why the ends came out uneven: painting over a line at a fractional
   * position antialiases differently cell by cell, and the overdraw needed to close the
   * seams spilled into whatever was next door.
   */
  const inside = new Set<string>();
  for (const run of [...texts, ...occupied]) {
    for (let dy = 0; dy < run.rows; dy++) {
      for (let dx = 1; dx < run.span; dx++) inside.add(`v${run.ci + dx},${run.ri + dy}`);
    }
    for (let dy = 1; dy < run.rows; dy++) {
      for (let dx = 0; dx < run.span; dx++) inside.add(`h${run.ci + dx},${run.ri + dy}`);
    }
  }

  if (rule > 0) {
    const rules = (a: number, b: number, p: number, q: number): Path2D => {
      const path = new Path2D();
      for (let ci = a; ci <= b + 1; ci++) {
        const x = snap(sx(ci));
        for (let ri = p; ri <= q; ri++) {
          if (inside.has(`v${ci},${ri}`)) continue;
          const y = sy(ri);
          path.moveTo(x, y);
          path.lineTo(x, y + size);
        }
      }
      for (let ri = p; ri <= q + 1; ri++) {
        const y = snap(sy(ri));
        for (let ci = a; ci <= b; ci++) {
          if (inside.has(`h${ci},${ri}`)) continue;
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

  // Occupied cells after the ruling, so it does not cross them.
  const shown = occupied.filter((spot) => !(spot.ci + spot.span - 1 < c0 || spot.ci > c1 || spot.ri + spot.rows - 1 < r0 || spot.ri > r1));
  for (const spot of shown) paintSpot(spot);
  rims(shown);

  // Text, each run whole. A run under a veil or inside a proposal is redrawn per cell by
  // paintCell, clipped to that cell, so it composes with whatever is repainted around it.
  for (const run of texts) {
    if (run.ci + run.span - 1 < c0 || run.ci > c1) continue;
    if (run.ri + run.rows - 1 < r0 || run.ri > r1) continue;
    drawRun(run, run);
  }

  /*
   * The caret of the run being typed: a bar at the font's height, where the input says its
   * caret is, blinking on the shared counter. The input's own caret is hidden, since a
   * textarea's is as tall as its line box, a whole cell for a title.
   */
  if (caret && rule > 0 && Math.floor(dash / CARET_BLINK) % 2 === 0) {
    const m = METRICS[caret.style];
    const cx = sx(caret.ci) + size * m.inset + caret.column * size * m.size * ADVANCE;
    // Less however far the input has scrolled its lines up to keep the caret in view.
    const cy = sy(caret.ri) + size * m.pad + size * m.leading * (caret.line + 0.5) - size * caret.scroll;
    const half = size * m.size * 0.62;
    ctx.fillStyle = hue(caret.hue).ink;
    ctx.fillRect(Math.round(cx), Math.round(cy - half), CARET, Math.round(half * 2));
  }

  /*
   * Focus on an agent: everything else is veiled back toward the page, then the agent, the
   * ones it is talking to, and the lines between them are drawn over the veil. Dimming is
   * one rectangle rather than a decision made per cell, and lines are only ever drawn
   * inside a focus — which is what keeps a canvas of relationships from becoming a web.
   */
  if (focus) {
    const centre = (r: Region) => [sx(r.ci) + (size * r.span) / 2, sy(r.ri) + (size * r.rows) / 2] as const;
    ctx.fillStyle = palette.veil;
    ctx.fillRect(0, 0, width, height);

    const h = hue(focus.hue);
    repaint([...focus.partners, focus]);

    /*
     * Lines run over the tiles rather than stopping at their edges, and end in a dot at
     * each agent's centre. Two agents in neighbouring cells would otherwise have their
     * connection entirely hidden underneath them.
     *
     * The route turns rather than cutting across: a diagonal ignores the grid it is drawn
     * on, and on a ruled surface that reads as a mistake. One corner, rounded.
     */
    const [fx, fy] = centre(focus.anchor);
    const halfW = (size * focus.anchor.span) / 2;
    const halfH = (size * focus.anchor.rows) / 2;
    /** Where a line to a partner leaves the focused agent's edge: straight out of the side
     *  facing the partner when the partner lies within its width or height, else from the
     *  middle of the side it turns toward. */
    const leave = (px: number, py: number): readonly [number, number] =>
      Math.abs(px - fx) < halfW
        ? [px, fy + Math.sign(py - fy) * halfH]
        : Math.abs(py - fy) < halfH
          ? [fx + Math.sign(px - fx) * halfW, py]
          : [fx + Math.sign(px - fx) * halfW, fy];
    ctx.strokeStyle = h.edge;
    ctx.lineWidth = LINK_EDGE;
    ctx.lineCap = "round";
    ctx.setLineDash(LINK_DASH);
    ctx.lineDashOffset = -dash;
    ctx.beginPath();
    for (const partner of focus.partners) {
      const [px, py] = centre(partner);
      // The focused agent is already ringed, so its line leaves from the edge rather than
      // from under its own mark. Partners are only identified by what arrives at them.
      const out = leave(px, py);
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
    for (const partner of focus.partners) stop(...centre(partner));
    // And where each line leaves the focused agent, so a connection is marked at both
    // ends. Two partners in the same direction share a departure point, which is correct:
    // the dot says links leave this way, not how many.
    for (const partner of focus.partners) {
      const [px, py] = centre(partner);
      if (px === fx && py === fy) continue;
      stop(...leave(px, py));
    }

    ctx.lineWidth = FOCUS_EDGE;
    ctx.strokeStyle = h.edge;
    const inset = FOCUS_EDGE / 2;
    ctx.strokeRect(sx(focus.ci) + inset, sy(focus.ri) + inset, size * focus.span - FOCUS_EDGE, size * focus.rows - FOCUS_EDGE);
  }

  // What is being acted on stays ringed for as long as it is being acted on, so a menu or
  // a rename does not make the thing it is about stop being pointed at.
  /*
   * A ring around a region, inset by half its stroke so it sits inside the cells. Corner
   * brackets say "held": a selection has them, and while shift previews a larger
   * selection they move out to the preview, which is the thing about to be held.
   */
  const ring = (r: Region, colour: string, dashed: boolean, corners: boolean) => {
    const inset = FOCUS_EDGE / 2;
    const x0 = sx(r.ci) + inset;
    const y0 = sy(r.ri) + inset;
    const x1 = x0 + size * r.span - FOCUS_EDGE;
    const y1 = y0 + size * r.rows - FOCUS_EDGE;
    ctx.lineWidth = FOCUS_EDGE;
    ctx.strokeStyle = colour;
    if (dashed) {
      ctx.setLineDash(LINK_DASH);
      ctx.lineDashOffset = -dash;
    }
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.setLineDash([]);
    if (!corners) return;
    const arm = Math.min(CORNER, (x1 - x0) / 3, (y1 - y0) / 3);
    ctx.lineWidth = FOCUS_EDGE * 2;
    ctx.lineCap = "butt";
    ctx.beginPath();
    for (const [x, y, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ] as const) {
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
    }
    ctx.stroke();
  };

  if (about && rule > 0) ring(about, hue(about.hue).edge, false, false);

  if (selected && rule > 0) {
    ring(
      selected,
      selected.invalid ? palette.warn : hue(selected.hue).edge,
      false,
      selected.corners && !extending,
    );
  }

  /*
   * A proposed move: an arrow from where a thing was to where it would go, and a ring
   * around the destination. Refused proposals are drawn the same way in the one colour
   * that means no, so the shape of the answer does not change with the answer.
   */
  if (proposal && rule > 0) {
    const centre = (r: Region) =>
      [sx(r.ci) + (size * r.span) / 2, sy(r.ri) + (size * r.rows) / 2] as const;
    /*
     * Both regions are lit and outlined, always. A proposal is a statement about two
     * places, so both are shown — rather than leaving one of them to whatever the focus
     * veil happened to restore, which lit a cell only when it was a link partner of the
     * dragged agent and so worked or did not depending on something unrelated.
     */
    repaint([proposal.from, proposal.to]);

    const [ax, ay] = centre(proposal.from);
    const [bx, by] = centre(proposal.to);
    /** Where a ray from the centre leaves a region's edge, so the path runs edge to edge
     *  rather than centre to centre and is not buried under what it connects. */
    const toEdge = (r: Region, ux: number, uy: number) => {
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

  if (extending && rule > 0) {
    ring(extending, extending.invalid ? palette.warn : hue(extending.hue).edge, true, true);
  }

  // Scope handles: a square straddling the plate's corner, in the scope's own edge
  // colour, on top of whatever else is drawn there so it can always be reached. The name
  // sits to its right while the pointer is on it.
  for (const h of handles) {
    if (rule <= 0) break;
    const cx = sx(h.ci);
    const cy = sy(h.ri);
    ctx.fillStyle = hue(h.hue).edge;
    ctx.fillRect(cx - HANDLE / 2, cy - HANDLE / 2, HANDLE, HANDLE);
    if (h.name) {
      ctx.font = `500 ${HANDLE_NAME}px ${FONT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = hue(h.hue).ink;
      // Above the corner, clear of the ruling it would otherwise sit across.
      ctx.fillText(h.name, cx + HANDLE / 2 + 4, cy - HANDLE / 2 - 5);
    }
  }

  // Pointing at a scope's handle rings the scope, and nothing else is hovered.
  if (pointing && rule > 0) ring(pointing, hue(pointing.hue).edge, false, false);

  /*
   * A resize in flight. The cells being made are hatched in the scope's edge colour, so
   * what is new is visible as new; a refused one hatches in the warning colour and rings
   * the scope in it. A legal one gets no ring: the selection ring, the lit line and the
   * hatching say everything, and a second ring in another colour read as a warning.
   */
  if (growing && rule > 0) {
    const colour = growing.ok ? hue(selected?.hue ?? null).edge : palette.warn;
    for (const band of growing.bands) {
      const x = sx(band.ci);
      const y = sy(band.ri);
      const w = size * band.span;
      const h = size * band.rows;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Diagonal stripes, spaced in screen pixels, so the hatch reads the same at any zoom.
      for (let d = -h; d < w + h; d += HATCH) {
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d + h, y + h);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (!growing.ok) ring(growing, palette.warn, false, false);
  }

  /*
   * The lit gridlines of the selected scope, across the whole scope, and a grip under the
   * pointer saying what kind of line it holds: a pill along one line, a cross where two
   * interior lines meet, a rounded corner at a corner.
   */
  if (lines && rule > 0) {
    const { region: r } = lines;
    const colour = hue(lines.hue).edge;
    ctx.strokeStyle = colour;
    ctx.lineWidth = LINE_LIT;
    ctx.lineCap = "round";
    ctx.beginPath();
    const x0 = sx(r.ci);
    const x1 = sx(r.ci + r.span);
    const y0 = sy(r.ri);
    const y1 = sy(r.ri + r.rows);
    if (lines.c !== null) {
      const x = snap(sx(lines.c));
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    if (lines.r !== null) {
      const y = snap(sy(lines.r));
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
    ctx.lineCap = "butt";

    if (lines.cursor) {
      const pill = (x: number, y: number, w: number, h: number) => {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, GRIP / 2);
        ctx.fill();
      };
      ctx.fillStyle = colour;
      const onEdgeC = lines.c === r.ci || lines.c === r.ci + r.span;
      const onEdgeR = lines.r === r.ri || lines.r === r.ri + r.rows;
      const clampY = Math.min(Math.max(lines.cursor.y, y0 + GRIP_LEN / 2), y1 - GRIP_LEN / 2);
      const clampX = Math.min(Math.max(lines.cursor.x, x0 + GRIP_LEN / 2), x1 - GRIP_LEN / 2);
      if (lines.c !== null && lines.r !== null) {
        const cx = sx(lines.c);
        const cy = sy(lines.r);
        if (onEdgeC && onEdgeR) {
          // A corner: two arms from the corner point, into the scope.
          const dx = lines.c === r.ci ? 1 : -1;
          const dy = lines.r === r.ri ? 1 : -1;
          pill(dx > 0 ? cx - GRIP / 2 : cx - GRIP_LEN + GRIP / 2, cy - GRIP / 2, GRIP_LEN, GRIP);
          pill(cx - GRIP / 2, dy > 0 ? cy - GRIP / 2 : cy - GRIP_LEN + GRIP / 2, GRIP, GRIP_LEN);
        } else {
          // Two interior lines meeting: a cross, held on both axes.
          pill(cx - GRIP_LEN / 2, cy - GRIP / 2, GRIP_LEN, GRIP);
          pill(cx - GRIP / 2, cy - GRIP_LEN / 2, GRIP, GRIP_LEN);
        }
      } else if (lines.c !== null) {
        pill(sx(lines.c) - GRIP / 2, clampY - GRIP_LEN / 2, GRIP, GRIP_LEN);
      } else if (lines.r !== null) {
        pill(clampX - GRIP_LEN / 2, sy(lines.r) - GRIP / 2, GRIP_LEN, GRIP);
      }
    }
  }

  // The hovered cell. Whether one is hovered at all was decided upstream, where the one
  // thing the pointer is on was chosen; the paint does not arbitrate.
  if (hover && rule > 0) {
    const [ci, ri] = hover;
    const cell = at(ci, ri);
    const colour = hue(cell?.hue ?? null).edge;
    const inset = FOCUS_EDGE / 2;
    // Whatever is under the pointer is ringed whole, not by the cell it was touched on. An
    // empty cell inside the selection is not: the selection is already the thing pointed
    // at. A tile inside it is still a thing, and is.
    const box = cell?.extent ?? { ci, ri, span: 1, rows: 1 };
    if (cell?.occupied || !(selected && contains(selected, ci, ri))) {
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
    }

    // Inside the selection shift still means act, so the plus shows there too.
    if (!cell?.occupied && shift && (!selected || contains(selected, ci, ri))) {
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
