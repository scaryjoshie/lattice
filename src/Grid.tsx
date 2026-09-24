import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCamera } from "./camera.ts";
import { type Camera, CELL, cellAt, worldX } from "./geometry.ts";
import {
  indexOfTrack,
  type Move,
  proposeMove,
  columnsFor,
  rowsFor,
  applied,
  bounds,
  proposeResize,
  type Axis,
  type Grid,
  type OccupantKind,
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
import { Opened, type Rect } from "./Opened.tsx";
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

  // A capped axis is the size the writer fixed; an uncapped one is what the words need.
  const span = columnsFor(grid, id, ci, ri, tile.cap?.span ?? spanFor(style, draft || " "));
  /*
   * Wrapping is what running out of room means. If the words need more width than there
   * is, they go down instead — as far as there is room below at that width, and no
   * further, at which point the paint cuts them with an ellipsis.
   */
  // In cells, not lines: a note fits several lines in a cell, a title exactly one.
  const rows = rowsFor(grid, id, ci, ri, span, tile.cap?.rows ?? cellsFor(style, linesFor(style, draft, span)));
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

/**
 * A selection, with a region that is exactly a scope's bounds read as that scope. Selecting
 * a worktree's cells is selecting the worktree; there is no second way to mean it.
 */
function selectionOf(grid: Grid, region: Region): { scope: string } | { region: Region } {
  const scope = grid.scopes.find((s) => {
    const b = bounds(grid, s);
    return b.ci === region.ci && b.ri === region.ri && b.span === region.span && b.rows === region.rows;
  });
  return scope ? { scope: scope.id } : { region };
}

/** How far an opened tile stops short of the viewport's edge, in screen pixels. */
const OPEN_INSET = 24;

/** How near a gridline the pointer must be to take hold of it, and how near a crossing to
 *  hold both of its lines, in screen pixels. */
const LINE_HIT = 9;
const INNER_HIT = 5;
const CROSS_HIT = 4;

/** The scope handle's hit area, in screen pixels. Drawn smaller; a target should be generous. */
const HANDLE_HIT = 24;

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
  /** The scope whose handle the pointer is on, if any. A ref like hover. */
  const hot = useRef<string | null>(null);

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
  /** An occupant opened: which, and the rectangles it scales between. */
  const [opened, setOpened] = useState<{ id: string; from: Rect; to: Rect; leaving?: boolean } | null>(null);
  /** Right-click on something that is already there. */
  const [acting, setActing] = useState<{ x: number; y: number; id: string } | null>(null);
  /**
   * What is selected: a tile, or a region of cells. Always a region underneath — selecting
   * a tile is shorthand for selecting the region it owns — but a tile is remembered by id
   * so the selection follows it rather than the cells it happened to be on.
   */
  const [selection, setSelection] = useState<
    { tile: string } | { scope: string } | { region: Region } | null
  >(null);
  /**
   * The press in progress: where it started, so a drag is not also read as a click, and
   * whether the grid holds it. Decided once, at pointer-down, which the browser fires
   * before the mousedown the camera listens to, so the camera only has to ask.
   */
  const pressed = useRef<{ x: number; y: number; held: boolean } | null>(null);
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
    /** The proposal as last previewed. The release applies this and proposes nothing. */
    proposal: { to: Region; ok: boolean; moves: readonly Move[] } | null;
  } | null>(null);
  /** State, not a ref: the scene is derived from it, and it changes a cell at a time. */
  /** A gridline of the selected scope being dragged: which line, and where it started. */
  const stretching = useRef<{ owner: string; c: number | null; r: number | null; wx: number; wy: number } | null>(null);
  /** A rectangle being swept out with shift held: where it started, as a region. */
  const sweeping = useRef<Region | null>(null);
  const [sweep, setSweep] = useState<Region | null>(null);
  /** The resize in progress, as the scene needs it. */
  const [grow, setGrow] = useState<{
    after: Region;
    ok: boolean;
    moves: readonly Move[];
    /** The cells being made, or for a shrink, unmade. */
    bands: readonly Region[];
    /** Where the dragged lines are now. */
    c: number | null;
    r: number | null;
  } | null>(null);
  /** The gridlines of the selected scope the pointer is on. A ref like hover. */
  const lineHot = useRef<{ c: number | null; r: number | null } | null>(null);
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
    // Whichever proposal is live, a move or a resize, says where things would be.
    const live = carry ?? (grow?.ok ? grow : null);
    const proposed = new Map(live?.moves.map((m) => [m.id, m]) ?? []);
    const placed = (tile: { id: string; columnId: string; rowId: string }): [number, number] => {
      const m = proposed.get(tile.id);
      if (m) return [m.ci, m.ri];
      return [indexOfTrack(grid.columns, tile.columnId), indexOfTrack(grid.rows, tile.rowId)];
    };
    /** A scope's bounds, where the drag would put it. */
    const placedScope = (scope: (typeof grid.scopes)[number]): Region => {
      const b = bounds(grid, scope);
      const m = proposed.get(scope.id);
      return m ? { ci: m.ci, ri: m.ri, span: m.span ?? b.span, rows: m.rows ?? b.rows } : b;
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
      plates.push({
        id: scope.id,
        name: scope.name,
        hue: scope.hue,
        c0: b.ci,
        c1: b.ci + b.span - 1,
        r0: b.ri,
        r1: b.ri + b.rows - 1,
      });
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
    const corners = held === null && grow === null;
    const selectedScope = selection && "scope" in selection ? grid.scopes.find((s) => s.id === selection.scope) : undefined;
    const selected: Scene["selected"] =
      selection && "tile" in selection
        ? (() => {
            const shape = tiles.get(selection.tile);
            return shape ? { ...shape, invalid: false, corners } : null;
          })()
        : selectedScope
          ? { ...placedScope(selectedScope), hue: selectedScope.hue, invalid: false, corners }
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
      selectedScope: selectedScope?.id ?? null,
      /** What the lit gridlines belong to: the selected scope with every line, or the
       *  selected run with its edges only. */
      resizable: selectedScope
        ? { id: selectedScope.id, region: placedScope(selectedScope), edgesOnly: false }
        : selection && "tile" in selection && grid.tiles.find((x) => x.id === selection.tile)?.kind === "text" && tiles.get(selection.tile)
          ? { id: selection.tile, region: tiles.get(selection.tile) as Region, edgesOnly: true }
          : null,
      /** The rectangle being swept, closed, if shift-drag is in progress. */
      sweep,
      /** The resize being proposed: the scope's new bounds, the cells it makes, whether it may. */
      growing: grow ? { ...grow.after, ok: grow.ok, bands: grow.bands } : null,
      /** Where the dragged lines are, while a resize is in flight. */
      growLines: grow ? { c: grow.c, r: grow.r } : null,
      usable,
    };
  }, [grid, editing, editShape, naming, acting, menu, selection, held, grow, sweep]);

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

    const {
      cells, plates, occupied, texts, spots, byCell, links, carried, proposal, subject, about, selected, selectedScope, growing, usable,
    } = model.current;

    // The gridlines of the selected scope the pointer is on, lit as what a drag would move;
    // during a drag, where they have got to. The pointer's own position, so the grip can
    // be drawn under it.
    const held_ = model.current.growLines ?? lineHot.current;
    const owner = model.current.resizable;
    const box = host.getBoundingClientRect();
    const cursor = pointer.current ? { x: pointer.current.x - box.left, y: pointer.current.y - box.top } : null;
    const lines: Scene["lines"] =
      owner && held_
        ? { region: owner.region, hue: selected?.hue ?? null, c: held_.c, r: held_.r, cursor }
        : null;

    // A scope's handle shows while the pointer is inside it or on the handle itself, and
    // goes once the scope is selected: the brackets say it then. The name shows on the
    // handle while the pointer is on it.
    const handles: Scene["handles"] = plates
      .filter(
        (p) =>
          p.id !== selectedScope &&
          (p.id === hot.current ||
            (hover.current !== null &&
              hover.current[0] >= p.c0 && hover.current[0] <= p.c1 &&
              hover.current[1] >= p.r0 && hover.current[1] <= p.r1)),
      )
      .map((p) => ({ ci: p.c0, ri: p.r0, hue: p.hue, name: p.id === hot.current ? p.name : null }));
    const hotPlate = hot.current ? plates.find((p) => p.id === hot.current) : undefined;
    const pointing: Scene["pointing"] = hotPlate
      ? { ci: hotPlate.c0, ri: hotPlate.r0, span: hotPlate.c1 - hotPlate.c0 + 1, rows: hotPlate.r1 - hotPlate.r0 + 1, hue: hotPlate.hue }
      : null;

    // With something selected, shift previews the rectangle a shift-click would select.
    const sweptRegion = model.current.sweep;
    const extending: Scene["extending"] = sweptRegion
      ? { ...sweptRegion, hue: selected?.hue ?? scopeAt(gridRef.current, sweptRegion.ci, sweptRegion.ri)?.hue ?? null, invalid: !usable(sweptRegion) }
      : shift.current && selected && hover.current && !proposal && !contains(selected, ...hover.current)
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
        handles,
        pointing,
        lines,
        growing,
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

  /** The gridlines of the selected scope under a screen point: a column line, a row line,
   *  or both at a corner. Edges count; the boundary is a line like any other. */
  const linesUnder = (px: number, py: number): { c: number | null; r: number | null } | null => {
    const owner = model.current.resizable;
    if (!owner) return null;
    const { region: o, edgesOnly } = owner;
    const { x, y, k } = camera.current;
    const x0 = worldX(o.ci) * k + x;
    const x1 = worldX(o.ci + o.span) * k + x;
    const y0 = worldX(o.ri) * k + y;
    const y1 = worldX(o.ri + o.rows) * k + y;
    if (px < x0 - LINE_HIT || px > x1 + LINE_HIT || py < y0 - LINE_HIT || py > y1 + LINE_HIT) return null;
    let c: number | null = null;
    let r: number | null = null;
    let dc = Infinity;
    let dr = Infinity;
    // A run offers its edges only; a scope every line. An edge is easy to catch; an
    // interior line takes more precision, or moving about inside a scope would light
    // lines everywhere and the cell under the pointer would never get its say.
    const step = (len: number) => (edgesOnly ? len : 1);
    const reachC = (ci: number) => (ci === o.ci || ci === o.ci + o.span ? LINE_HIT : INNER_HIT);
    const reachR = (ri: number) => (ri === o.ri || ri === o.ri + o.rows ? LINE_HIT : INNER_HIT);
    for (let ci = o.ci; ci <= o.ci + o.span; ci += step(o.span)) {
      const d = Math.abs(px - (worldX(ci) * k + x));
      if (d <= reachC(ci) && d < dc) [c, dc] = [ci, d];
    }
    for (let ri = o.ri; ri <= o.ri + o.rows; ri += step(o.rows)) {
      const d = Math.abs(py - (worldX(ri) * k + y));
      if (d <= reachR(ri) && d < dr) [r, dr] = [ri, d];
    }
    if (c === null && r === null) return null;
    // Two lines at once at a corner, which is what a corner is for, and at an interior
    // crossing only when the pointer is close to the crossing point itself — otherwise the
    // nearer line alone, or a horizontal drag would drift a row along with it.
    const corner = (c === o.ci || c === o.ci + o.span) && (r === o.ri || r === o.ri + o.rows);
    if (c !== null && r !== null && !corner && (dc > CROSS_HIT || dr > CROSS_HIT)) {
      if (dc <= dr) r = null;
      else c = null;
    }
    return { c, r };
  };

  /** The scope whose corner handle is under a screen point, if any. */
  const handleUnder = (px: number, py: number): string | null => {
    const { x, y, k } = camera.current;
    const half = HANDLE_HIT / 2;
    for (const plate of model.current.plates) {
      if (plate.id === model.current.selectedScope) continue;
      const hx = worldX(plate.c0) * k + x;
      const hy = worldX(plate.r0) * k + y;
      if (Math.abs(px - hx) <= half && Math.abs(py - hy) <= half) return plate.id;
    }
    return null;
  };

  // While a menu, a rename or an edit is open the camera is still: the press that closes
  // it is spent closing it, and the wheel would slide the cell out from under the menu.
  // And a press the grid holds is not a pan.
  const overlay = menu !== null || acting !== null || editing !== null || naming !== null || opened !== null;
  const { camera, shift: shiftView } = useCamera(viewport, schedule, () => overlay || pressed.current?.held === true);

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
      // An opened tile owns Escape while it is up, the way an overlay owns the pointer.
      if (e.key === "Escape" && !claimed(e.target) && !document.querySelector(".opened")) {
        if (dragging.current || stretching.current || sweeping.current) {
          // Cancel the move, the resize or the sweep: drop it and spend the release on nothing.
          dragging.current = null;
          stretching.current = null;
          sweeping.current = null;
          pressed.current = null;
          setHeld(null);
          setGrow(null);
          setSweep(null);
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
    if (stretching.current) {
      const s = stretching.current;
      const box = host.getBoundingClientRect();
      const { x, y, k } = camera.current;
      const wx = (event.clientX - box.left - x) / k;
      const wy = (event.clientY - box.top - y) / k;
      const nc = s.c === null ? 0 : Math.round((wx - s.wx) / CELL);
      const nr = s.r === null ? 0 : Math.round((wy - s.wy) / CELL);
      // A corner is two resizes, the second proposed on the grid the first would leave.
      const g0 = gridRef.current;
      const col = s.c === null ? null : proposeResize(g0, s.owner, "col", s.c, nc);
      // The intermediate grid may have gained tracks at the front, shifting every index;
      // the row resize is asked in its terms and answered back in the model's.
      const mid = col ? applied(g0, col.moves) : { grid: g0, dc: 0, dr: 0 };
      const back = (r: Region): Region => ({ ...r, ci: r.ci - mid.dc, ri: r.ri - mid.dr });
      const rowRaw = s.r === null ? null : proposeResize(mid.grid, s.owner, "row", s.r + mid.dr, nr);
      const row = rowRaw
        ? {
            ...rowRaw,
            after: back(rowRaw.after),
            band: rowRaw.band ? back(rowRaw.band) : null,
            moves: rowRaw.moves.map((m) => ({ ...m, ci: m.ci - mid.dc, ri: m.ri - mid.dr })),
          }
        : null;
      const moves = [...(col?.moves ?? []), ...(row?.moves ?? [])];
      const ok = (col?.ok ?? true) && (row?.ok ?? true);
      const after = row?.after ?? col?.after ?? null;
      // A column band spans the rows the scope will have, so a corner's new cells are
      // all shown, including the block where the two bands meet.
      const bands: Region[] = [];
      if (col?.band && after) bands.push({ ...col.band, ri: after.ri, rows: after.rows });
      if (row?.band) bands.push(row.band);
      hover.current = null;
      if (after) setGrow({ after, ok, moves, bands, c: s.c === null ? null : s.c + nc, r: s.r === null ? null : s.r + nr });
      schedule(camera.current);
      return;
    }
    if (sweeping.current) {
      const at = cellUnder(event);
      if (at) {
        hover.current = null;
        setSweep(close(gridRef.current, reach(sweeping.current, at)));
        schedule(camera.current);
      }
      return;
    }
    if (dragging.current) {
      const at = cellUnder(event);
      if (at) {
        const carry = dragging.current;
        const to: Region = { ...carry.from, ci: at[0] - carry.grab[0], ri: at[1] - carry.grab[1] };
        // From the model, never from the scene: the scene is built from this answer.
        const verdict = proposeMove(gridRef.current, carry.from, to);
        carry.proposal = { to, ok: verdict.ok, moves: verdict.moves };
        hover.current = null;
        setHeld({ id: carry.id, from: carry.from, to, ...verdict });
      }
      return;
    }
    const box = host.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    const onHandle = handleUnder(px, py);
    const onLines = linesUnder(px, py);
    const next = cellAt(camera.current, px, py);
    const prev = hover.current;
    const moved = !(prev && prev[0] === next[0] && prev[1] === next[1]);
    const sameLines =
      onLines === lineHot.current ||
      (onLines !== null && lineHot.current !== null && onLines.c === lineHot.current.c && onLines.r === lineHot.current.r);
    if (!moved && onHandle === hot.current && sameLines && !onLines) return;
    hover.current = next;
    hot.current = onHandle;
    lineHot.current = onLines;
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
    const press = { x: event.clientX, y: event.clientY, held: false };
    pressed.current = press;
    dismissing.current = menu !== null || acting !== null || editing !== null || naming !== null;
    if (dismissing.current) return;
    const at = cellUnder(event);
    if (!at) return;
    const hold = () => {
      press.held = true;
      (event.target as Element).setPointerCapture?.(event.pointerId);
    };
    const owner = model.current.resizable;
    if (lineHot.current && owner && !event.shiftKey) {
      // Taking hold of a gridline of the selected scope or run. The line's world position
      // is where the drag is measured from.
      const { c, r } = lineHot.current;
      stretching.current = { owner: owner.id, c, r, wx: c === null ? 0 : worldX(c), wy: r === null ? 0 : worldX(r) };
      hold();
      return;
    }
    const selected = model.current.selected;
    const inside = selected !== null && contains(selected, at[0], at[1]);
    if (event.shiftKey) {
      // Shift and drag sweeps a rectangle: from the cell if nothing is selected, and from
      // the selection if something is, which is extending it. A shift-click is decided
      // on the release, as before.
      sweeping.current = selected && !selected.invalid ? selected : { ci: at[0], ri: at[1], span: 1, rows: 1 };
      hold();
      return;
    }
    if (inside && selected.invalid) {
      // A press on an invalid selection is the grid's, and it goes nowhere: the selection
      // is already drawn in the colour that says so. A drag does nothing; a click is a
      // click on the cell.
      press.held = true;
      return;
    }
    // Only a press inside the selection carries anything. Anywhere else a plain drag
    // pans, tile or not, so there is always somewhere to pan from.
    if (!inside) return;
    const from = selected;
    const id = selection && "tile" in selection ? selection.tile : null;
    dragging.current = { id, from, grab: [at[0] - from.ci, at[1] - from.ri], proposal: null };
    hold();
  };

  const onUp = (event: React.PointerEvent) => {
    if (claimed(event.target)) return;
    const start = pressed.current;
    pressed.current = null;
    const moved = !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3;
    if (sweeping.current) {
      const anchor = sweeping.current;
      sweeping.current = null;
      setSweep(null);
      if (moved) {
        const at = cellUnder(event);
        if (at) setSelection(selectionOf(gridRef.current, close(gridRef.current, reach(anchor, at))));
        return;
      }
    }
    if (stretching.current) {
      stretching.current = null;
      const g = grow;
      setGrow(null);
      if (g?.ok && g.moves.length > 0) {
        const { dc, dr } = applyMoves(g.moves);
        if (dc || dr) {
          shiftView(-dc * CELL, -dr * CELL);
          hover.current = null;
        }
      }
      return;
    }
    if (dragging.current) {
      const carry = dragging.current;
      dragging.current = null;
      setHeld(null);
      // A press inside the selection that never travelled is a click on it, not a move.
      // What lands is what was previewed: the verdict is the one the drag already holds.
      if (moved && carry.proposal) {
        const { to, ok, moves } = carry.proposal;
        if (ok) {
          const { dc, dr } = applyMoves(moves);
          // Tracks prepended on the way shift every index; the view shifts to match.
          if (dc || dr) {
            shiftView(-dc * CELL, -dr * CELL);
            hover.current = null;
          }
          // A selected tile follows itself; a selected region has to be told where it went.
          if (carry.id === null && !(selection && "scope" in selection)) {
            setSelection(selectionOf(gridRef.current, { ...to, ci: to.ci + dc, ri: to.ri + dr }));
          }
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
        setSelection(selectionOf(gridRef.current, close(gridRef.current, reach(anchor, [ci, ri]))));
        return;
      }
      if (id) {
        // Shift-click on an occupant opens it, scaling up from where it sits.
        const tile = gridRef.current.tiles.find((x) => x.id === id);
        const extent = model.current.tiles.get(id);
        if (!tile || tile.kind === "text" || !extent) return;
        const { x, y, k } = camera.current;
        const size = CELL * k;
        hover.current = null;
        setOpened({
          id,
          from: { x: worldX(extent.ci) * k + x, y: worldX(extent.ri) * k + y, w: size * extent.span, h: size * extent.rows },
          to: { x: OPEN_INSET, y: OPEN_INSET, w: host.clientWidth - OPEN_INSET * 2, h: host.clientHeight - OPEN_INSET * 2 },
        });
        return;
      }
      hover.current = null;
      setMenu({ x: event.clientX, y: event.clientY, ci, ri });
      return;
    }
    // Click selects, and clicking what is already selected clears it. A scope's corner
    // handle selects the scope; anywhere else inside it selects the cell.
    const scope = handleUnder(event.clientX - box.left, event.clientY - box.top);
    if (scope) {
      setSelection({ scope });
      return;
    }
    const current = model.current.selected;
    if (current && contains(current, ci, ri)) {
      setSelection(null);
      return;
    }
    setSelection(id ? { tile: id } : selectionOf(gridRef.current, { ci, ri, span: 1, rows: 1 }));
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
          : grow
            ? "moving"
            : scene.selected
              ? scene.selected.invalid
                ? "invalid"
                : scene.resizable
                  ? "scope"
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
      {opened && (
        <Opened
          kind={(gridRef.current.tiles.find((x) => x.id === opened.id)?.kind ?? "shell") as OccupantKind}
          name={gridRef.current.tiles.find((x) => x.id === opened.id)?.name}
          from={opened.from}
          to={opened.to}
          onLeave={() => setOpened((o) => (o ? { ...o, leaving: true } : o))}
          onClose={() => setOpened(null)}
        />
      )}
      <Keys mode={mode} hidden={opened !== null && !opened.leaving} />
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
