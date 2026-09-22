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

/** What is running in a tile. Not a label — it decides which mark is drawn. */
export type TileKind = "claude" | "codex" | "shell";

export interface Tile {
  readonly id: string;
  readonly kind: TileKind;
  readonly columnId: string;
  readonly rowId: string;
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

export interface Grid {
  readonly columns: readonly Track[];
  readonly rows: readonly Track[];
  readonly tiles: readonly Tile[];
  readonly regions: readonly Region[];
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
): Grid {
  if (tileAt(grid, columnId, rowId)) return grid;
  return { ...grid, tiles: [...grid.tiles, { id, kind, columnId, rowId }] };
}

export function removeTile(grid: Grid, tileId: string): Grid {
  return { ...grid, tiles: grid.tiles.filter((t) => t.id !== tileId) };
}

/**
 * Occupancy, not snapping: a cell holds one tile, so landing on an occupied cell swaps the
 * two. Swapping rather than displacing keeps the move reversible and never cascades.
 */
export function moveTile(grid: Grid, tileId: string, columnId: string, rowId: string): Grid {
  const moving = grid.tiles.find((t) => t.id === tileId);
  if (!moving) return grid;
  const sitting = tileAt(grid, columnId, rowId);
  if (sitting?.id === tileId) return grid;
  const tiles = grid.tiles.map((t) => {
    if (t.id === tileId) return { ...t, columnId, rowId };
    if (sitting && t.id === sitting.id) return { ...t, columnId: moving.columnId, rowId: moving.rowId };
    return t;
  });
  return { ...grid, tiles };
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

  const cells: [number, number, TileKind][] = [
    [3, 2, "claude"], [3, 3, "codex"], [2, 3, "claude"],
    [12, 2, "codex"], [13, 2, "claude"],
    [4, 7, "claude"], [5, 7, "claude"], [5, 8, "codex"],
    [13, 7, "claude"],
    [8, 4, "shell"],
  ];
  const tiles = cells.map(([c, r, kind]) => ({
    id: nextId("t"),
    kind,
    columnId: col(c),
    rowId: row(r),
  }));
  return { columns, rows, tiles, regions };
}
