import { motion } from "motion/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Tile as TileModel } from "../grid/model.ts";

/** One tile is one cell. Larger tiles are a later problem and would still be square. */

export const SLIDE = { type: "spring", stiffness: 420, damping: 40, mass: 0.8 } as const;

export interface TileProps {
  tile: TileModel;
  gridColumn: number;
  gridRow: number;
  /** Plane-space offset while this tile is being dragged, or null when it is not. */
  offset: { x: number; y: number } | null;
  onPointerDown(event: ReactPointerEvent<HTMLElement>, tile: TileModel): void;
  onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
}

export function Tile({ tile, gridColumn, gridRow, offset, ...handlers }: TileProps) {
  const dragged = offset !== null;
  return (
    <motion.div
      className="tile"
      data-dragged={dragged || undefined}
      // Layout animation is what makes an insertion legible; it is off while dragging,
      // where the tile is already following the pointer directly.
      layout={dragged ? false : "position"}
      transition={SLIDE}
      style={{ gridColumn, gridRow, ...(offset ?? {}) }}
      onPointerDown={(e) => handlers.onPointerDown(e, tile)}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerUp}
    >
      <span className="tile-id">{tile.id}</span>
    </motion.div>
  );
}
