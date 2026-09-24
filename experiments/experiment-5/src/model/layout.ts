import { type Grid, indexOfTrack, isRun, type Run, scopeAt } from "./grid.ts";
import type { Region } from "./region.ts";
import { cellsFor, linesFor, spanFor } from "./text.ts";

/**
 * Where every run's cells are. A run's extent is not stored: it is what its words need,
 * bounded by what is free beside and below it, unless the writer capped an axis. So
 * anything that stops blocking a run lets it breathe, with no rule per case — move a host
 * away, grow the scope, delete the thing in the way, and the run takes the room.
 *
 * What is free: not a host, not another run, and not across a scope boundary in either
 * direction, since text may not leave a scope and may not enter one. Two runs in one row
 * could each want to grow into the other, so a run is bounded by the *origin* of a later
 * run and by the laid-out extent of an earlier one, in tile order. Deterministic, and never
 * mutually recursive.
 *
 * Cached per grid value: the grid is immutable, so a layout is good for as long as the
 * grid object is.
 */
const cache = new WeakMap<Grid, ReadonlyMap<string, Region>>();

export function layout(grid: Grid): ReadonlyMap<string, Region> {
  const hit = cache.get(grid);
  if (hit) return hit;
  const laid = new Map<string, Region>();
  const origin = (tile: { columnId: string; rowId: string }): [number, number] => [
    indexOfTrack(grid.columns, tile.columnId),
    indexOfTrack(grid.rows, tile.rowId),
  ];
  // Everything a run cannot cross, keyed by cell: hosts, and every run's origin. A run's
  // full extent replaces its origin once it is laid out.
  const taken = new Map<string, string>();
  for (const tile of grid.tiles) {
    const [ci, ri] = origin(tile);
    taken.set(`${ci},${ri}`, tile.id);
  }
  const free = (run: Run, home: ReturnType<typeof scopeAt>, ci: number, ri: number): boolean => {
    if (scopeAt(grid, ci, ri) !== home) return false;
    const owner = taken.get(`${ci},${ri}`);
    return owner === undefined || owner === run.id;
  };
  for (const tile of grid.tiles) {
    if (!isRun(tile)) continue;
    const [ci, ri] = origin(tile);
    const home = scopeAt(grid, ci, ri);
    const wantSpan = tile.cap?.span ?? spanFor(tile.style, tile.text);
    let span = 1;
    while (span < wantSpan && free(tile, home, ci + span, ri)) span += 1;
    const wantRows = tile.cap?.rows ?? cellsFor(tile.style, linesFor(tile.style, tile.text, span));
    let rows = 1;
    // A row counts only if every cell across the run's width is free: a line of text
    // cannot be written around an obstacle.
    const row = (n: number): boolean => {
      for (let c = ci; c < ci + span; c++) if (!free(tile, home, c, ri + n)) return false;
      return true;
    };
    while (rows < wantRows && row(rows)) rows += 1;
    const extent: Region = { ci, ri, span, rows };
    laid.set(tile.id, extent);
    for (let r = ri; r < ri + rows; r++) for (let c = ci; c < ci + span; c++) taken.set(`${c},${r}`, tile.id);
  }
  cache.set(grid, laid);
  return laid;
}

/** The grid with one run's text replaced, for laying out a draft while it is typed. */
export function withText(grid: Grid, id: string, text: string): Grid {
  return { ...grid, tiles: grid.tiles.map((t) => (t.id === id && isRun(t) ? { ...t, text } : t)) };
}
