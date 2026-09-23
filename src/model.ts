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
 * A region is rectangular in the model — that is what keeps room always makeable — but
 * nothing requires its painted shape to look rectangular, because the paint merges cells
 * rather than drawing a box. Stored as two track ranges, not a cell list, so inserting a
 * track inside it costs nothing.
 */
export interface Region {
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
  readonly regions: readonly Region[];
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

/** The index box a region covers. Indices, because membership is an ordering question. */
export function regionBounds(
  grid: Grid,
  region: Region,
): { c0: number; c1: number; r0: number; r1: number } {
  return {
    c0: indexOfTrack(grid.columns, region.columnStart),
    c1: indexOfTrack(grid.columns, region.columnEnd),
    r0: indexOfTrack(grid.rows, region.rowStart),
    r1: indexOfTrack(grid.rows, region.rowEnd),
  };
}

/** Which region owns a cell, by index. Null for open grid. */
export function regionIdAt(grid: Grid, ci: number, ri: number): string | null {
  for (const region of grid.regions) {
    const { c0, c1, r0, r1 } = regionBounds(grid, region);
    if (ci >= c0 && ci <= c1 && ri >= r0 && ri <= r1) return region.id;
  }
  return null;
}

/**
 * Whether a cell is available to a run that started in `home`.
 *
 * This is the primitive, and there is only one: a **boundary** is anything a run cannot
 * cross, and a cell holding something else and a cell in a different region are the same
 * kind of thing. Writing them as two checks makes it possible for one axis to learn about
 * a boundary the other does not, which is how a note ended up with no vertical rule at all.
 */
export function available(
  grid: Grid,
  tileId: string,
  home: string | null,
  ci: number,
  ri: number,
): boolean {
  if (regionIdAt(grid, ci, ri) !== home) return false;
  return !grid.tiles.some((other) => {
    if (other.id === tileId) return false;
    const f = footprint(grid, other);
    return ci >= f.ci && ci < f.ci + f.span && ri >= f.ri && ri < f.ri + f.rows;
  });
}

/** How many columns a run may occupy, starting at its own cell. */
export function columnsFor(grid: Grid, tileId: string, ci: number, ri: number, limit = 40): number {
  const home = regionIdAt(grid, ci, ri);
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
  const home = regionIdAt(grid, ci, ri);
  let n = 1;
  while (n < limit) {
    let clear = true;
    for (let dx = 0; dx < span; dx++) {
      if (!available(grid, tileId, home, ci + dx, ri + n)) {
        clear = false;
        break;
      }
    }
    if (!clear) break;
    n += 1;
  }
  return n;
}

/* Moving ------------------------------------------------------------------ */

export interface Footprint {
  ci: number;
  ri: number;
  span: number;
  rows: number;
}

export function footprint(grid: Grid, tile: Tile): Footprint {
  return {
    ci: indexOfTrack(grid.columns, tile.columnId),
    ri: indexOfTrack(grid.rows, tile.rowId),
    span: tile.span ?? 1,
    rows: tile.rows ?? 1,
  };
}

const overlaps = (a: Footprint, b: Footprint): boolean =>
  a.ci < b.ci + b.span && b.ci < a.ci + a.span && a.ri < b.ri + b.rows && b.ri < a.ri + a.rows;

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

export function proposeMove(
  grid: Grid,
  tileId: string,
  ci: number,
  ri: number,
): { ok: boolean; moves: readonly Move[] } {
  const tile = grid.tiles.find((t) => t.id === tileId);
  if (!tile) return { ok: false, moves: [] };
  const from = footprint(grid, tile);
  const to: Footprint = { ci, ri, span: from.span, rows: from.rows };
  if (to.ci === from.ci && to.ri === from.ri) return { ok: true, moves: [] };

  const contains = (region: Footprint, f: Footprint): boolean =>
    f.ci >= region.ci &&
    f.ci + f.span <= region.ci + region.span &&
    f.ri >= region.ri &&
    f.ri + f.rows <= region.ri + region.rows;

  const touching = (region: Footprint): Tile[] =>
    grid.tiles.filter((other) => other.id !== tileId && overlaps(footprint(grid, other), region));

  // A region that overlaps its own destination cannot be exchanged with itself, so the
  // move is only a slide, and only into space nothing else is in.
  /*
   * A region may not straddle a worktree edge — the same rule a selection obeys, and one
   * moving was not applying at all. Containment was checked against tiles and never
   * against worktrees, so a run could be dropped half inside one.
   */
  const inOneRegion = (r: Footprint): boolean => {
    const home = regionIdAt(grid, r.ci, r.ri);
    for (let dy = 0; dy < r.rows; dy++) {
      for (let dx = 0; dx < r.span; dx++) {
        if (regionIdAt(grid, r.ci + dx, r.ri + dy) !== home) return false;
      }
    }
    return true;
  };
  if (!inOneRegion(to)) return { ok: false, moves: [] };

  if (overlaps(from, to)) {
    return touching(to).length === 0
      ? { ok: true, moves: [{ tileId, ci: to.ci, ri: to.ri }] }
      : { ok: false, moves: [] };
  }

  const there = touching(to);
  const here = touching(from);
  const whole = [...there, ...here].every((other) =>
    contains(overlaps(footprint(grid, other), to) ? to : from, footprint(grid, other)),
  );
  if (!whole) return { ok: false, moves: [] };

  const shift = (other: Tile, by: Footprint, into: Footprint): Move => {
    const f = footprint(grid, other);
    return { tileId: other.id, ci: f.ci - by.ci + into.ci, ri: f.ri - by.ri + into.ri };
  };
  return {
    ok: true,
    moves: [
      { tileId, ci: to.ci, ri: to.ri },
      ...there.map((other) => shift(other, to, from)),
      ...here.map((other) => shift(other, from, to)),
    ],
  };
}

/* Seed -------------------------------------------------------------------- */

export function seed(): Grid {
  const columns = Array.from({ length: 18 }, () => ({ id: nextId("c") }));
  const rows = Array.from({ length: 11 }, () => ({ id: nextId("r") }));
  const col = (i: number) => columns[i]!.id;
  const row = (i: number) => rows[i]!.id;

  const regions: Region[] = [
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
  return { columns, rows, tiles, regions, links };
}
