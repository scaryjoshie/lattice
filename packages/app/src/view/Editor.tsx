import { extentFor, indexOfTrack, isRun, METRICS } from "@lattice/model";
import { useLayoutEffect, useState } from "react";
import { FONT } from "../paint/measure.ts";
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
  onDraft(text: string, caret: number): void;
}) {
  const grid = useGrid((s) => s.grid);
  const run = useGrid((s) => s.run);
  const found = grid.tiles.find((x) => x.id === id);
  const tile = found && isRun(found) ? found : undefined;
  const [draft, setDraft] = useState(tile?.text ?? "");
  const [caret, setCaret] = useState(tile?.text.length ?? 0);

  if (!tile) return null;
  const ci = indexOfTrack(grid.columns, tile.columnId);
  const ri = indexOfTrack(grid.rows, tile.rowId);
  const style = tile.style;
  const m = METRICS[style];

  // Where the run reaches with the draft in it: what the words need, bounded by what is
  // free. The same answer the scene draws and the commit stores, so the input, the
  // canvas and the model cannot disagree about the run's cells.
  const { span, rows } = extentFor(grid, tile, draft);
  // The canvas draws the run's surface, its ruling and its caret even while typing; the
  // input contributes glyphs, and says what it holds and where its caret is. Its own caret
  // is hidden: a textarea's is as tall as its line box, a whole cell for a title.
  useLayoutEffect(() => onDraft(draft, caret), [onDraft, draft, caret]);
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
        // The font as three properties, never the shorthand: the shorthand resets
        // line-height, and an engine that applies the two in a different order lays the
        // lines out at the font's own pitch while the canvas puts the caret at ours.
        fontFamily: FONT,
        fontSize: CELL * m.size,
        fontWeight: m.weight,
        // The line box is the leading, so line n of the input sits where line n is drawn.
        lineHeight: `${CELL * m.leading}px`,
        padding: `0 ${CELL * m.inset}px`,
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        setCaret(e.target.selectionEnd);
      }}
      onSelect={(e) => setCaret(e.currentTarget.selectionEnd)}
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

