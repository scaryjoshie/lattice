import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCamera } from "./camera.ts";
import { type Camera, CELL, cellAt, worldX } from "./geometry.ts";
import {
  indexOfTrack,
  type Move,
  proposeMove,
  columnsFor,
  rowsFor,
  bounds,
  close,
  footprint,
  wellFormed,
  scopeAt,
  type TextStyle,
  type TileKind,
} from "./model.ts";
import { cells as cellsOf, contains, type Region } from "./region.ts";
import {
  type Cell,
  type Scene,
  type Focus,
  type Occupant,
  paint,
  type Plate,
  type TextRun,
} from "./paint.ts";
import { cellsFor, fontOf, linesFor, METRICS, nameFont, spanFor } from "./measure.ts";
import { Keys, type Mode } from "./Keys.tsx";
import { Menu, TileMenu } from "./Menu.tsx";
import { claimed } from "./pointer.ts";
import { useGrid } from "./store.ts";
import { onTheme } from "./theme.ts";

/**
 * Two layers over one camera. The canvas paints every cell, occupied or not, so that cells
 * can later know about their neighbours without any DOM being involved. The tile layer is
 * transparent and sits on top, because a tile eventually holds a terminal and that has to
 * be real text in a real element.
 *
 * React renders when the model changes. Panning and zooming call `draw` and nothing else.
 */
/**
 * Typing a run.
 *
 * The span follows the words, cell by cell, so nothing is cleared before there is
 * something to put in it. It stops at the first cell that already holds something — the
 * way a spreadsheet lets text spill into empty neighbours and cuts it off at a full one —
 * because two things cannot be in one cell, and pushing the neighbour aside needs a notion
 * of what may be pushed that does not exist yet.
 */
function Editor({
  id,
  onDone,
  onShape,
}: {
  id: string;
  onDone(): void;
  onShape(span: number, rows: number): void;
}) {
  const grid = useGrid((s) => s.grid);
  const setText = useGrid((s) => s.setText);
  const removeTile = useGrid((s) => s.remove);
  const tile = grid.tiles.find((x) => x.id === id);
  const [draft, setDraft] = useState(tile?.text ?? "");

  if (!tile) return null;
  const ci = indexOfTrack(grid.columns, tile.columnId);
  const ri = indexOfTrack(grid.rows, tile.rowId);
  const style = tile.style ?? "title";
  const m = METRICS[style];

  const span = columnsFor(grid, id, ci, ri, spanFor(style, draft || " "));
  /*
   * Wrapping is what running out of room means. If the words need more width than there
   * is, they go down instead — as far as there is room below at that width, and no
   * further, at which point the paint cuts them with an ellipsis.
   */
  // In cells, not lines: a note fits several lines in a cell, a title exactly one.
  const rows = rowsFor(grid, id, ci, ri, span, cellsFor(style, linesFor(style, draft, span)));
  // The canvas owns the surface and the ruling even while typing; the input contributes
  // only a caret and glyphs, so it has to say how far it currently reaches.
  // Both, not just the width: the canvas leaves a run's cells unruled while it is being
  // typed, and it can only do that for cells it has been told about.
  onShape(span, rows);
  const commit = () => {
    onDone();
    if (draft.trim() === "") removeTile(id);
    else setText(id, draft, span, rows);
  };

  return (
    <textarea
      className="editor"
      autoFocus
      spellCheck={false}
      value={draft}
      rows={1}
      style={{
        left: worldX(ci),
        top: worldX(ri) + CELL * m.pad,
        height: CELL * rows - CELL * m.pad,
        width: CELL * span,
        paddingLeft: CELL * m.inset,
        paddingRight: CELL * m.inset,
        font: fontOf(style, CELL),
        // After `font`, not before: the shorthand resets line-height to normal, so setting
        // it first is silently undone. An input centres its own text; a textarea needs the
        // line box to be the cell for one line to sit where the input's did.
        lineHeight: `${CELL * m.leading}px`,
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Enter commits. Shift-enter is a line break, which the textarea inserts itself.
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          onDone();
          if ((tile.text ?? "") === "") removeTile(id);
        }
      }}
    />
  );
}

/**
 * Naming a tile. A name has exactly the one cell its tile occupies, so it is typed in the
 * place it will live and at the size it will be, and is cut to fit rather than allowed to
 * spill — an occupant owns one cell and its name cannot claim more.
 */
function Namer({ id, onDone }: { id: string; onDone(): void }) {
  const grid = useGrid((s) => s.grid);
  const setName = useGrid((s) => s.setName);
  const tile = grid.tiles.find((x) => x.id === id);
  const [draft, setDraft] = useState(tile?.name ?? "");
  if (!tile) return null;
  const ci = indexOfTrack(grid.columns, tile.columnId);
  const ri = indexOfTrack(grid.rows, tile.rowId);
  const commit = () => {
    onDone();
    setName(id, draft);
  };
  return (
    <input
      className="editor namer"
      autoFocus
      spellCheck={false}
      value={draft}
      style={{
        left: worldX(ci),
        top: worldX(ri) + CELL * 0.69,
        width: CELL,
        height: CELL * 0.2,
        font: nameFont(CELL),
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") onDone();
      }}
    />
  );
}

/** The smallest region holding both a region and a cell: what shift-click extends to. */
function reach(r: Region, [ci, ri]: readonly [number, number]): Region {
  const c0 = Math.min(r.ci, ci);
  const r0 = Math.min(r.ri, ri);
  return {
    ci: c0,
    ri: r0,
    span: Math.max(r.ci + r.span - 1, ci) - c0 + 1,
    rows: Math.max(r.ri + r.rows - 1, ri) - r0 + 1,
  };
}

export function Grid() {
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const hover = useRef<[number, number] | null>(null);
  /** Shift is held. A ref, like hover: it changes at key speed and only the paint reads it. */
  const shift = useRef(false);
  /** Where the pointer last was, so hover can be picked back up when a menu closes. */
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const grid = useGrid((s) => s.grid);
  const addAt = useGrid((s) => s.addAt);
  const applyMoves = useGrid((s) => s.apply);
  const removeTile = useGrid((s) => s.remove);

  /** Open at the pointer, holding the cell it was asked about. */
  const [menu, setMenu] = useState<{ x: number; y: number; ci: number; ri: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editShape, setEditShape] = useState({ span: 1, rows: 1 });
  /** The tile being renamed, if any. */
  const [naming, setNaming] = useState<string | null>(null);
  /** Right-click on something that is already there. */
  const [acting, setActing] = useState<{ x: number; y: number; id: string } | null>(null);
  /**
   * What is selected: a tile, or a region of cells. Always a region underneath — selecting
   * a tile is shorthand for selecting the region it owns — but a tile is remembered by id
   * so the selection follows it rather than the cells it happened to be on.
   */
  const [selection, setSelection] = useState<{ tile: string } | { region: Region } | null>(null);
  /** Where a press started, so a drag that pans is not also read as a click. */
  const pressed = useRef<{ x: number; y: number } | null>(null);
  /**
   * Whether the press that is happening was one that dismissed something. A click that
   * closes an overlay is spent closing it and does nothing else.
   *
   * It has to be recorded at pointer-down, because an input commits on blur and blur
   * happens between the press and the release — so by the time the release is handled,
   * the thing that was open has already gone and the release looks like a click on empty
   * canvas.
   */
  const dismissing = useRef(false);
  /** The move in progress, while shift is held. */
  /**
   * `grab` is where inside the tile it was picked up, as an offset from its own corner. A
   * multi-cell run grabbed by its far end would otherwise be placed as though the pointer
   * were on its corner, jumping sideways the moment the drag began.
   */
  const dragging = useRef<{
    /** The one tile being carried, if it is one tile: its links stay lit as it goes. */
    id: string | null;
    from: Region;
    grab: [number, number];
  } | null>(null);
  /** State, not a ref: the scene is derived from it, and it changes a cell at a time. */
  const [held, setHeld] = useState<{
    id: string | null;
    from: Region;
    to: Region;
    /** Everywhere the proposal would put something. Empty when it is refused. */
    moves: readonly Move[];
    ok: boolean;
    swaps: boolean;
  } | null>(null);

  /**
   * Derived from the model, so it is rebuilt when the model changes and never on a camera
   * event. Recomputing it per wheel event was allocating a map hundreds of times a second
   * for data that had not moved.
   */
  const gridRef = useRef(grid);
  gridRef.current = grid;

  const scene = useMemo(() => {
    /*
     * Where a tile is *while the drag is happening*, which is not where the model says it
     * is. Doing it here rather than in the paint means nothing downstream knows a drag
     * exists: the cell a tile left is empty, and empty cells already know how to look.
     */
    const carry = held?.ok ? held : null;
    const proposed = new Map(carry?.moves.map((m) => [m.id, m]) ?? []);
    const placed = (tile: { id: string; columnId: string; rowId: string }): [number, number] => {
      const m = proposed.get(tile.id);
      if (m) return [m.ci, m.ri];
      return [indexOfTrack(grid.columns, tile.columnId), indexOfTrack(grid.rows, tile.rowId)];
    };
    /** A scope's bounds, where the drag would put it. */
    const placedScope = (scope: (typeof grid.scopes)[number]): Region => {
      const b = bounds(grid, scope);
      const m = proposed.get(scope.id);
      return m ? { ...b, ci: m.ci, ri: m.ri } : b;
    };

    /*
     * A tile's colour is the region it belongs to according to the *model* — never
     * according to where a proposal would put it. Nothing changes colour because of a
     * move that has not happened, which covers the tile being carried and equally the one
     * it would displace.
     */
    const hueAt = (tile: { id: string; columnId: string; rowId: string }): number | null =>
      scopeAt(
        grid,
        indexOfTrack(grid.columns, tile.columnId),
        indexOfTrack(grid.rows, tile.rowId),
      )?.hue ?? null;

    const cells = new Map<string, Cell>();
    const plates: Plate[] = [];
    for (const scope of grid.scopes) {
      const b = placedScope(scope);
      plates.push({ hue: scope.hue, c0: b.ci, c1: b.ci + b.span - 1, r0: b.ri, r1: b.ri + b.rows - 1 });
      for (const [ci, ri] of cellsOf(b)) cells.set(`${ci},${ri}`, { hue: scope.hue, occupied: false });
    }
    for (const tile of grid.tiles) {
      if (tile.id === editing) continue;
      const [ci, ri] = placed(tile);
      const extent = { ci, ri, span: tile.span ?? 1, rows: tile.rows ?? 1 };
      for (const [c, r] of cellsOf(extent)) {
        cells.set(`${c},${r}`, {
          hue: cells.get(`${c},${r}`)?.hue ?? null,
          occupied: true,
          tileId: tile.id,
          // Selecting a run selects all of it, not the one cell under the pointer.
          extent,
        });
      }
    }
    const occupied: Occupant[] = [];
    const texts: TextRun[] = [];
    for (const tile of grid.tiles) {
      const [ci, ri] = placed(tile);
      const h = hueAt(tile);
      if (tile.kind === "text") {
        if (tile.id === editing) {
          // No glyphs — the input draws those — but the cells it covers stay unruled.
          texts.push({
            ci,
            ri,
            span: editShape.span,
            rows: editShape.rows,
            style: tile.style ?? "title",
            text: "",
            hue: h,
          });
        } else {
          texts.push({
            ci,
            ri,
            span: tile.span ?? 1,
            rows: tile.rows ?? 1,
            style: tile.style ?? "title",
            text: tile.text ?? "",
            hue: h,
          });
        }
      }
      else
        occupied.push({
          ci,
          ri,
          kind: tile.kind,
          name: tile.id === naming ? undefined : tile.name,
          hue: h,
        });
    }
    /** Every tile's extent, so anything being acted on can be ringed whole. */
    const tiles = new Map<string, { ci: number; ri: number; span: number; rows: number; hue: number | null }>();
    for (const tile of grid.tiles) {
      const [ci, ri] = placed(tile);
      tiles.set(tile.id, {
        ci,
        ri,
        span: tile.id === editing ? editShape.span : (tile.span ?? 1),
        rows: tile.id === editing ? editShape.rows : (tile.rows ?? 1),
        hue: hueAt(tile),
      });
    }

    const spots = new Map<string, Occupant>();
    for (const tile of grid.tiles) {
      if (tile.kind === "text") continue;
      const [ci, ri] = placed(tile);
      spots.set(tile.id, { ci, ri, kind: tile.kind, hue: hueAt(tile) });
    }
    /** Agent tile id by cell, so hovering a cell can find what is talking to what. */
    const byCell = new Map<string, string>();
    for (const [id, spot] of spots) byCell.set(`${spot.ci},${spot.ri}`, id);
    /*
     * What is being acted on: shown a menu, renamed, edited, or selected. One thing at a
     * time, and the ring around it. A region selection is valid on the same terms as a
     * move — one scope or none, and nothing half in and half out.
     */
    const subject =
      acting?.id ?? naming ?? editing ?? (selection && "tile" in selection ? selection.tile : null);
    const region = selection && "region" in selection ? selection.region : null;
    const usable = (r: Region): boolean => wellFormed(grid, r);
    /*
     * Two rings, for two questions. `about` is what a menu, a rename or an edit is about:
     * a tile, or for the add menu the cell it was asked on. `selected` is the selection.
     * They are separate so a selection stays ringed while a menu is open about something
     * else. Brackets say "held"; while a move is proposed the proposal says it instead.
     */
    const acted = acting?.id ?? naming ?? editing;
    // One ring where the thing acted on is also the thing selected.
    const own = selection !== null && "tile" in selection && selection.tile === acted;
    const about: Scene["about"] = acted
      ? own
        ? null
        : (tiles.get(acted) ?? null)
      : menu
        ? { ci: menu.ci, ri: menu.ri, span: 1, rows: 1, hue: scopeAt(grid, menu.ci, menu.ri)?.hue ?? null }
        : null;
    const corners = held === null;
    const selected: Scene["selected"] =
      selection && "tile" in selection
        ? (() => {
            const shape = tiles.get(selection.tile);
            return shape ? { ...shape, invalid: false, corners } : null;
          })()
        : region
          ? { ...region, hue: scopeAt(grid, region.ci, region.ri)?.hue ?? null, invalid: !usable(region), corners }
          : null;

    const heldTile = held?.id ? grid.tiles.find((x) => x.id === held.id) : undefined;
    const proposal = held
      ? {
          from: held.from,
          to: held.to,
          hue: heldTile ? hueAt(heldTile) : (scopeAt(grid, held.from.ci, held.from.ri)?.hue ?? null),
          ok: held.ok,
          swaps: held.swaps,
        }
      : null;
    return {
      cells,
      plates,
      occupied,
      texts,
      spots,
      byCell,
      tiles,
      links: grid.links,
      carried: carry,
      proposal,
      subject,
      about,
      selected,
      usable,
    };
  }, [grid, editing, editShape, naming, acting, menu, selection, held]);

  const model = useRef(scene);
  model.current = scene;

  const draw = useCallback((camera: Camera) => {
    const el = canvas.current;
    const host = viewport.current;
    if (!el || !host) return;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: width, clientHeight: height } = host;
    // Rounded before comparing: canvas.width is an integer, so a fractional dpr would make
    // this compare unequal forever and reallocate the backing store every single frame.
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    // Opaque: nothing behind the canvas shows through, so the page fill is a copy
    // rather than a blend and the compositor skips one step.
    const ctx = el.getContext("2d", { alpha: false });
    if (!ctx) return;

    const { cells, plates, occupied, texts, spots, byCell, links, carried, proposal, subject, about, selected, usable } =
      model.current;

    // With something selected, shift previews the rectangle a shift-click would select.
    const extending: Scene["extending"] =
      shift.current && selected && hover.current && !proposal && !contains(selected, ...hover.current)
        ? (() => {
            const r = close(gridRef.current, reach(selected, hover.current));
            return { ...r, hue: selected.hue, invalid: !usable(r) };
          })()
        : null;

    // Focus is derived from what the pointer is on, not stored. Hovering an agent is the
    // question "who is this one talking to", and the answer is a read of the model.
    /*
     * While moving an agent its connections stay lit: that is the one thing still worth
     * knowing mid-drag, and it comes from the tile being dragged rather than from wherever
     * the pointer was when the drag began.
     */
    /*
     * Focus survives a menu and a rename. Opening a menu about an agent is still being
     * about that agent, so its connections stay lit and everything else stays back — the
     * alternative is the lines going out and the page brightening the moment you act,
     * which is a change that says nothing happened when something did.
     */
    let focus: Focus | null = null;
    const spot =
      carried?.id ?? subject ?? (hover.current && byCell.get(`${hover.current[0]},${hover.current[1]}`));
    if (spot) {
      const here = spots.get(spot);
      if (here) {
        const partners = links
          .filter((l) => l.from === spot || l.to === spot)
          .map((l) => spots.get(l.from === spot ? l.to : l.from))
          .filter((s): s is NonNullable<typeof s> => Boolean(s));
        // Every agent focuses, talking or not. Dimming that depended on whether an agent
        // happened to have links would make the canvas respond unevenly to the same act.
        const anchor =
          carried?.id === spot ? { ci: carried.from.ci, ri: carried.from.ri } : { ci: here.ci, ri: here.ri };
        focus = { ...here, anchor, partners };
      }
    }

    paint(
      ctx,
      {
        camera,
        width,
        height,
        dpr,
        plates,
        cells,
        occupied,
        texts,
        focus,
        about,
        selected,
        proposal,
        hover: hover.current,
        shift: shift.current,
        extending,
      },
      dash.current,
    );
    running.current = focus !== null || proposal !== null || extending !== null;

    // The tile layer rides the same transform, written directly for the same reason the
    // canvas is: nothing here should pass through a render.
    if (layer.current) {
      layer.current.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.k})`;
    }
  }, []);

  /**
   * A trackpad emits wheel events faster than the display refreshes, and painting on each
   * one does work nobody sees. One paint per frame, always the latest camera.
   */
  const queued = useRef(0);
  /** Advances only while something is focused, so an idle canvas paints nothing. */
  const dash = useRef(0);
  const running = useRef(false);
  /**
   * The latest camera, not the one that happened to queue the frame. Capturing `next` in
   * the closure instead paints the *first* event of each batch and discards the rest, so
   * every frame is stale by a variable amount — which reads as stutter while producing no
   * slow frames at all, and is why batching the drawing changed nothing.
   */
  const latest = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const schedule = useCallback(
    (next: Camera) => {
      latest.current = next;
      if (queued.current) return;
      queued.current = requestAnimationFrame(() => {
        queued.current = 0;
        draw(latest.current);
      });
    },
    [draw],
  );

  /** Whether a press lands inside the selection, which makes it a move rather than a pan. */
  const inSelection = (event: { clientX: number; clientY: number }): boolean => {
    const host = viewport.current;
    const r = model.current.selected;
    if (!host || !r) return false;
    const box = host.getBoundingClientRect();
    const [ci, ri] = cellAt(latest.current, event.clientX - box.left, event.clientY - box.top);
    return contains(r, ci, ri);
  };

  // While a menu, a rename or an edit is open the camera is still: the press that closes
  // it is spent closing it, and the wheel would slide the cell out from under the menu.
  const overlay = menu !== null || acting !== null || editing !== null || naming !== null;
  const { camera, shift: shiftView } = useCamera(
    viewport,
    schedule,
    (event) => overlay || (event.type === "mousedown" && !event.shiftKey && inSelection(event)),
  );

  // The dashes crawl, which is what makes a live connection look live. The loop exists
  // only while a focus does; with nothing focused the canvas is still and costs nothing.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (running.current) {
        dash.current += 0.6;
        draw(latest.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  // Redraw on model change and on resize. Both are human-paced.
  useEffect(() => {
    draw(camera.current);
  }, [draw, camera, scene]);

  useEffect(() => onTheme(() => schedule(camera.current)), [schedule, camera]);

  useEffect(() => {
    const onResize = () => schedule(camera.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [schedule, camera]);

  // The plus follows shift. Losing the window drops it too, since the keyup that would
  // have cleared it goes to whatever took focus.
  useEffect(() => {
    const set = (held: boolean) => {
      if (shift.current === held) return;
      shift.current = held;
      schedule(camera.current);
    };
    const onKey = (e: KeyboardEvent) => {
      set(e.shiftKey);
      if (e.key === "Escape" && !claimed(e.target)) {
        if (dragging.current) {
          // Cancel the move: drop the proposal and spend the release on nothing.
          dragging.current = null;
          pressed.current = null;
          setHeld(null);
        } else setSelection(null);
      }
    };
    const onBlur = () => set(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [schedule, camera]);

  const onMove = (event: React.PointerEvent) => {
    pointer.current = { x: event.clientX, y: event.clientY };
    if (claimed(event.target)) return;
    const host = viewport.current;
    if (!host || menu || editing || naming || acting) return;
    if (dragging.current) {
      const at = cellUnder(event);
      if (at) {
        const carry = dragging.current;
        const to: Region = { ...carry.from, ci: at[0] - carry.grab[0], ri: at[1] - carry.grab[1] };
        // From the model, never from the scene: the scene is built from this answer.
        const verdict = proposeMove(gridRef.current, carry.from, to);
        hover.current = null;
        setHeld({ id: carry.id, from: carry.from, to, ...verdict });
      }
      return;
    }
    const box = host.getBoundingClientRect();
    const next = cellAt(camera.current, event.clientX - box.left, event.clientY - box.top);
    const prev = hover.current;
    if (prev === next) return;
    if (prev && next && prev[0] === next[0] && prev[1] === next[1]) return;
    hover.current = next;
    schedule(camera.current);
  };

  const cellUnder = (event: { clientX: number; clientY: number }) => {
    const host = viewport.current;
    if (!host) return null;
    const box = host.getBoundingClientRect();
    return cellAt(camera.current, event.clientX - box.left, event.clientY - box.top);
  };

  const onDown = (event: React.PointerEvent) => {
    if (claimed(event.target)) return;
    pressed.current = { x: event.clientX, y: event.clientY };
    dismissing.current = menu !== null || acting !== null || editing !== null || naming !== null;
    if (dismissing.current) return;
    const at = cellUnder(event);
    if (!at) return;
    const selected = model.current.selected;
    let from: Region | null = null;
    let id: string | null = null;
    const inside = selected !== null && contains(selected, at[0], at[1]);
    if (event.shiftKey && selected && !inside) {
      // Shift outside the selection extends it, on the release. Nothing to pick up.
      return;
    }
    if (inside && selected.invalid) {
      // A press on an invalid selection is the grid's, and it goes nowhere: the selection
      // is already drawn in the colour that says so. A drag does nothing; a click is a
      // click on the cell.
      return;
    }
    if (inside) {
      // A press inside the selection, shift or not, carries the selection. The camera has
      // already yielded the plain one.
      from = selected;
      id = selection && "tile" in selection ? selection.tile : null;
    } else if (event.shiftKey) {
      // Shift picks up whatever is under the pointer, text included.
      const tileId = model.current.cells.get(`${at[0]},${at[1]}`)?.tileId;
      const tile = tileId ? gridRef.current.tiles.find((x) => x.id === tileId) : undefined;
      if (!tile) return;
      from = footprint(gridRef.current, tile);
      id = tile.id;
    }
    if (!from) return;
    dragging.current = { id, from, grab: [at[0] - from.ci, at[1] - from.ri] };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onUp = (event: React.PointerEvent) => {
    if (claimed(event.target)) return;
    const start = pressed.current;
    pressed.current = null;
    const moved = !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3;
    if (dragging.current) {
      const at = cellUnder(event);
      const carry = dragging.current;
      dragging.current = null;
      setHeld(null);
      // A press inside the selection that never travelled is a click on it, not a move.
      if (at && moved) {
        const to: Region = { ...carry.from, ci: at[0] - carry.grab[0], ri: at[1] - carry.grab[1] };
        const verdict = proposeMove(gridRef.current, carry.from, to);
        if (verdict.ok) {
          const { dc, dr } = applyMoves(verdict.moves);
          // Tracks prepended on the way shift every index; the view shifts to match.
          if (dc || dr) {
            shiftView(-dc * CELL, -dr * CELL);
            hover.current = null;
          }
          // A selected tile follows itself; a selected region has to be told where it went.
          if (carry.id === null) setSelection({ region: { ...to, ci: to.ci + dc, ri: to.ri + dr } });
        }
        return;
      }
      if (moved) return;
    }
    const host = viewport.current;
    if (dismissing.current) {
      dismissing.current = false;
      setMenu(null);
      setActing(null);
      // Pick the hover back up where the pointer already is, rather than waiting for it
      // to move before the grid responds again.
      if (host) {
        const box = host.getBoundingClientRect();
        hover.current = cellAt(camera.current, event.clientX - box.left, event.clientY - box.top);
        schedule(camera.current);
      }
      return;
    }
    // A press that moved was a pan, not a click on a cell.
    if (moved || !host) return;
    const box = host.getBoundingClientRect();
    const [ci, ri] = cellAt(camera.current, event.clientX - box.left, event.clientY - box.top);
    const id = model.current.cells.get(`${ci},${ri}`)?.tileId ?? null;
    if (event.shiftKey) {
      // With a selection, shift-click selects the rectangle out to this cell. Without
      // one, shift-click acts: on an empty cell the act is the add menu; on a tile it
      // will be opening it, which does not exist yet.
      const anchor = model.current.selected;
      if (anchor && !contains(anchor, ci, ri)) {
        setSelection({ region: close(gridRef.current, reach(anchor, [ci, ri])) });
        return;
      }
      if (id) return;
      hover.current = null;
      setMenu({ x: event.clientX, y: event.clientY, ci, ri });
      return;
    }
    // Click selects, and clicking what is already selected clears it.
    setSelection((was) => {
      if (id) return was && "tile" in was && was.tile === id ? null : { tile: id };
      const same =
        was && "region" in was && was.region.ci === ci && was.region.ri === ri && was.region.span === 1 && was.region.rows === 1;
      return same ? null : { region: { ci, ri, span: 1, rows: 1 } };
    });
  };

  const onContextMenu = (event: React.MouseEvent) => {
    if (claimed(event.target)) return;
    event.preventDefault();
    const at = cellUnder(event);
    if (!at) return;
    const id = model.current.cells.get(`${at[0]},${at[1]}`)?.tileId;
    hover.current = null;
    // The menu for what is there. On an empty cell that is the add menu, which is also
    // what shift-click offers: the act and the menu are the same thing for a place.
    if (id) {
      setMenu(null);
      setActing({ x: event.clientX, y: event.clientY, id });
    } else {
      setActing(null);
      setMenu({ x: event.clientX, y: event.clientY, ci: at[0], ri: at[1] });
    }
    // Repaint now: otherwise the veil from hovering this agent lingers on a stale
    // canvas and then vanishes later, when something else happens to trigger a draw.
    schedule(camera.current);
  };

  /** Whatever closed a menu, the pointer is still somewhere, and that is still hovered. */
  const resume = () => {
    const host = viewport.current;
    const at = pointer.current;
    if (!host || !at) return;
    const box = host.getBoundingClientRect();
    hover.current = cellAt(camera.current, at.x - box.left, at.y - box.top);
    schedule(camera.current);
  };

  const pick = (kind: TileKind, style?: TextStyle) => {
    if (!menu) return;
    const made = addAt(menu.ci, menu.ri, kind, style);
    setMenu(null);
    if (made && (made.dc || made.dr)) {
      shiftView(-made.dc * CELL, -made.dr * CELL);
      hover.current = null;
    }
    if (made && kind === "text") {
      hover.current = null;
      // The run is what is selected now, and its ring grows with it as it is typed.
      setSelection({ tile: made.id });
      setEditing(made.id);
    } else resume();
  };

  const onLeave = () => {
    hover.current = null;
    schedule(camera.current);
  };

  const mode: Mode = editing || naming
    ? "typing"
    : menu
      ? "menu"
      : acting
        ? "list"
        : held
          ? "moving"
          : scene.selected
            ? scene.selected.invalid
              ? "invalid"
              : "selected"
            : "idle";

  return (
    <div
      className="viewport"
      ref={viewport}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onContextMenu={onContextMenu}
    >
      <canvas className="lattice" ref={canvas} />
      <div className="tiles" ref={layer}>
        {editing !== null && (
          <Editor
            id={editing}
            onDone={() => setEditing(null)}
            // Only when it actually changes: this is called during the editor's render,
            // and a fresh object would never compare equal, so the two would render each
            // other forever.
            onShape={(span, rows) =>
              setEditShape((was) => (was.span === span && was.rows === rows ? was : { span, rows }))
            }
          />
        )}
        {naming !== null && <Namer id={naming} onDone={() => setNaming(null)} />}
      </div>
      <Keys mode={mode} />
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onPick={pick}
          onClose={() => {
            setMenu(null);
            resume();
          }}
        />
      )}
      {acting && (
        <TileMenu
          x={acting.x}
          y={acting.y}
          isText={grid.tiles.find((x) => x.id === acting.id)?.kind === "text"}
          onClose={() => {
            setActing(null);
            resume();
          }}
          onPick={(action) => {
            const id = acting.id;
            setActing(null);
            resume();
            if (action === "delete") {
              removeTile(id);
              setSelection(null);
            }
            else if (grid.tiles.find((x) => x.id === id)?.kind === "text") {
              hover.current = null;
              setSelection({ tile: id });
              setEditing(id);
            }
            else setNaming(id);
          }}
        />
      )}
    </div>
  );
}
