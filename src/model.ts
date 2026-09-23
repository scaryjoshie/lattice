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
}

/**
 * A scope is a named region that tiles belong to — a worktree. Rectangular in the model,
 * which is what keeps room always makeable. Stored as two track ranges, not a cell list,
 * so inserting a track inside it costs nothing.
 */
export interface Scope {
  readonly id: string;
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

/** Every cell of a region lies in the same scope, or in none. */
export function homogeneous(grid: Grid, r: Region): boolean {
  const home = scopeAt(grid, r.ci, r.ri);
  for (const [ci, ri] of cells(r)) if (scopeAt(grid, ci, ri) !== home) return false;
  return true;
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

/** How many columns a run may occupy, starting at its own cell. */
export function columnsFor(grid: Grid, tileId: string, ci: number, ri: number, limit = 40): number {
  const home = scopeAt(grid, ci, ri);
  let n = 1;
  while (n < limit && available(grid, tileId, home, ci + n, ri)) n += 1;
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
  limit = 40,
): number {
  const home = scopeAt(grid, ci, ri);
  const row = (n: number): Region => ({ ci, ri: ri + n, span, rows: 1 });
  let n = 1;
  while (n < limit && [...cells(row(n))].every(([c, r]) => available(grid, tileId, home, c, r))) n += 1;
  return n;
}

/**
 * The smallest region containing `r` that no tile straddles: grow to the bounding box of
 * everything it touches, and again, until nothing new is touched. A selection is offered
 * closed, so the only way it can still be invalid is by crossing a scope edge, which
 * growing cannot fix.
 */
export function close(grid: Grid, r: Region): Region {
  for (;;) {
    let c0 = r.ci;
    let r0 = r.ri;
    let c1 = r.ci + r.span;
    let r1 = r.ri + r.rows;
    for (const tile of grid.tiles) {
      const f = footprint(grid, tile);
      if (!overlaps(f, r)) continue;
      c0 = Math.min(c0, f.ci);
      r0 = Math.min(r0, f.ri);
      c1 = Math.max(c1, f.ci + f.span);
      r1 = Math.max(r1, f.ri + f.rows);
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
export interface Move {
  tileId: string;
  ci: number;
  ri: number;
}

/**
 * Whether one region of the grid may be exchanged with another, and everything that would
 * move if it were. Dragging a tile is the case where `from` is that tile's footprint; a
 * selection is any region. `swaps` says whether something at the destination would come
 * back, and is answered whatever the verdict, because a refused exchange is still drawn
 * as the exchange it refuses.
 */
export function proposeMove(
  grid: Grid,
  from: Region,
  to: Region,
): { ok: boolean; swaps: boolean; moves: readonly Move[] } {
  const touching = (region: Region): Tile[] =>
    grid.tiles.filter((tile) => overlaps(footprint(grid, tile), region));
  const inside = (region: Region): Tile[] =>
    grid.tiles.filter((tile) => covers(region, footprint(grid, tile)));
  const here = inside(from);
  const there = touching(to).filter((tile) => !here.includes(tile));
  const swaps = there.length > 0;
  const refuse = { ok: false, swaps, moves: [] as const };

  if (to.ci === from.ci && to.ri === from.ri) return { ok: true, swaps, moves: [] };

  // Both regions must be self-contained: nothing may have cells both in and out of one,
  // because such a tile cannot be exchanged without tearing. And neither may straddle a
  // scope edge, which is the same rule a selection obeys.
  if (!homogeneous(grid, from) || !homogeneous(grid, to)) return refuse;
  if (touching(from).length !== here.length) return refuse;

  const shift = (tile: Tile, by: Region, into: Region): Move => {
    const f = footprint(grid, tile);
    return { tileId: tile.id, ci: f.ci - by.ci + into.ci, ri: f.ri - by.ri + into.ri };
  };

  // A region that overlaps its own destination cannot be exchanged with itself, so the
  // move is only a slide, and only into space nothing else is in.
  if (overlaps(from, to)) {
    return swaps ? refuse : { ok: true, swaps, moves: here.map((tile) => shift(tile, from, to)) };
  }

  if (!there.every((tile) => covers(to, footprint(grid, tile)))) return refuse;
  return {
    ok: true,
    swaps,
    moves: [...here.map((tile) => shift(tile, from, to)), ...there.map((tile) => shift(tile, to, from))],
  };
}

/* Seed -------------------------------------------------------------------- */

export function seed(): Grid {
  const columns = Array.from({ length: 18 }, () => ({ id: nextId("c") }));
  const rows = Array.from({ length: 11 }, () => ({ id: nextId("r") }));
  const col = (i: number) => columns[i]!.id;
  const row = (i: number) => rows[i]!.id;

  const scopes: Scope[] = [
    { id: nextId("g"), hue: 0, columnStart: col(2), columnEnd: col(4), rowStart: row(1), rowEnd: row(4) },
    { id: nextId("g"), hue: 1, columnStart: col(11), columnEnd: col(14), rowStart: row(1), rowEnd: row(3) },
    { id: nextId("g"), hue: 2, columnStart: col(3), columnEnd: col(6), rowStart: row(6), rowEnd: row(9) },
    { id: nextId("g"), hue: 3, columnStart: col(12), columnEnd: col(14), rowStart: row(6), rowEnd: row(8) },
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
