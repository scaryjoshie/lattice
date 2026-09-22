import { useCallback, useEffect, useRef } from "react";
import { useCamera } from "./camera.ts";
import { type Camera, CELL, cellAt, worldX } from "./geometry.ts";
import { indexOfTrack, regionBounds } from "./model.ts";
import { type Cell, paint } from "./paint.ts";
import { hue } from "./palette.ts";
import { useGrid } from "./store.ts";

/**
 * Two layers over one camera. The canvas paints every cell, occupied or not, so that cells
 * can later know about their neighbours without any DOM being involved. The tile layer is
 * transparent and sits on top, because a tile eventually holds a terminal and that has to
 * be real text in a real element.
 *
 * React renders when the model changes. Panning and zooming call `draw` and nothing else.
 */
/** Which region owns a cell, by index, so a tile can take the hue it sits in. */
function regionHue(grid: ReturnType<typeof useGrid.getState>["grid"], ci: number, ri: number) {
  for (const region of grid.regions) {
    const { c0, c1, r0, r1 } = regionBounds(grid, region);
    if (ci >= c0 && ci <= c1 && ri >= r0 && ri <= r1) return region.hue;
  }
  return null;
}

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

    // One flat map from cell to what is true of it. Built per draw because it is small,
    // and because the paint needs to ask about neighbours, which a range cannot answer.
    const g = model.current;
    const cells = new Map<string, Cell>();
    for (const region of g.regions) {
      const { c0, c1, r0, r1 } = regionBounds(g, region);
      for (let ri = r0; ri <= r1; ri++) {
        for (let ci = c0; ci <= c1; ci++) cells.set(`${ci},${ri}`, { hue: region.hue, occupied: false });
      }
    }
    for (const tile of g.tiles) {
      const ci = indexOfTrack(g.columns, tile.columnId);
      const ri = indexOfTrack(g.rows, tile.rowId);
      const existing = cells.get(`${ci},${ri}`);
      cells.set(`${ci},${ri}`, { hue: existing?.hue ?? null, occupied: true });
    }
    paint(ctx, { camera, width, height, dpr, cells, hover: hover.current });

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
    if (prev === next) return;
    if (prev && next && prev[0] === next[0] && prev[1] === next[1]) return;
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
          const h = hue(regionHue(grid, ci, ri));
          return (
            <div
              key={tile.id}
              className="tile"
              style={{ left: worldX(ci), top: worldX(ri), width: CELL, height: CELL }}
            >
              <span className="label" style={{ color: h.ink, background: h.tint }}>
                {tile.name}
              </span>
              <span className="dot" style={{ background: h.ink }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
