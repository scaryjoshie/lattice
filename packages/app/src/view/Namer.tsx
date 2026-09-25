import { useState } from "react";
import { footprint, isRun, NAME } from "@lattice/model";
import { FONT } from "../paint/measure.ts";
import { CELL, worldX } from "../scene/geometry.ts";
import { useGrid } from "../store/store.ts";

/**
 * Naming a tile. A name has the width of its tile and sits under the mark, so it is typed
 * in the place it will live and at the size it will be, and is cut to fit rather than
 * allowed to spill past the tile.
 */
export function Namer({ id, onDone }: { id: string; onDone(): void }) {
  const grid = useGrid((s) => s.grid);
  const run = useGrid((s) => s.run);
  const found = grid.tiles.find((x) => x.id === id);
  const tile = found && !isRun(found) ? found : undefined;
  const [draft, setDraft] = useState(tile?.name ?? "");
  if (!tile) return null;
  const { ci, ri, span, rows } = footprint(grid, tile);
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
        // Under the mark, which sits in the middle of the host.
        top: worldX(ri) + CELL * ((rows - 1) / 2 + 0.69),
        width: CELL * span,
        height: CELL * 0.2,
        fontFamily: FONT,
        fontSize: CELL * NAME.size,
        fontWeight: NAME.weight,
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

