import { useCallback, useEffect, useRef } from "react";
import { useCamera } from "./camera.ts";
import { type Camera, CELL, cellAt, worldX } from "./geometry.ts";
import { indexOfTrack } from "./model.ts";
import { paint } from "./paint.ts";
import { useGrid } from "./store.ts";

/**
 * Two layers over one camera. The canvas paints every cell, occupied or not, so that cells
 * can later know about their neighbours without any DOM being involved. The tile layer is
 * transparent and sits on top, because a tile eventually holds a terminal and that has to
 * be real text in a real element.
 *
 * React renders when the model changes. Panning and zooming call `draw` and nothing else.
 */
export function Grid() {
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const hover = useRef<[number, number] | null>(null);

  const grid = useGrid((s) => s.grid);
  const model = useRef(grid);
  model.current = grid;

  const draw = useCallback((camera: Camera) => {
    const el = canvas.current;
    const host = viewport.current;
    if (!el || !host) return;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: width, clientHeight: height } = host;
    if (el.width !== width * dpr || el.height !== height * dpr) {
      el.width = width * dpr;
      el.height = height * dpr;
    }
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const g = model.current;
    const occupied = new Set(
      g.tiles.map(
        (t) => `${indexOfTrack(g.columns, t.columnId)},${indexOfTrack(g.rows, t.rowId)}`,
      ),
    );
    paint(ctx, { camera, width, height, dpr, occupied, hover: hover.current });

    // The tile layer rides the same transform, written directly for the same reason the
    // canvas is: nothing here should pass through a render.
    if (layer.current) {
      layer.current.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`;
    }
  }, []);

  const camera = useCamera(viewport, draw);

  // Redraw on model change and on resize. Both are human-paced.
  useEffect(() => {
    draw(camera.current);
  }, [draw, camera, grid]);

  useEffect(() => {
    const onResize = () => draw(camera.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw, camera]);

  const onMove = (event: React.PointerEvent) => {
    const host = viewport.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const next = cellAt(camera.current, event.clientX - box.left, event.clientY - box.top);
    const prev = hover.current;
    if (prev && prev[0] === next[0] && prev[1] === next[1]) return;
    hover.current = next;
    draw(camera.current);
  };

  const onLeave = () => {
    hover.current = null;
    draw(camera.current);
  };

  return (
    <div className="viewport" ref={viewport} onPointerMove={onMove} onPointerLeave={onLeave}>
      <canvas className="lattice" ref={canvas} />
      <div className="tiles" ref={layer}>
        {grid.tiles.map((tile) => {
          const ci = indexOfTrack(grid.columns, tile.columnId);
          const ri = indexOfTrack(grid.rows, tile.rowId);
          return (
            <div
              key={tile.id}
              className="tile"
              style={{ left: worldX(ci), top: worldX(ri), width: CELL, height: CELL }}
            >
              <span className="dot" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
