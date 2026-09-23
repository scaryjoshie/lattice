import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCamera } from "./camera.ts";
import { type Camera, CELL, cellAt, worldX } from "./geometry.ts";
import { indexOfTrack, regionBounds, type TextStyle, type TileKind } from "./model.ts";
import { type Cell, type Focus, type Occupant, paint, type Plate, type TextRun } from "./paint.ts";
import { fontOf, METRICS, spanFor } from "./measure.ts";
import { Menu } from "./Menu.tsx";
import { useGrid } from "./store.ts";
import { onTheme } from "./theme.ts";

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
  const addAt = useGrid((s) => s.addAt);
  const setText = useGrid((s) => s.setText);
  const removeTile = useGrid((s) => s.remove);

  /** Open at the pointer, holding the cell it was asked about. */
  const [menu, setMenu] = useState<{ x: number; y: number; ci: number; ri: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  /** Where a press started, so a drag that pans is not also read as a click. */
  const pressed = useRef<{ x: number; y: number } | null>(null);

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
      const w = tile.span ?? 1;
      const h = tile.rows ?? 1;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const existing = cells.get(`${ci + dx},${ri + dy}`);
          cells.set(`${ci + dx},${ri + dy}`, {
            hue: existing?.hue ?? null,
            occupied: true,
            // Selecting a run selects all of it, not the one cell under the pointer.
            extent: { ci, ri, span: w, rows: h },
          });
        }
      }
    }
    const occupied: Occupant[] = [];
    const texts: TextRun[] = [];
    for (const tile of grid.tiles) {
      const ci = indexOfTrack(grid.columns, tile.columnId);
      const ri = indexOfTrack(grid.rows, tile.rowId);
      const h = cells.get(`${ci},${ri}`)?.hue ?? null;
      if (tile.kind === "text") {
        if (tile.id !== editing) {
          texts.push({
            ci,
            ri,
            span: tile.span ?? 1,
            rows: tile.rows ?? 1,
            style: tile.style ?? "title",
            text: tile.text ?? "",
            hue: h,
          });
        }
      }
      else occupied.push({ ci, ri, kind: tile.kind, hue: h });
    }
    const spots = new Map<string, { ci: number; ri: number; hue: number | null }>();
    for (const tile of grid.tiles) {
      if (tile.kind === "text") continue;
      const ci = indexOfTrack(grid.columns, tile.columnId);
      const ri = indexOfTrack(grid.rows, tile.rowId);
      spots.set(tile.id, { ci, ri, hue: cells.get(`${ci},${ri}`)?.hue ?? null });
    }
    /** Agent tile id by cell, so hovering a cell can find what is talking to what. */
    const byCell = new Map<string, string>();
    for (const [id, spot] of spots) byCell.set(`${spot.ci},${spot.ri}`, id);
    return { cells, plates, occupied, texts, spots, byCell, links: grid.links };
  }, [grid, editing]);

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
    // Opaque: nothing behind the canvas shows through, so the page fill is a copy
    // rather than a blend and the compositor skips one step.
    const ctx = el.getContext("2d", { alpha: false });
    if (!ctx) return;

    const { cells, plates, occupied, texts, spots, byCell, links } = model.current;

    // Focus is derived from what the pointer is on, not stored. Hovering an agent is the
    // question "who is this one talking to", and the answer is a read of the model.
    let focus: Focus | null = null;
    const spot = hover.current && byCell.get(`${hover.current[0]},${hover.current[1]}`);
    if (spot) {
      const here = spots.get(spot);
      if (here) {
        const partners = links
          .filter((l) => l.from === spot || l.to === spot)
          .map((l) => spots.get(l.from === spot ? l.to : l.from))
          .filter((s): s is NonNullable<typeof s> => Boolean(s));
        // Every agent focuses, talking or not. Dimming that depended on whether an agent
        // happened to have links would make the canvas respond unevenly to the same act.
        focus = { ...here, partners };
      }
    }

    paint(
      ctx,
      { camera, width, height, dpr, plates, cells, occupied, texts, focus, hover: hover.current },
      dash.current,
    );
    running.current = focus !== null;

    // The tile layer rides the same transform, written directly for the same reason the
    // canvas is: nothing here should pass through a render.
    if (layer.current) {
      layer.current.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.k})`;
    }
  }, []);

  /**
   * A trackpad emits wheel events faster than the display refreshes, and painting on each
   * one does work nobody sees. One paint per frame, always the latest camera.
   */
  const queued = useRef(0);
  /** Advances only while something is focused, so an idle canvas paints nothing. */
  const dash = useRef(0);
  const running = useRef(false);
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

  // The dashes crawl, which is what makes a live connection look live. The loop exists
  // only while a focus does; with nothing focused the canvas is still and costs nothing.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (running.current) {
        dash.current += 0.6;
        draw(latest.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  // Redraw on model change and on resize. Both are human-paced.
  useEffect(() => {
    draw(camera.current);
  }, [draw, camera, scene]);

  useEffect(() => onTheme(() => schedule(camera.current)), [schedule, camera]);

  useEffect(() => {
    const onResize = () => schedule(camera.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [schedule, camera]);

  const onMove = (event: React.PointerEvent) => {
    const host = viewport.current;
    if (!host || menu || editing) return;
    const box = host.getBoundingClientRect();
    const next = cellAt(camera.current, event.clientX - box.left, event.clientY - box.top);
    const prev = hover.current;
    if (prev === next) return;
    if (prev && next && prev[0] === next[0] && prev[1] === next[1]) return;
    hover.current = next;
    schedule(camera.current);
  };

  const onDown = (event: React.PointerEvent) => {
    pressed.current = { x: event.clientX, y: event.clientY };
  };

  const onUp = (event: React.PointerEvent) => {
    const start = pressed.current;
    pressed.current = null;
    const host = viewport.current;
    if (editing) return;
    if (menu) {
      setMenu(null);
      // Pick the hover back up where the pointer already is, rather than waiting for it
      // to move before the grid responds again.
      if (host) {
        const box = host.getBoundingClientRect();
        hover.current = cellAt(camera.current, event.clientX - box.left, event.clientY - box.top);
        schedule(camera.current);
      }
      return;
    }
    // A press that moved was a pan, not a click on a cell.
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3) return;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const [ci, ri] = cellAt(camera.current, event.clientX - box.left, event.clientY - box.top);
    if (model.current.cells.get(`${ci},${ri}`)?.occupied) return;
    hover.current = null;
    setMenu({ x: event.clientX, y: event.clientY, ci, ri });
  };

  const pick = (kind: TileKind, style?: TextStyle) => {
    if (!menu) return;
    const id = addAt(menu.ci, menu.ri, kind, style);
    setMenu(null);
    if (id && kind === "text") setEditing(id);
  };

  const onLeave = () => {
    hover.current = null;
    schedule(camera.current);
  };

  return (
    <div
      className="viewport"
      ref={viewport}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onPointerDown={onDown}
      onPointerUp={onUp}
    >
      <canvas className="lattice" ref={canvas} />
      <div className="tiles" ref={layer}>
        {editing !== null &&
          (() => {
            const tile = grid.tiles.find((x) => x.id === editing);
            if (!tile) return null;
            const ci = indexOfTrack(grid.columns, tile.columnId);
            const ri = indexOfTrack(grid.rows, tile.rowId);
            const style = tile.style ?? "title";
            const m = METRICS[style];
            const commit = (value: string) => {
              setEditing(null);
              if (value.trim() === "") removeTile(tile.id);
              else setText(tile.id, value, spanFor(style, value));
            };
            return (
              <input
                className="editor"
                autoFocus
                defaultValue={tile.text ?? ""}
                style={{
                  left: worldX(ci),
                  top: worldX(ri),
                  height: CELL,
                  width: CELL * Math.max(tile.span ?? 1, 6),
                  paddingLeft: CELL * m.inset,
                  font: fontOf(style, CELL),
                }}
                onBlur={(e) => commit(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setEditing(null);
                    if ((tile.text ?? "") === "") removeTile(tile.id);
                  }
                }}
              />
            );
          })()}
      </div>
      {menu && <Menu x={menu.x} y={menu.y} onPick={pick} onClose={() => setMenu(null)} />}
    </div>
  );
}
