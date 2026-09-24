/**
 * The grid is two ordered lists of tracks, each track with a stable id. A cell is the pair
 * (columnId, rowId) — never a pair of indices.
 *
 * The whole model exists for one property: inserting a track is a splice into an ordered
 * list and touches nothing else. No stored position is rewritten, no tile is visited, no
 * id changes. Every operation below is written so that property is visible rather than
 * argued for — `insertColumnsAt` is literally a splice, and the tiles array it returns is
 * the same array it was given.
 *
 * Indices exist only where the ordering itself is the subject (where to splice, which lane
 * a drag landed on). They are never stored.
 */

import { cells, contains, covers, overlaps, type Region } from "./region.ts";

export interface Track {
  readonly id: string;
}

/**
 * Two families, and they are not variants of each other.
 *
 * An *occupant* is something running: it fills a cell, and one cell is all it ever wants.
 * *Text* is content written on the canvas: it has no process, and its size is decided by
 * what it says rather than by the grid. A title grows sideways as it gets longer; a note
 * is a block you size and the words wrap inside it. Those are different geometries, which
 * is the real reason text cannot just be another kind of occupant.
 */
export type OccupantKind = "claude" | "codex" | "shell" | "browser";
export type TextStyle = "title" | "note";
export type TileKind = OccupantKind | "text";

export interface Tile {
  readonly id: string;
  readonly kind: TileKind;
  readonly columnId: string;
  readonly rowId: string;
  /** What this one is called. Occupants only; a run is named by what it says. */
  readonly name?: string;
  /** Text only. */
  readonly style?: TextStyle;
  readonly text?: string;
  /** Cells occupied, starting at (columnId, rowId). A title is always one row tall. */
  readonly span?: number;
  readonly rows?: number;
  /**
   * Text only: a size the writer fixed by dragging an edge. A capped width is a box the
   * words wrap inside; a capped height clips them. Uncapped, the run is as big as what it
   * says needs, bounded by what is free.
   */
  readonly cap?: { readonly span?: number; readonly rows?: number };
}

/**
 * A scope is a named region that tiles belong to — a worktree. Rectangular in the model,
 * which is what keeps room always makeable. Stored as two track ranges, not a cell list,
 * so inserting a track inside it costs nothing.
 */
export interface Scope {
  readonly id: string;
  /** What the worktree is called. A fact about it, not a run on the grid. */
  readonly name: string;
  /** Index into the palette. Hue says which group and nothing else does. */
  readonly hue: number;
  readonly columnStart: string;
  readonly columnEnd: string;
  readonly rowStart: string;
  readonly rowEnd: string;
}

/**
 * Who is talking to whom. A fact about the agents, not about the canvas: the runtime
 * records it, the grid only renders it. Stored as tile ids here because this is a mock;
 * really it would be agent ids, and a tile would reference an agent.
 */
export interface Link {
  readonly from: string;
  readonly to: string;
}

export interface Grid {
  readonly columns: readonly Track[];
  readonly rows: readonly Track[];
  readonly tiles: readonly Tile[];
  readonly scopes: readonly Scope[];
  readonly links: readonly Link[];
}

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

/* Queries ----------------------------------------------------------------- */

export function indexOfTrack(tracks: readonly Track[], id: string): number {
  return tracks.findIndex((t) => t.id === id);
}

export function tileAt(grid: Grid, columnId: string, rowId: string): Tile | undefined {
  return grid.tiles.find((t) => t.columnId === columnId && t.rowId === rowId);
}

/* Insertion --------------------------------------------------------------- */

/**
 * The central operation. `ids` are supplied rather than generated because an insertion is
 * previewed before it is committed, and the preview's tracks must keep their identity when
 * the commit lands — otherwise the ghost columns are replaced by different columns and the
 * grid flickers at exactly the moment it should be still.
 */
export function insertColumnsAt(grid: Grid, at: number, ids: readonly string[]): Grid {
  if (ids.length === 0) return grid;
  const columns = grid.columns.slice();
  columns.splice(at, 0, ...ids.map((id) => ({ id })));
  return { ...grid, columns };
}

export function insertRowsAt(grid: Grid, at: number, ids: readonly string[]): Grid {
  if (ids.length === 0) return grid;
  const rows = grid.rows.slice();
  rows.splice(at, 0, ...ids.map((id) => ({ id })));
  return { ...grid, rows };
}

export function insertColumnAfter(grid: Grid, columnId: string, id = nextId("c")): Grid {
  const i = indexOfTrack(grid.columns, columnId);
  return i < 0 ? grid : insertColumnsAt(grid, i + 1, [id]);
}

export function insertRowAfter(grid: Grid, rowId: string, id = nextId("r")): Grid {
  const i = indexOfTrack(grid.rows, rowId);
  return i < 0 ? grid : insertRowsAt(grid, i + 1, [id]);
}

/* Tiles ------------------------------------------------------------------- */

export function addTile(
  grid: Grid,
  columnId: string,
  rowId: string,
  kind: TileKind,
  id = nextId("t"),
  style?: TextStyle,
): Grid {
  if (tileAt(grid, columnId, rowId)) return grid;
  const tile: Tile =
    kind === "text"
      ? { id, kind, columnId, rowId, style: style ?? "title", text: "", span: 1, rows: 1 }
      : { id, kind, columnId, rowId };
  return { ...grid, tiles: [...grid.tiles, tile] };
}

export function removeTile(grid: Grid, tileId: string): Grid {
  return { ...grid, tiles: grid.tiles.filter((t) => t.id !== tileId) };
}

/** The region a scope covers. Indices, because membership is an ordering question. */
export function bounds(grid: Grid, scope: Scope): Region {
  const c0 = indexOfTrack(grid.columns, scope.columnStart);
  const r0 = indexOfTrack(grid.rows, scope.rowStart);
  return {
    ci: c0,
    ri: r0,
    span: indexOfTrack(grid.columns, scope.columnEnd) - c0 + 1,
    rows: indexOfTrack(grid.rows, scope.rowEnd) - r0 + 1,
  };
}

/**
 * Which scope owns a cell. Null for open grid. Scopes are compared by identity: within
 * one grid each is one object, so "same scope" is `===`.
 */
export function scopeAt(grid: Grid, ci: number, ri: number): Scope | null {
  for (const scope of grid.scopes) {
    if (contains(bounds(grid, scope), ci, ri)) return scope;
  }
  return null;
}

/**
 * Whether a region is one the grid can use — select, move, exchange. Nothing it touches may
 * be partly inside it: a tile it touches lies entirely within it, and a scope it touches
 * lies entirely within it or entirely around it. Never neither. That is the one rule for
 * selection and for both halves of a move, and it is what "you cannot cut a worktree"
 * means.
 */
export function wellFormed(grid: Grid, r: Region): boolean {
  return (
    grid.tiles.every((tile) => {
      const f = footprint(grid, tile);
      return !overlaps(f, r) || covers(r, f);
    }) &&
    grid.scopes.every((scope) => {
      const b = bounds(grid, scope);
      return !overlaps(b, r) || covers(r, b) || covers(b, r);
    })
  );
}

/**
 * The world with some things lifted out of it. A proposal reasons about this, not about
 * the world as it is: what is being carried is nowhere until it lands, and asking the
 * ordinary questions of the lifted world is what stops a thing from straddling its own
 * destination.
 */
export function without(grid: Grid, ids: ReadonlySet<string>): Grid {
  return {
    ...grid,
    tiles: grid.tiles.filter((tile) => !ids.has(tile.id)),
    scopes: grid.scopes.filter((scope) => !ids.has(scope.id)),
  };
}

/**
 * Whether a cell is available to a run that started in `home`.
 *
 * This is the primitive, and there is only one: a **boundary** is anything a run cannot
 * cross, and a cell holding something else and a cell in a different scope are the same
 * kind of thing. Writing them as two checks makes it possible for one axis to learn about
 * a boundary the other does not, which is how a note ended up with no vertical rule at all.
 */
export function available(
  grid: Grid,
  tileId: string,
  home: Scope | null,
  ci: number,
  ri: number,
): boolean {
  if (scopeAt(grid, ci, ri) !== home) return false;
  return !grid.tiles.some((other) => other.id !== tileId && contains(footprint(grid, other), ci, ri));
}

/** How many columns a run may occupy, starting at its own cell, of the `want` it needs. */
export function columnsFor(grid: Grid, tileId: string, ci: number, ri: number, want: number): number {
  const home = scopeAt(grid, ci, ri);
  let n = 1;
  while (n < want && available(grid, tileId, home, ci + n, ri)) n += 1;
  return n;
}

/**
 * How many rows a run of this width may occupy. A row is available only if every cell
 * across the run's width is — one blocked cell anywhere along it stops the whole row,
 * because a line of text cannot be written around an obstacle.
 */
export function rowsFor(
  grid: Grid,
  tileId: string,
  ci: number,
  ri: number,
  span: number,
  want: number,
): number {
  const home = scopeAt(grid, ci, ri);
  const row = (n: number): Region => ({ ci, ri: ri + n, span, rows: 1 });
  let n = 1;
  while (n < want && [...cells(row(n))].every(([c, r]) => available(grid, tileId, home, c, r))) n += 1;
  return n;
}

/**
 * Tracks for every cell of a region, made on demand. The lattice is infinite and the
 * model's tracks are not, so anything placed or moved past the last one gets tracks
 * appended, and anything placed before the first gets them prepended — which shifts every
 * index by the count returned, though no stored position changes, since positions are
 * ids. The camera moves by the same amount so nothing on screen does.
 */
export function ensureTracks(grid: Grid, r: Region): { grid: Grid; dc: number; dr: number } {
  const dc = Math.max(0, -r.ci);
  const dr = Math.max(0, -r.ri);
  const fresh = (prefix: string, n: number) => Array.from({ length: n }, () => nextId(prefix));
  let g = grid;
  if (dc > 0) g = insertColumnsAt(g, 0, fresh("c", dc));
  if (dr > 0) g = insertRowsAt(g, 0, fresh("r", dr));
  const moreC = r.ci + dc + r.span - g.columns.length;
  const moreR = r.ri + dr + r.rows - g.rows.length;
  if (moreC > 0) g = insertColumnsAt(g, g.columns.length, fresh("c", moreC));
  if (moreR > 0) g = insertRowsAt(g, g.rows.length, fresh("r", moreR));
  return { grid: g, dc, dr };
}

/**
 * The smallest well-formed region containing `r`: grow to the bounding box of everything
 * it partly touches — tiles, and scopes it is not inside — and again, until nothing new
 * is touched. A selection is offered closed, so it is invalid only when closing it ran
 * into something on the way.
 */
export function close(grid: Grid, r: Region): Region {
  for (;;) {
    let c0 = r.ci;
    let r0 = r.ri;
    let c1 = r.ci + r.span;
    let r1 = r.ri + r.rows;
    const take = (f: Region) => {
      c0 = Math.min(c0, f.ci);
      r0 = Math.min(r0, f.ri);
      c1 = Math.max(c1, f.ci + f.span);
      r1 = Math.max(r1, f.ri + f.rows);
    };
    for (const tile of grid.tiles) {
      const f = footprint(grid, tile);
      if (overlaps(f, r)) take(f);
    }
    for (const scope of grid.scopes) {
      const b = bounds(grid, scope);
      if (overlaps(b, r) && !covers(b, r)) take(b);
    }
    const grown: Region = { ci: c0, ri: r0, span: c1 - c0, rows: r1 - r0 };
    if (grown.span === r.span && grown.rows === r.rows) return grown;
    r = grown;
  }
}

/* Moving ------------------------------------------------------------------ */

export function footprint(grid: Grid, tile: Tile): Region {
  return {
    ci: indexOfTrack(grid.columns, tile.columnId),
    ri: indexOfTrack(grid.rows, tile.rowId),
    span: tile.span ?? 1,
    rows: tile.rows ?? 1,
  };
}

/**
 * Whether a tile may be put down at a cell, and everything that would move if it were.
 *
 * A move is a proposal to exchange one region of the grid with another of the same size:
 * the region the tile occupies now, and the region it would occupy. It is legal when
 * **every tile touching either region is entirely inside it** — nothing may have cells both
 * in and out of a region, because such a tile cannot be exchanged without tearing.
 *
 * That single rule replaces a pile of special cases. Swapping two tiles of the same size
 * is the case where each region holds exactly one; moving into free space is the case
 * where the destination holds none; and dropping a two-cell run half over another
 * two-cell run is refused, because that run straddles the region's edge.
 *
 * Answered from the model alone — the positions tiles actually have, never a view of the
 * world that already assumes the move. Deriving it from the rendered scene makes it
 * circular, because the scene is built from the answer, and a circular answer flickers
 * between values and drags unrelated tiles along with it.
 */
/** Where a thing — a tile or a scope, by id — would go, and for a scope, how big it is. */
export interface Move {
  id: string;
  ci: number;
  ri: number;
  span?: number;
  rows?: number;
}

/** A grid with moves applied. Positions are ids, so a move is a track lookup. */
export function applied(grid: Grid, moves: readonly Move[]): Grid {
  const at = new Map(moves.map((m) => [m.id, m]));
  const track = (tracks: readonly Track[], i: number) => tracks[i]?.id;
  return {
    ...grid,
    tiles: grid.tiles.map((tile) => {
      const m = at.get(tile.id);
      const columnId = m && track(grid.columns, m.ci);
      const rowId = m && track(grid.rows, m.ri);
      if (!m || !columnId || !rowId) return tile;
      const moved = { ...tile, columnId, rowId };
      // A size on a run's move is the writer fixing that axis: a cap, kept until lifted.
      if (tile.kind !== "text" || (m.span === undefined && m.rows === undefined)) return moved;
      return {
        ...moved,
        span: m.span ?? tile.span,
        rows: m.rows ?? tile.rows,
        cap: { span: m.span ?? tile.cap?.span, rows: m.rows ?? tile.cap?.rows },
      };
    }),
    scopes: grid.scopes.map((scope) => {
      const m = at.get(scope.id);
      if (!m) return scope;
      const b = bounds(grid, scope);
      const columnStart = track(grid.columns, m.ci);
      const columnEnd = track(grid.columns, m.ci + (m.span ?? b.span) - 1);
      const rowStart = track(grid.rows, m.ri);
      const rowEnd = track(grid.rows, m.ri + (m.rows ?? b.rows) - 1);
      return columnStart && columnEnd && rowStart && rowEnd
        ? { ...scope, columnStart, columnEnd, rowStart, rowEnd }
        : scope;
    }),
  };
}

/**
 * What moves as one when pushed: a scope with everything in it, or a tile in no scope.
 * Nothing is ever pushed out of its worktree; the worktree goes instead.
 */
function units(grid: Grid): readonly { id: string; region: Region; members: readonly string[] }[] {
  const inScope = new Set<string>();
  const scopes = grid.scopes.map((scope) => {
    const region = bounds(grid, scope);
    const members = grid.tiles.filter((tile) => covers(region, footprint(grid, tile))).map((tile) => tile.id);
    for (const id of members) inScope.add(id);
    return { id: scope.id, region, members };
  });
  const loose = grid.tiles
    .filter((tile) => !inScope.has(tile.id))
    .map((tile) => ({ id: tile.id, region: footprint(grid, tile), members: [] }));
  return [...scopes, ...loose];
}

/**
 * Push, the way things push: nothing moves until something is right up against it, and
 * then it moves exactly as far as it is overlapped, and passes only that on. Along one
 * axis, in one direction, so it cannot cycle. `orig` is where the pusher was and `after`
 * where it is now; what lay ahead of it and overlaps it across the other axis is pushed
 * by however far `after` reaches into it. Returns the moves, scopes and their tiles alike.
 */
export function push(
  grid: Grid,
  orig: Region,
  after: Region,
  axis: Axis,
  sign: 1 | -1,
  except: ReadonlySet<string>,
): Move[] {
  const P = axis === "col" ? "ci" : "ri";
  const S = axis === "col" ? "span" : "rows";
  const Q = axis === "col" ? "ri" : "ci";
  const T = axis === "col" ? "rows" : "span";
  const across = (a: Region, b: Region) => a[Q] < b[Q] + b[T] && b[Q] < a[Q] + a[T];
  const all = units(grid).filter((u) => !except.has(u.id));
  const moved = new Map<string, number>();
  const queue: { orig: Region; after: Region }[] = [{ orig, after }];
  while (queue.length > 0) {
    const { orig: o, after: a } = queue.pop() as { orig: Region; after: Region };
    const lead = sign > 0 ? a[P] + a[S] : a[P];
    for (const u of all) {
      if (!across(o, u.region)) continue;
      const lo = u.region[P];
      const hi = lo + u.region[S];
      // Ahead of the pusher, judged where the pusher started, so nothing behind it moves.
      if (sign > 0 ? lo < o[P] + o[S] : hi > o[P]) continue;
      const need = sign > 0 ? lead - lo : hi - lead;
      if (need <= (moved.get(u.id) ?? 0)) continue;
      moved.set(u.id, need);
      queue.push({ orig: u.region, after: { ...u.region, [P]: lo + sign * need } });
    }
  }
  const moves: Move[] = [];
  for (const u of all) {
    const need = moved.get(u.id);
    if (!need) continue;
    const dc = axis === "col" ? sign * need : 0;
    const dr = axis === "row" ? sign * need : 0;
    moves.push({ id: u.id, ci: u.region.ci + dc, ri: u.region.ri + dr });
    for (const id of u.members) {
      const tile = grid.tiles.find((x) => x.id === id);
      if (!tile) continue;
      const f = footprint(grid, tile);
      moves.push({ id, ci: f.ci + dc, ri: f.ri + dr });
    }
  }
  return moves;
}

export type Axis = "col" | "row";

/**
 * Move one gridline of a scope by `n` cells, on one axis. An interior line only inserts:
 * `|n|` empty tracks appear at the line and the part of the scope on the far side shifts,
 * the scope growing at that edge and pushing the world beyond it. An edge inserts outward
 * the same way, and dragged inward removes that many tracks, which must hold nothing. A
 * corner is this twice, once per axis, the second on the grid the first would leave.
 */
export interface Resize {
  ok: boolean;
  after: Region;
  band: Region | null;
  moves: readonly Move[];
}

/**
 * Move one edge of a run by `n` cells. A run has no interior lines to insert at, only
 * edges. Outward grows it, pushing whatever is beyond, and refuses if that would take it
 * out of its scope or into one; inward shrinks it and the words reflow. Either way the
 * axis dragged becomes a cap.
 */
function resizeRun(grid: Grid, tile: Tile, axis: Axis, line: number, n: number): Resize {
  const b = footprint(grid, tile);
  const P = axis === "col" ? "ci" : "ri";
  const S = axis === "col" ? "span" : "rows";
  const start = b[P];
  const end = start + b[S];
  const k = Math.abs(n);
  const refuse: Resize = { ok: false, after: b, band: null, moves: [] };
  if (n === 0) return { ok: true, after: b, band: null, moves: [] };
  if (line !== start && line !== end) return refuse;
  const outward = (line === start && n < 0) || (line === end && n > 0);
  if (!outward) {
    if (k >= b[S]) return { ...refuse, band: { ...b, [P]: line === start ? start : end - k, [S]: k } };
    const after: Region = { ...b, [P]: line === start ? start + k : start, [S]: b[S] - k };
    const band: Region = { ...b, [P]: line === start ? start : end - k, [S]: k };
    return { ok: true, after, band, moves: [{ id: tile.id, ci: after.ci, ri: after.ri, [S]: after[S] }] };
  }
  const after: Region = { ...b, [P]: line === start ? start - k : start, [S]: b[S] + k };
  const band: Region = { ...b, [P]: line === start ? start - k : end, [S]: k };
  const moves: Move[] = [
    { id: tile.id, ci: after.ci, ri: after.ri, [S]: after[S] },
    ...push(grid, b, after, axis, n > 0 ? 1 : -1, new Set([tile.id])),
  ];
  // Text stays in its scope, or out of every scope, once everything has been pushed.
  const world = applied(grid, moves);
  const home = scopeAt(grid, b.ci, b.ri)?.id ?? null;
  for (const [ci, ri] of cells(after)) {
    if ((scopeAt(world, ci, ri)?.id ?? null) !== home) return { ...refuse, band };
  }
  return { ok: true, after, band, moves };
}

export function proposeResize(grid: Grid, ownerId: string, axis: Axis, line: number, n: number): Resize {
  const run = grid.tiles.find((x) => x.id === ownerId && x.kind === "text");
  if (run) return resizeRun(grid, run, axis, line, n);
  const scope = grid.scopes.find((s) => s.id === ownerId);
  if (!scope) return { ok: false, after: { ci: 0, ri: 0, span: 1, rows: 1 }, band: null, moves: [] };
  const b = bounds(grid, scope);
  const P = axis === "col" ? "ci" : "ri";
  const S = axis === "col" ? "span" : "rows";
  const start = b[P];
  const end = start + b[S];
  const k = Math.abs(n);
  const inside = grid.tiles.filter((tile) => covers(b, footprint(grid, tile)));
  const own = new Set([scope.id, ...inside.map((tile) => tile.id)]);
  if (n === 0) return { ok: true, after: b, band: null, moves: [] };

  // An edge dragged inward removes the tracks it sweeps over. Whatever is in them is
  // pushed inward, the same push as everywhere else with the edge as the pusher, among
  // the scope's own tiles only. It is refused when something would have to leave the
  // scope's far side to make way.
  const inward = (line === start && n > 0) || (line === end && n < 0);
  if (inward) {
    const band: Region = { ...b, [P]: line === start ? start : end - k, [S]: k };
    const refuse = { ok: false, after: b, band, moves: [] as const };
    if (k >= b[S]) return refuse;
    const after: Region = { ...b, [P]: line === start ? start + k : start, [S]: b[S] - k };
    const within: Grid = { ...grid, tiles: inside, scopes: [] };
    const wall: Region = { ...b, [P]: line === start ? start - 1 : end, [S]: 1 };
    const moved = push(within, wall, band, axis, line === start ? 1 : -1, new Set());
    const fits = moved.every((m) => {
      const tile = inside.find((x) => x.id === m.id);
      return tile !== undefined && covers(after, { ...footprint(grid, tile), ci: m.ci, ri: m.ri });
    });
    if (!fits) return refuse;
    return {
      ok: true,
      after,
      band,
      moves: [{ id: scope.id, ci: after.ci, ri: after.ri, span: after.span, rows: after.rows }, ...moved],
    };
  }

  // Otherwise insert at the line: the far side shifts, the scope grows, the world beyond
  // its new edge is pushed.
  const dc = axis === "col" ? n : 0;
  const dr = axis === "row" ? n : 0;
  const far = (r: Region) => (n > 0 ? r[P] >= line : r[P] + r[S] <= line);
  const shifted: Move[] = inside
    .filter((tile) => far(footprint(grid, tile)))
    .map((tile) => {
      const f = footprint(grid, tile);
      return { id: tile.id, ci: f.ci + dc, ri: f.ri + dr };
    });
  const after: Region = { ...b, [P]: n > 0 ? start : start - k, [S]: b[S] + k };
  // The new cells, where they will be once the far side has shifted: at the line.
  const band: Region = { ...b, [P]: n > 0 ? line : line - k, [S]: k };
  return {
    ok: true,
    after,
    band,
    moves: [
      { id: scope.id, ci: after.ci, ri: after.ri, span: after.span, rows: after.rows },
      ...shifted,
      ...push(grid, b, after, axis, n > 0 ? 1 : -1, own),
    ],
  };
}

/** Everything that owns a region, so a move can carry tiles and scopes alike. */
function owners(grid: Grid): readonly { id: string; region: Region; scope: boolean }[] {
  return [
    ...grid.tiles.map((tile) => ({ id: tile.id, region: footprint(grid, tile), scope: false })),
    ...grid.scopes.map((scope) => ({ id: scope.id, region: bounds(grid, scope), scope: true })),
  ];
}

/**
 * Whether one region of the grid may be exchanged with another, and everything that would
 * move if it were. Dragging a tile is the case where `from` is that tile's footprint; a
 * selection is any region, and may carry whole scopes. `swaps` says whether something at
 * the destination would come back, and is answered whatever the verdict, because a
 * refused exchange is still drawn as the exchange it refuses.
 */
export function proposeMove(
  grid: Grid,
  from: Region,
  to: Region,
): { ok: boolean; swaps: boolean; moves: readonly Move[] } {
  const here = owners(grid).filter((o) => covers(from, o.region));
  // Everything else, in a world with the carried things lifted out of it.
  const rest = without(grid, new Set(here.map((o) => o.id)));
  const others = owners(rest);
  // What is inside the destination and would come back — not what merely surrounds it,
  // which is a scope the destination lies in and which stays where it is.
  const there = others.filter((o) => covers(to, o.region));
  // A scope the destination lies inside is not something coming back; anything else
  // overlapping it is.
  const swaps = others.some((o) => overlaps(o.region, to) && !(o.scope && covers(o.region, to)));
  const refuse = { ok: false, swaps, moves: [] as const };

  if (to.ci === from.ci && to.ri === from.ri) return { ok: true, swaps, moves: [] };

  // Both regions must be well-formed: nothing partly inside either, because such a thing
  // cannot be exchanged without tearing, and no worktree is ever cut. The source is
  // judged in the world as it is; the destination in the world without the carried.
  if (!wellFormed(grid, from) || !wellFormed(rest, to)) return refuse;

  const shift = (o: { id: string; region: Region }, by: Region, into: Region): Move => ({
    id: o.id,
    ci: o.region.ci - by.ci + into.ci,
    ri: o.region.ri - by.ri + into.ri,
  });

  // A region that overlaps its own destination cannot be exchanged with itself, so the
  // move is only a slide, and only into space nothing else is in.
  if (overlaps(from, to)) {
    return swaps ? refuse : { ok: true, swaps, moves: here.map((o) => shift(o, from, to)) };
  }

  return {
    ok: true,
    swaps,
    moves: [...here.map((o) => shift(o, from, to)), ...there.map((o) => shift(o, to, from))],
  };
}

/* Seed -------------------------------------------------------------------- */

export function seed(): Grid {
  const columns = Array.from({ length: 18 }, () => ({ id: nextId("c") }));
  const rows = Array.from({ length: 11 }, () => ({ id: nextId("r") }));
  const col = (i: number) => columns[i]!.id;
  const row = (i: number) => rows[i]!.id;

  const scopes: Scope[] = [
    { id: nextId("g"), name: "auth", hue: 0, columnStart: col(2), columnEnd: col(4), rowStart: row(1), rowEnd: row(4) },
    { id: nextId("g"), name: "infra", hue: 1, columnStart: col(11), columnEnd: col(14), rowStart: row(1), rowEnd: row(3) },
    { id: nextId("g"), name: "research", hue: 2, columnStart: col(3), columnEnd: col(6), rowStart: row(6), rowEnd: row(9) },
    { id: nextId("g"), name: "planner", hue: 3, columnStart: col(12), columnEnd: col(14), rowStart: row(6), rowEnd: row(8) },
  ];

  const texts: [number, number, number, string][] = [
    [2, 1, 3, "auth"],
    [11, 1, 4, "infra"],
    [3, 6, 4, "research"],
    [12, 6, 3, "planner"],
  ];


  const cells: [number, number, TileKind][] = [
    [3, 2, "claude"], [3, 3, "codex"], [2, 3, "claude"],
    [12, 2, "codex"], [13, 2, "claude"],
    [4, 7, "claude"], [5, 7, "claude"], [5, 8, "codex"],
    [13, 7, "claude"],
    [8, 4, "shell"],
  ];
  const tiles: Tile[] = [
    ...texts.map(([c, r, span, text]) => ({
      id: nextId("t"),
      kind: "text" as const,
      style: "title" as const,
      columnId: col(c),
      rowId: row(r),
      text,
      span,
      rows: 1,
    })),
    ...cells.map(([c, r, kind]) => ({
      id: nextId("t"),
      kind,
      columnId: col(c),
      rowId: row(r),
    })),
  ];
  const agent = (n: number) => tiles.filter((x) => x.kind !== "text")[n]?.id ?? "";
  const links: Link[] = [
    { from: agent(0), to: agent(3) },
    { from: agent(0), to: agent(5) },
    { from: agent(3), to: agent(8) },
    { from: agent(5), to: agent(6) },
    { from: agent(1), to: agent(9) },
  ];
  return { columns, rows, tiles, scopes, links };
}
