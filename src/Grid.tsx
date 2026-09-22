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
        {grid.regions.map((region) => {
          const { c0, r0 } = regionBounds(grid, region);
          return (
            <span
              key={region.id}
              className="label"
              style={{
                left: worldX(c0),
                top: worldX(r0),
                color: hue(region.hue).ink,
                background: hue(region.hue).tint,
              }}
            >
              {region.label}
            </span>
          );
        })}
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
