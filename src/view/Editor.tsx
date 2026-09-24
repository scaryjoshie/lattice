import { useLayoutEffect, useState } from "react";
import { columnsFor, indexOfTrack, rowsFor } from "../model/grid.ts";
import { cellsFor, fontOf, linesFor, METRICS, spanFor } from "../paint/measure.ts";
import { CELL, worldX } from "../scene/geometry.ts";
import { useGrid } from "../store/store.ts";

/**
 * Typing a run.
 *
 * The span follows the words, cell by cell, so nothing is cleared before there is
 * something to put in it. It stops at the first cell that already holds something — the
 * way a spreadsheet lets text spill into empty neighbours and cuts it off at a full one —
 * because two things cannot be in one cell, and pushing the neighbour aside needs a notion
 * of what may be pushed that does not exist yet.
 */
export function Editor({
  id,
  onDone,
  onShape,
}: {
  id: string;
  onDone(): void;
  onShape(span: number, rows: number): void;
}) {
  const grid = useGrid((s) => s.grid);
  const run = useGrid((s) => s.run);
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
  // only a caret and glyphs, so it has to say how far it currently reaches — both axes,
  // since the canvas leaves a run's cells unruled only for cells it has been told about.
  // After the render, not during it: reporting is a change to the session.
  useLayoutEffect(() => onShape(span, rows), [onShape, span, rows]);
  const commit = () => {
    onDone();
    run(draft.trim() === "" ? { kind: "remove", id } : { kind: "setText", id, text: draft, span, rows });
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
          if ((tile.text ?? "") === "") run({ kind: "remove", id });
        }
      }}
    />
  );
}

