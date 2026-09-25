import { footprint, type Grid, indexOfTrack, type Run, scopeAt } from "./grid.ts";
import { contains, type Region } from "./region.ts";
import { cellsFor, linesFor, spanFor } from "./text.ts";

/**
 * How far a run reaches with a given text: what the words need, bounded by what is free
 * beside and below it. Free is not another tile's cells, and not across a scope boundary
 * in either direction, since text may not leave a scope and may not enter one.
 *
 * Asked while a run is typed, so its cells open up as the words do, and once, when it is
 * committed: the answer is then stored as the run's size, and only dragging an edge
 * changes it after that. A run does not grow or shrink because something moved beside it.
 */
export function extentFor(grid: Grid, run: Run, text: string): Region {
  const ci = indexOfTrack(grid.columns, run.columnId);
  const ri = indexOfTrack(grid.rows, run.rowId);
  const home = scopeAt(grid, ci, ri);
  const free = (c: number, r: number): boolean =>
    scopeAt(grid, c, r) === home &&
    !grid.tiles.some((t) => t.id !== run.id && contains(footprint(grid, t), c, r));
  const wantSpan = spanFor(run.style, text);
  let span = 1;
  while (span < wantSpan && free(ci + span, ri)) span += 1;
  // A row counts only if every cell across the run's width is free: a line of text cannot
  // be written around an obstacle.
  const wantRows = cellsFor(run.style, linesFor(run.style, text, span));
  let rows = 1;
  const row = (n: number): boolean => {
    for (let c = ci; c < ci + span; c++) if (!free(c, ri + n)) return false;
    return true;
  };
  while (rows < wantRows && row(rows)) rows += 1;
  return { ci, ri, span, rows };
}
