import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCamera } from "./camera.ts";
import { type Camera, CELL, cellAt, worldX } from "./geometry.ts";
import { indexOfTrack, regionBounds } from "./model.ts";
import { type Cell, paint, type Plate } from "./paint.ts";
import { Mark } from "./marks.tsx";
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

  /**
   * Derived from the model, so it is rebuilt when the model changes and never on a camera
   * event. Recomputing it per wheel event was allocating a map hundreds of times a second
   * for data that had not moved.
   */
  const scene = useMemo(() => {
    const cells = new Map<string, Cell>();
    const plates: Plate[] = [];
    for (const region of grid.regions) {
      const { c0, c1, r0, r1 } = regionBounds(grid, region);
      plates.push({ hue: region.hue, c0, c1, r0, r1 });
      for (let ri = r0; ri <= r1; ri++) {
        for (let ci = c0; ci <= c1; ci++) {
          cells.set(`${ci},${ri}`, { hue: region.hue, occupied: false });
        }
      }
    }
    for (const tile of grid.tiles) {
      const ci = indexOfTrack(grid.columns, tile.columnId);
      const ri = indexOfTrack(grid.rows, tile.rowId);
      const existing = cells.get(`${ci},${ri}`);
      cells.set(`${ci},${ri}`, { hue: existing?.hue ?? null, occupied: true });
    }
    return { cells, plates };
  }, [grid]);

  const model = useRef(scene);
  model.current = scene;

  const draw = useCallback((camera: Camera) => {
    const el = canvas.current;
    const host = viewport.current;
    if (!el || !host) return;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: width, clientHeight: height } = host;
    // Rounded before comparing: canvas.width is an integer, so a fractional dpr would make
    // this compare unequal forever and reallocate the backing store every single frame.
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const { cells, plates } = model.current;
    paint(ctx, { camera, width, height, dpr, plates, cells, hover: hover.current });

    // The tile layer rides the same transform, written directly for the same reason the
    // canvas is: nothing here should pass through a render.
    if (layer.current) {
      layer.current.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`;
    }
  }, []);

  /**
   * A trackpad emits wheel events faster than the display refreshes, and painting on each
   * one does work nobody sees. One paint per frame, always the latest camera.
   */
  const queued = useRef(0);
  /**
   * The latest camera, not the one that happened to queue the frame. Capturing `next` in
   * the closure instead paints the *first* event of each batch and discards the rest, so
   * every frame is stale by a variable amount — which reads as stutter while producing no
   * slow frames at all, and is why batching the drawing changed nothing.
   */
  const latest = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const schedule = useCallback(
    (next: Camera) => {
      latest.current = next;
      if (queued.current) return;
      queued.current = requestAnimationFrame(() => {
        queued.current = 0;
        draw(latest.current);
      });
    },
    [draw],
  );

  const camera = useCamera(viewport, schedule);

  // Redraw on model change and on resize. Both are human-paced.
  useEffect(() => {
    draw(camera.current);
  }, [draw, camera, scene]);

  useEffect(() => {
    const onResize = () => schedule(camera.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [schedule, camera]);

  const onMove = (event: React.PointerEvent) => {
    const host = viewport.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const next = cellAt(camera.current, event.clientX - box.left, event.clientY - box.top);
    const prev = hover.current;
    if (prev === next) return;
    if (prev && next && prev[0] === next[0] && prev[1] === next[1]) return;
    hover.current = next;
    schedule(camera.current);
  };

  const onLeave = () => {
    hover.current = null;
    schedule(camera.current);
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
              <span className="mark" style={{ color: h.ink }}>
                <Mark kind={tile.kind} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
