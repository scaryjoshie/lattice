import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from "react";
import { useCamera } from "../grid/camera.ts";
import { metrics, span } from "../grid/metrics.ts";
import { indexOfTrack, nextId, tileAt } from "../grid/model.ts";
import { useGrid } from "../grid/store.ts";
import { buildLanes } from "./lanes.ts";
import { Tile } from "./Tile.tsx";

/** How many tracks one gutter drag can ask for. */
const MAX_INSERT = 8;

type Axis = "col" | "row";

interface Preview {
  axis: Axis;
  at: number;
  /** Pre-generated, so the tracks the preview shows are the tracks the commit inserts. */
  pool: string[];
  count: number;
  x0: number;
  y0: number;
}

interface Drag {
  id: string;
  /** Model indices at the moment of grabbing. */
  column: number;
  row: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function Canvas() {
  const grid = useGrid((s) => s.grid);
  const addAt = useGrid((s) => s.addAt);
  const dropTile = useGrid((s) => s.dropTile);
  const insertColumns = useGrid((s) => s.insertColumns);
  const insertRows = useGrid((s) => s.insertRows);

  const m = metrics();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const cols = useMemo(
    () =>
      buildLanes(
        grid.columns,
        preview?.axis === "col" ? { at: preview.at, ids: preview.pool.slice(0, preview.count) } : null,
      ),
    [grid.columns, preview],
  );
  const rows = useMemo(
    () =>
      buildLanes(
        grid.rows,
        preview?.axis === "row" ? { at: preview.at, ids: preview.pool.slice(0, preview.count) } : null,
      ),
    [grid.rows, preview],
  );

  const viewport = useRef<HTMLDivElement>(null);
  const fit = {
    width: span(grid.columns.length + 2, m.stepX, m.gutter),
    height: span(grid.rows.length + 2, m.stepY, m.gutter),
  };
  const { transform, nudge } = useCamera(viewport, fit);
  // Read in pointer handlers, which must not close over a stale zoom.
  const k = useRef(1);
  k.current = transform.k;

  /**
   * A track added before every other one grows the grid from its left or top edge, so the
   * camera moves the same distance and the view holds still. Only pointing at a margin cell
   * gets this; a gutter drag is a request to push things aside, and should look like one.
   */
  const hold = (columnIndex: number, rowIndex: number) => {
    if (columnIndex >= 0 && rowIndex >= 0) return;
    nudge(columnIndex < 0 ? -m.stepX : 0, rowIndex < 0 ? -m.stepY : 0);
  };

  /* Dragging a tile ------------------------------------------------------- */

  const onTileDown = (event: ReactPointerEvent<HTMLElement>, tile: { id: string; columnId: string; rowId: string }) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: tile.id,
      column: indexOfTrack(grid.columns, tile.columnId),
      row: indexOfTrack(grid.rows, tile.rowId),
      x0: event.clientX,
      y0: event.clientY,
      dx: 0,
      dy: 0,
    });
  };

  const onTileMove = (event: ReactPointerEvent<HTMLElement>) => {
    setDrag((d) => (d ? { ...d, dx: event.clientX - d.x0, dy: event.clientY - d.y0 } : d));
  };

  // The whole of snap dragging: screen delta divided by the zoom, then by the lane step.
  const cellDelta = (d: Drag) => ({
    dc: Math.round(d.dx / k.current / m.stepX),
    dr: Math.round(d.dy / k.current / m.stepY),
  });

  const target = drag
    ? (() => {
        const { dc, dr } = cellDelta(drag);
        return {
          column: clamp(drag.column + dc, -1, grid.columns.length),
          row: clamp(drag.row + dr, -1, grid.rows.length),
        };
      })()
    : null;

  const onTileUp = () => {
    if (drag && target) {
      dropTile(drag.id, target.column, target.row);
      hold(target.column, target.row);
    }
    setDrag(null);
  };

  /* Dragging a gutter ----------------------------------------------------- */

  const onGutterDown = (event: ReactPointerEvent<HTMLElement>, axis: Axis, at: number) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreview({
      axis,
      at,
      pool: Array.from({ length: MAX_INSERT }, () => nextId(axis === "col" ? "c" : "r")),
      count: 0,
      x0: event.clientX,
      y0: event.clientY,
    });
  };

  const onGutterMove = (event: ReactPointerEvent<HTMLElement>) => {
    setPreview((p) => {
      if (!p) return p;
      const d = p.axis === "col" ? event.clientX - p.x0 : event.clientY - p.y0;
      const step = p.axis === "col" ? m.stepX : m.stepY;
      const count = clamp(Math.round(d / k.current / step), 0, MAX_INSERT);
      return count === p.count ? p : { ...p, count };
    });
  };

  const onGutterUp = () => {
    if (preview && preview.count > 0) {
      const ids = preview.pool.slice(0, preview.count);
      if (preview.axis === "col") insertColumns(preview.at, ids);
      else insertRows(preview.at, ids);
    }
    setPreview(null);
  };

  /* Cells ----------------------------------------------------------------- */

  const cells = cols.list.flatMap((cl, ci) =>
    rows.list.flatMap((rl, ri) => {
      const ghost = cl.kind === "ghost" || rl.kind === "ghost";
      if (cl.kind === "track" && rl.kind === "track" && tileAt(grid, cl.id, rl.id)) return [];
      const margin = cl.kind === "edge" || rl.kind === "edge";
      return [
        <div
          key={`${ci}:${ri}`}
          className="cell"
          data-kind={ghost ? "ghost" : margin ? "margin" : "open"}
          style={{ gridColumn: ci + 1, gridRow: ri + 1 }}
          onClick={
            ghost
              ? undefined
              : () => {
                  addAt(cl.at, rl.at);
                  hold(cl.at, rl.at);
                }
          }
        />,
      ];
    }),
  );

  /* Gutters --------------------------------------------------------------- */

  const gutters = [
    ...axisGutters("col", grid.columns.length, (i) => grid.columns[i]?.id, cols.ofTrack, onGutterDown, onGutterMove, onGutterUp),
    ...axisGutters("row", grid.rows.length, (i) => grid.rows[i]?.id, rows.ofTrack, onGutterDown, onGutterMove, onGutterUp),
  ];

  return (
    <div className="viewport" ref={viewport} data-busy={drag || preview ? "" : undefined}>
      <div
        className="plane"
        style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols.list.length}, var(--cell-w))`,
            gridTemplateRows: `repeat(${rows.list.length}, var(--cell-h))`,
          }}
        >
          {cells}
          {gutters}
          {target ? (
            <div
              className="target"
              style={{
                gridColumn: cols.ofIndex.get(target.column),
                gridRow: rows.ofIndex.get(target.row),
              }}
            />
          ) : null}
          {grid.tiles.map((tile) => {
            const gridColumn = cols.ofTrack.get(tile.columnId);
            const gridRow = rows.ofTrack.get(tile.rowId);
            if (!gridColumn || !gridRow) return null;
            const dragged = drag?.id === tile.id ? drag : null;
            return (
              <Tile
                key={tile.id}
                tile={tile}
                gridColumn={gridColumn}
                gridRow={gridRow}
                // Divided by the zoom, so the tile tracks the pointer exactly.
                offset={dragged ? { x: dragged.dx / k.current, y: dragged.dy / k.current } : null}
                onPointerDown={onTileDown}
                onPointerMove={onTileMove}
                onPointerUp={onTileUp}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * One handle per insertion point, `tracks.length + 1` of them. Each is a grid item sitting
 * in a gap, so the gaps need no measuring — the template already put them where they are.
 */
function axisGutters(
  axis: Axis,
  count: number,
  trackId: (i: number) => string | undefined,
  line: Map<string, number>,
  down: (e: ReactPointerEvent<HTMLElement>, axis: Axis, at: number) => void,
  move: (e: ReactPointerEvent<HTMLElement>) => void,
  up: () => void,
) {
  const out = [];
  for (let at = 0; at <= count; at += 1) {
    const anchor = trackId(at < count ? at : count - 1);
    const position = anchor === undefined ? undefined : line.get(anchor);
    if (!position) continue;
    const side = at < count ? "start" : "end";
    out.push(
      <div
        key={`${axis}${at}`}
        className={`gutter gutter-${axis}`}
        data-side={side}
        style={axis === "col" ? { gridColumn: position, gridRow: "1 / -1" } : { gridRow: position, gridColumn: "1 / -1" }}
        onPointerDown={(e) => down(e, axis, at)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />,
    );
  }
  return out;
}
