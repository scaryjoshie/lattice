import { useState } from "react";
import { indexOfTrack, isRun } from "@lattice/model";
import { nameFont } from "../paint/measure.ts";
import { CELL, worldX } from "../scene/geometry.ts";
import { useGrid } from "../store/store.ts";

/**
 * Naming a tile. A name has exactly the one cell its tile occupies, so it is typed in the
 * place it will live and at the size it will be, and is cut to fit rather than allowed to
 * spill — an occupant owns one cell and its name cannot claim more.
 */
export function Namer({ id, onDone }: { id: string; onDone(): void }) {
  const grid = useGrid((s) => s.grid);
  const run = useGrid((s) => s.run);
  const found = grid.tiles.find((x) => x.id === id);
  const tile = found && !isRun(found) ? found : undefined;
  const [draft, setDraft] = useState(tile?.name ?? "");
  if (!tile) return null;
  const ci = indexOfTrack(grid.columns, tile.columnId);
  const ri = indexOfTrack(grid.rows, tile.rowId);
  const commit = () => {
    onDone();
    run({ kind: "setName", id, name: draft });
  };
  return (
    <input
      className="editor namer"
      autoFocus
      spellCheck={false}
      value={draft}
      style={{
        left: worldX(ci),
        top: worldX(ri) + CELL * 0.69,
        width: CELL,
        height: CELL * 0.2,
        font: nameFont(CELL),
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.preventDefault();
          onDone();
        }
      }}
    />
  );
}

