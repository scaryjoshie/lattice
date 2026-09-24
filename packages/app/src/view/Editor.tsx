import { footprint, indexOfTrack, isRun, METRICS, withText } from "@lattice/model";
import { useLayoutEffect, useState } from "react";
import { fontOf } from "../paint/measure.ts";
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
  onDraft,
}: {
  id: string;
  onDone(): void;
  onDraft(text: string): void;
}) {
  const grid = useGrid((s) => s.grid);
  const run = useGrid((s) => s.run);
  const found = grid.tiles.find((x) => x.id === id);
  const tile = found && isRun(found) ? found : undefined;
  const [draft, setDraft] = useState(tile?.text ?? "");

  if (!tile) return null;
  const ci = indexOfTrack(grid.columns, tile.columnId);
  const ri = indexOfTrack(grid.rows, tile.rowId);
  const style = tile.style;
  const m = METRICS[style];

  // Where the run reaches with the draft in it: what the words need, bounded by what is
  // free, capped where the writer fixed an axis. The same layout the scene uses, so the
  // input and the canvas cannot disagree about the run's cells.
  const { span, rows } = footprint(withText(grid, id, draft), tile);
  // The canvas draws the run's surface and ruling even while typing; the input contributes
  // only a caret and glyphs, so it says what it currently holds and the scene does the rest.
  useLayoutEffect(() => onDraft(draft), [onDraft, draft]);
  const commit = () => {
    onDone();
    run(draft.trim() === "" ? { kind: "remove", id } : { kind: "setText", id, text: draft });
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
          // Abandoning is the editor's: say so, or the window reads it as cancel.
          e.preventDefault();
          onDone();
          if (tile.text === "") run({ kind: "remove", id });
        }
      }}
    />
  );
}

