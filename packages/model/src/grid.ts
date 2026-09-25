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
 * A *host* is a place holding one thing. What it holds is a fact the runtime observes,
 * never a field here. Its surface — a terminal, a webview — is what it was made
 * for and what it keeps, stored as a name the model never branches on. A *run* is text
 * written on the canvas: no process, and a size decided by what it says rather than by
 * the grid. A title grows sideways; a note is a block the words wrap inside. Those are
 * different geometries, which is the real reason text is its own record.
 */
export type TextStyle = "title" | "note";
export type Family = Tile["family"];

interface Placed {
  readonly id: string;
  readonly columnId: string;
  readonly rowId: string;
  /**
   * Cells owned, starting at (columnId, rowId), and changed only by dragging an edge.
   * Nothing grows or shrinks because something moved beside it. A host is placed at one
   * cell; a run is sized when it is committed, from what its words needed and what was
   * free (extent.ts).
   */
  readonly span: number;
  readonly rows: number;
}

export interface Host extends Placed {
  readonly family: "host";
  readonly surface: string;
  /** What this one is called, if named. */
  readonly name?: string;
}

export interface Run extends Placed {
  readonly family: "text";
  readonly style: TextStyle;
  readonly text: string;
}

export type Tile = Host | Run;

export const isRun = (tile: Tile): tile is Run => tile.family === "text";

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

/**
 * A fresh id, unique across processes and sessions. The app names what it places and the
 * daemon names what it makes, so a counter, which starts again in every process and on
 * every reload, hands out the same id twice.
 */
export function nextId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/* Queries ----------------------------------------------------------------- */

export function indexOfTrack(tracks: readonly Track[], id: string): number {
  return tracks.findIndex((t) => t.id === id);
}

/** The tile whose origin is this cell. Not the same question as `holder`. */
export function tileAt(grid: Grid, columnId: string, rowId: string): Tile | undefined {
  return grid.tiles.find((t) => t.columnId === columnId && t.rowId === rowId);
}

/**
 * The tile that holds a cell, by the cells it owns: a host at its cell, a run across its
 * extent. A cell holds at most one, which is the model's invariant and not the view's.
 */
export function holder(grid: Grid, ci: number, ri: number): Tile | undefined {
  return grid.tiles.find((t) => contains(footprint(grid, t), ci, ri));
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
  what: { family: "text"; style?: TextStyle } | { family: "host"; surface: string },
  id = nextId("t"),
): Grid {
  // Only onto an empty cell: nothing's origin, and inside nothing's extent.
  if (holder(grid, indexOfTrack(grid.columns, columnId), indexOfTrack(grid.rows, rowId))) return grid;
  const tile: Tile =
    what.family === "text"
      ? { id, family: "text", columnId, rowId, style: what.style ?? "title", text: "", span: 1, rows: 1 }
      : { id, family: "host", columnId, rowId, surface: what.surface, span: 1, rows: 1 };
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
export function wellFormed(grid: Grid, r: Region, lifted: ReadonlySet<string> = new Set()): boolean {
  return (
    grid.tiles.every((tile) => {
      if (lifted.has(tile.id)) return true;
      const f = footprint(grid, tile);
      return !overlaps(f, r) || covers(r, f);
    }) &&
    grid.scopes.every((scope) => {
      if (lifted.has(scope.id)) return true;
      const b = bounds(grid, scope);
      return !overlaps(b, r) || covers(r, b) || covers(b, r);
    })
  );
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

/** The cells a tile owns. */
export function footprint(grid: Grid, tile: Tile): Region {
  return { ci: indexOfTrack(grid.columns, tile.columnId), ri: indexOfTrack(grid.rows, tile.rowId), span: tile.span, rows: tile.rows };
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

/**
 * A grid with moves applied, whole. Positions are ids, so a move is a track lookup — and
 * a destination past the tracks gets tracks made first, never dropped. Tracks prepended
 * on the way shift every index by `dc` and `dr`, which the caller must carry into any
 * index it still holds.
 */
export function applied(grid: Grid, moves: readonly Move[]): { grid: Grid; dc: number; dr: number } {
  if (moves.length === 0) return { grid, dc: 0, dr: 0 };
  const size = (m: Move) => {
    const tile = grid.tiles.find((x) => x.id === m.id);
    if (tile) {
      const f = footprint(grid, tile);
      return { span: m.span ?? f.span, rows: m.rows ?? f.rows };
    }
    const scope = grid.scopes.find((x) => x.id === m.id);
    const b = scope ? bounds(grid, scope) : { span: 1, rows: 1 };
    return { span: m.span ?? b.span, rows: m.rows ?? b.rows };
  };
  const reach = moves.reduce(
    (r, m) => {
      const s = size(m);
      return {
        ci: Math.min(r.ci, m.ci),
        ri: Math.min(r.ri, m.ri),
        c1: Math.max(r.c1, m.ci + s.span),
        r1: Math.max(r.r1, m.ri + s.rows),
      };
    },
    { ci: Infinity, ri: Infinity, c1: -Infinity, r1: -Infinity },
  );
  const made = ensureTracks(grid, { ci: reach.ci, ri: reach.ri, span: reach.c1 - reach.ci, rows: reach.r1 - reach.ri });
  const g = made.grid;
  const at = new Map(moves.map((m) => [m.id, { ...m, ci: m.ci + made.dc, ri: m.ri + made.dr }]));
  const track = (tracks: readonly Track[], i: number) => tracks[i]?.id;
  const next: Grid = {
    ...g,
    tiles: g.tiles.map((tile) => {
      const m = at.get(tile.id);
      const columnId = m && track(g.columns, m.ci);
      const rowId = m && track(g.rows, m.ri);
      if (!m || !columnId || !rowId) return tile;
      // A size on a move is a resize: the tile's new cells.
      return { ...tile, columnId, rowId, span: m.span ?? tile.span, rows: m.rows ?? tile.rows };
    }),
    scopes: g.scopes.map((scope) => {
      const m = at.get(scope.id);
      if (!m) return scope;
      const b = bounds(g, scope);
      const columnStart = track(g.columns, m.ci);
      const columnEnd = track(g.columns, m.ci + (m.span ?? b.span) - 1);
      const rowStart = track(g.rows, m.ri);
      const rowEnd = track(g.rows, m.ri + (m.rows ?? b.rows) - 1);
      return columnStart && columnEnd && rowStart && rowEnd
        ? { ...scope, columnStart, columnEnd, rowStart, rowEnd }
        : scope;
    }),
  };
  return { grid: next, dc: made.dc, dr: made.dr };
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
 * Move one edge of a tile by `n` cells. A tile has no interior lines to insert at, only
 * edges. Outward grows it, pushing whatever is beyond, and refuses if that would take it
 * out of its scope or into one; inward shrinks it, and a run's words reflow. Either way
 * the tile's size is what the drag left it.
 */
function resizeTile(grid: Grid, tile: Tile, axis: Axis, line: number, n: number): Resize {
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
    return { ok: true, after, band, moves: [{ id: tile.id, ci: after.ci, ri: after.ri, span: after.span, rows: after.rows }] };
  }
  const after: Region = { ...b, [P]: line === start ? start - k : start, [S]: b[S] + k };
  const band: Region = { ...b, [P]: line === start ? start - k : end, [S]: k };
  const grown: Move = { id: tile.id, ci: after.ci, ri: after.ri, span: after.span, rows: after.rows };
  const sign = n > 0 ? 1 : -1;
  // In a scope, the tile pushes its neighbours there, each alone, the way an edge dragged
  // inward pushes a scope's contents. When the tile or anything it pushes would pass the
  // scope's edge, the scope grows at that edge by exactly as much first, by its own edge
  // resize, which pushes the world beyond it; the tile is then resized within it. Nothing
  // leaves its scope, and nothing is refused for want of room inside one.
  const home = scopeAt(grid, b.ci, b.ri);
  if (home) {
    const s = bounds(grid, home);
    const inside = grid.tiles.filter((t) => covers(s, footprint(grid, t)));
    const pushed = push({ ...grid, tiles: inside, scopes: [] }, b, after, axis, sign, new Set([tile.id]));
    const landed = [
      after,
      ...pushed.map((m) => ({ ...footprint(grid, inside.find((x) => x.id === m.id) as Tile), ci: m.ci, ri: m.ri })),
    ];
    const edge = sign > 0 ? s[P] + s[S] : s[P];
    const over = sign > 0 ? Math.max(...landed.map((r) => r[P] + r[S])) - edge : edge - Math.min(...landed.map((r) => r[P]));
    if (over <= 0) return { ok: true, after, band, moves: [grown, ...pushed] };
    const grow = proposeResize(grid, home.id, axis, edge, sign * over);
    if (!grow.ok) return { ...refuse, band };
    const mid = applied(grid, grow.moves);
    const shifted = mid.grid.tiles.find((t) => t.id === tile.id);
    const within = shifted && resizeTile(mid.grid, shifted, axis, line + (axis === "col" ? mid.dc : mid.dr), n);
    if (!within?.ok) return { ...refuse, band };
    // Back in this grid's indices: the scope's growth may have prepended tracks.
    const back = <R extends { ci: number; ri: number }>(r: R): R => ({ ...r, ci: r.ci - mid.dc, ri: r.ri - mid.dr });
    return {
      ok: true,
      after: back(within.after),
      band: within.band ? back(within.band) : band,
      moves: [...grow.moves, ...within.moves.map(back)],
    };
  }
  // Out of every scope, a scope is pushed whole like any unit, and the tile stays out of
  // every scope once everything has been pushed.
  const moves: Move[] = [grown, ...push(grid, b, after, axis, sign, new Set([tile.id]))];
  const world = applied(grid, moves);
  for (const [ci, ri] of cells(after)) {
    if (scopeAt(world.grid, ci + world.dc, ri + world.dr)) return { ...refuse, band };
  }
  return { ok: true, after, band, moves };
}

export function proposeResize(grid: Grid, ownerId: string, axis: Axis, line: number, n: number): Resize {
  const tile = grid.tiles.find((x) => x.id === ownerId);
  if (tile) return resizeTile(grid, tile, axis, line, n);
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
  const all = owners(grid);
  const here = all.filter((o) => covers(from, o.region));
  /*
   * Everything else, with the carried things lifted out: what is being carried is
   * nowhere until it lands, which is what lets a thing slide over its own old cells.
   * Lifted by ignoring their ids, not by building a world without them, because a run
   * is elastic: in a world without the carried, a run they had cut short grows back
   * into the vacated cells, and the move is judged against text that is not there. A
   * run yields to whatever lands beside it, so a move is judged against runs as they
   * are now, never as they would grow.
   */
  const lifted = new Set(here.map((o) => o.id));
  const others = all.filter((o) => !lifted.has(o.id));
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
  // judged as it is; the destination with the carried things lifted.
  if (!wellFormed(grid, from) || !wellFormed(grid, to, lifted)) return refuse;

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
