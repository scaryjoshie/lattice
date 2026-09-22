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

export interface Tile {
  readonly id: string;
  readonly columnId: string;
  readonly rowId: string;
}

export interface Grid {
  readonly columns: readonly Track[];
  readonly rows: readonly Track[];
  readonly tiles: readonly Tile[];
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
  return { columns, rows: grid.rows, tiles: grid.tiles };
}

export function insertRowsAt(grid: Grid, at: number, ids: readonly string[]): Grid {
  if (ids.length === 0) return grid;
  const rows = grid.rows.slice();
  rows.splice(at, 0, ...ids.map((id) => ({ id })));
  return { columns: grid.columns, rows, tiles: grid.tiles };
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

export function addTile(grid: Grid, columnId: string, rowId: string, id = nextId("t")): Grid {
  if (tileAt(grid, columnId, rowId)) return grid;
  return { ...grid, tiles: [...grid.tiles, { id, columnId, rowId }] };
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

/* Seed -------------------------------------------------------------------- */

export function seed(): Grid {
  const columns = Array.from({ length: 14 }, () => ({ id: nextId("c") }));
  const rows = Array.from({ length: 9 }, () => ({ id: nextId("r") }));
  const cells: [number, number][] = [
    [3, 2],
    [4, 2],
    [4, 3],
    [8, 1],
    [9, 4],
    [6, 6],
    [11, 6],
  ];
  const tiles = cells.flatMap(([c, r]) => {
    const column = columns[c];
    const row = rows[r];
    return column && row ? [{ id: nextId("t"), columnId: column.id, rowId: row.id }] : [];
  });
  return { columns, rows, tiles };
}
