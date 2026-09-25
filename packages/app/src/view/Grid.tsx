import { useCallback, useEffect, useRef } from "react";
import { footprint } from "@lattice/model";
import { paint } from "../paint/paint.ts";
import { onTheme } from "../paint/theme.ts";
import { type Camera, CELL, cellAt, worldX } from "../scene/geometry.ts";
import { animating, modeOf, type Scene, sceneOf } from "../scene/scene.ts";
import { type Effect, type Input, react } from "../session/react.ts";
import type { Selection } from "../session/session.ts";
import type { Target } from "../session/target.ts";
import { usePreferences } from "../store/preferences.ts";
import { useRuntime } from "../store/runtime.ts";
import { useSession } from "../store/session.ts";
import { useGrid } from "../store/store.ts";
import { useCamera } from "./camera.ts";
import { Editor } from "./Editor.tsx";
import { Keys } from "./Keys.tsx";
import { Menu, TileMenu } from "./Menu.tsx";
import { Namer } from "./Namer.tsx";
import { Opened, type Rect } from "./Opened.tsx";
import { claimed } from "./pointer.ts";
import { Toolbar } from "./Toolbar.tsx";

/**
 * The view. Two layers over one camera: the canvas paints every cell, and a transparent
 * tile layer sits on top for the things that have to be real elements, the editor now and
 * a terminal later. Both ride one transform.
 *
 * It does two jobs. It translates DOM events into inputs in grid terms and hands them to
 * `react`, which decides what they mean; and it draws, by painting the scene the grid and
 * the session project to. It decides nothing itself. Pointer-speed state lives in the
 * session store outside React; React renders only the overlays.
 */

/** How far an opened tile stops short of the viewport's edge, in screen pixels. */
const OPEN_INSET = 24;
/** How near a gridline the pointer must be to take hold of it, and how near a crossing to
 *  hold both of its lines, in screen pixels. */
const LINE_HIT = 9;
const INNER_HIT = 5;
const CROSS_HIT = 4;
/** The scope handle's hit area, in screen pixels. Drawn smaller; a target should be generous. */
const HANDLE_HIT = 24;
/** A press that travels further than this is a drag, never a click. */
const CLICK = 3;

export function Grid({ onSettings }: { onSettings(): void }) {
  const viewport = useRef<HTMLDivElement>(null);
  /** The toolbar's zoom, written by the camera as it moves. */
  const zoom = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  /** Where the pointer last was, in client pixels: for the grip, and to re-point after a menu. */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /** Where the press started, so a drag is not also read as a click. */
  const pressed = useRef<{ x: number; y: number } | null>(null);
  /** The scene as last painted, for hit tests between paints. */
  const last = useRef<Scene | null>(null);

  // React draws the overlays from these and nothing else. Pointing and gestures change at
  // pointer speed and never pass through a render.
  const grid = useGrid((s) => s.grid);
  const connected = useGrid((s) => s.connected);
  const showKeys = usePreferences((s) => s.preferences.keys);
  const overlay = useSession((s) => s.session.overlay);
  const opened = useSession((s) => s.session.opened);
  const mode = useSession((s) => modeOf(grid, s.session));

  /* Drawing ---------------------------------------------------------------- */

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
    // Opaque: nothing behind the canvas shows through, so the page fill is a copy.
    const ctx = el.getContext("2d", { alpha: false });
    if (!ctx) return;
    const box = host.getBoundingClientRect();
    const cursor = pointer.current ? { x: pointer.current.x - box.left, y: pointer.current.y - box.top } : null;
    const scene = sceneOf(useGrid.getState().grid, useRuntime.getState().facts, useSession.getState().session, { camera, width, height, dpr, cursor });
    last.current = scene;
    paint(ctx, scene, dash.current);
    running.current = animating(scene);
    // The tile layer rides the same transform, written directly for the same reason the
    // canvas is: nothing here should pass through a render. The cursor likewise.
    if (layer.current) {
      layer.current.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.k})`;
    }
    if (host.style.cursor !== scene.cursor) host.style.cursor = scene.cursor;
  }, []);

  /**
   * Every paint goes through here, and there is one frame at a time. A trackpad emits
   * wheel events faster than the display refreshes, and painting on each one does work
   * nobody sees; a scene change and a camera move in one frame are one paint, not two.
   * While something animates, the frame asks for the next one itself, and stops asking the
   * moment nothing does — so an idle canvas paints nothing.
   */
  const queued = useRef(0);
  /** The shared crawl. Advances once per animated frame. */
  const dash = useRef(0);
  const running = useRef(false);
  /** The latest camera, not the one that happened to queue the frame. */
  const latest = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const schedule = useCallback(
    (next: Camera) => {
      latest.current = next;
      if (zoom.current) zoom.current.textContent = `${Math.round(next.k * 100)}%`;
      if (queued.current) return;
      const frame = () => {
        queued.current = 0;
        draw(latest.current);
        if (!running.current) return;
        dash.current += 0.6;
        queued.current = requestAnimationFrame(frame);
      };
      queued.current = requestAnimationFrame(frame);
    },
    [draw],
  );
  // On unmount, drop the pending frame and say so, or a remount would think one was
  // still queued and never paint again. StrictMode mounts twice in development.
  useEffect(
    () => () => {
      cancelAnimationFrame(queued.current);
      queued.current = 0;
    },
    [],
  );

  // While an overlay or an opened tile is up the camera is still, and a press the grid
  // holds is not a pan. Every gesture is a held press.
  const { camera, shift: shiftView, glide } = useCamera(viewport, schedule, () => {
    const s = useSession.getState().session;
    return s.overlay !== null || s.opened !== null || s.gesture !== null;
  });

  // Anything that changes the grid or the session wants a paint, on the same frame as
  // anything else that does.
  useEffect(() => {
    const stop = [useGrid, useSession, useRuntime].map((store) => store.subscribe(() => schedule(camera.current)));
    schedule(camera.current);
    return () => stop.forEach((f) => f());
  }, [schedule, camera]);
  useEffect(() => onTheme(() => schedule(camera.current)), [schedule, camera]);
  useEffect(() => {
    const onResize = () => schedule(camera.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [schedule, camera]);

  /* Hit tests: a screen point to the one thing under it ----------------------- */

  /** The gridlines of the selected scope or run under a screen point: a column line, a row
   *  line, or both at a corner. Edges count; the boundary is a line like any other. */
  const linesUnder = (px: number, py: number): Target | null => {
    const owner = last.current?.resizable;
    if (!owner) return null;
    const { region: o, edgesOnly } = owner;
    const { x, y, k } = camera.current;
    const x0 = worldX(o.ci) * k + x;
    const x1 = worldX(o.ci + o.span) * k + x;
    const y0 = worldX(o.ri) * k + y;
    const y1 = worldX(o.ri + o.rows) * k + y;
    if (px < x0 - LINE_HIT || px > x1 + LINE_HIT || py < y0 - LINE_HIT || py > y1 + LINE_HIT) return null;
    let c: number | null = null;
    let r: number | null = null;
    let dc = Infinity;
    let dr = Infinity;
    // A run offers its edges only; a scope every line. An edge is easy to catch; an
    // interior line takes more precision, or moving about inside a scope would light
    // lines everywhere and the cell under the pointer would never get its say.
    const step = (len: number) => (edgesOnly ? len : 1);
    const reachC = (ci: number) => (ci === o.ci || ci === o.ci + o.span ? LINE_HIT : INNER_HIT);
    const reachR = (ri: number) => (ri === o.ri || ri === o.ri + o.rows ? LINE_HIT : INNER_HIT);
    for (let ci = o.ci; ci <= o.ci + o.span; ci += step(o.span)) {
      const d = Math.abs(px - (worldX(ci) * k + x));
      if (d <= reachC(ci) && d < dc) [c, dc] = [ci, d];
    }
    for (let ri = o.ri; ri <= o.ri + o.rows; ri += step(o.rows)) {
      const d = Math.abs(py - (worldX(ri) * k + y));
      if (d <= reachR(ri) && d < dr) [r, dr] = [ri, d];
    }
    if (c === null && r === null) return null;
    // Two lines at once at a corner, which is what a corner is for, and at an interior
    // crossing only when the pointer is close to the crossing point itself — otherwise the
    // nearer line alone, or a horizontal drag would drift a row along with it.
    const corner = (c === o.ci || c === o.ci + o.span) && (r === o.ri || r === o.ri + o.rows);
    if (c !== null && r !== null && !corner && (dc > CROSS_HIT || dr > CROSS_HIT)) {
      if (dc <= dr) r = null;
      else c = null;
    }
    return { kind: "line", owner: owner.id, c, r };
  };

  /** The scope whose corner handle is under a screen point, if any. */
  const handleUnder = (px: number, py: number): string | null => {
    const scene = last.current;
    if (!scene) return null;
    const { x, y, k } = camera.current;
    const half = HANDLE_HIT / 2;
    for (const plate of scene.plates) {
      if (plate.id === scene.selectedScope) continue;
      const hx = worldX(plate.c0) * k + x;
      const hy = worldX(plate.r0) * k + y;
      if (Math.abs(px - hx) <= half && Math.abs(py - hy) <= half) return plate.id;
    }
    return null;
  };

  /**
   * The one thing under a screen point: the most specific of a handle, a gridline of the
   * selected scope or run, and the cell, tried in that order because each is inside the
   * next. With no gutter every point is in some cell, so there is always an answer.
   */
  const targetAt = (px: number, py: number): Target => {
    const scope = handleUnder(px, py);
    if (scope) return { kind: "handle", scope };
    const line = linesUnder(px, py);
    if (line) return line;
    const [ci, ri] = cellAt(camera.current, px, py);
    return { kind: "cell", ci, ri };
  };

  /* Inputs and effects ----------------------------------------------------- */

  /** Do what `react` decided, in order. Document commands go to the daemon and are awaited,
   *  so what follows one sees the grid it produced; session commands apply at once; the
   *  view follows a run that prepended tracks by shifting the camera and the session's
   *  indices. */
  const dispatch = async (effects: Effect[]) => {
    for (const effect of effects) {
      switch (effect.kind) {
        case "select":
        case "point":
        case "shiftKey":
        case "gesture":
        case "overlay":
        case "open":
        case "shift":
          useSession.getState().apply(effect);
          break;
        case "start":
        case "stop":
          useRuntime.getState().observe(effect);
          break;
        case "undo":
        case "redo": {
          // Each history entry carries the selection it was made with, as a mark the
          // document store never reads. Undo restores it along with the grid.
          const selection = useSession.getState().session.selection;
          const back = await useGrid.getState()[effect.kind](selection);
          if (back.ok) useSession.getState().apply({ kind: "select", selection: (back.mark as Selection | null | undefined) ?? null });
          break;
        }
        default: {
          const done = await useGrid.getState().run(effect, useSession.getState().session.selection);
          if (done.ok && (done.dc || done.dr)) {
            shiftView(-done.dc * CELL, -done.dr * CELL);
            useSession.getState().apply({ kind: "shift", dc: done.dc, dr: done.dr });
            useSession.getState().apply({ kind: "point", target: null });
          }
        }
      }
    }
  };

  /** Point at whatever is under a client position now. */
  const repoint = (clientX: number, clientY: number) => {
    const host = viewport.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    useSession.getState().apply({ kind: "point", target: targetAt(clientX - box.left, clientY - box.top) });
  };

  const send = (input: Input) => {
    const before = useSession.getState().session;
    void dispatch(react(useGrid.getState().grid, before, input)).then(() => {
      // Whatever closed an overlay, the pointer is still somewhere, and that is pointed at
      // again at once rather than when it next moves.
      const after = useSession.getState().session;
      if (before.overlay && !after.overlay && !after.gesture && pointer.current) repoint(pointer.current.x, pointer.current.y);
    });
  };

  /** A pointer event in grid terms: the target, the cell, and the point in cell units. */
  const place = (event: { clientX: number; clientY: number }) => {
    const host = viewport.current;
    if (!host) return null;
    const box = host.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    const { x, y, k } = camera.current;
    return {
      target: targetAt(px, py),
      cell: cellAt(camera.current, px, py),
      world: { x: (px - x) / k / CELL, y: (py - y) / k / CELL },
      client: { x: event.clientX, y: event.clientY },
    };
  };

  // Keys arrive at the window. Shift is tracked so the plus and the extension preview
  // follow it; losing the window drops it, since the keyup goes elsewhere. Cmd is the
  // application layer. A text field keeps its own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      send({ type: "key", key: "Shift", down: e.shiftKey });
      if (e.type !== "keydown" || claimed(e.target)) return;
      if (e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        send({ type: "key", key: e.shiftKey ? "Redo" : "Undo", down: true });
      } else if (e.key === "Escape") {
        // The grid's: say so, or the window takes it as cancel and, in fullscreen, leaves.
        e.preventDefault();
        send({ type: "key", key: "Escape", down: true });
      }
    };
    const onBlur = () => send({ type: "key", key: "Shift", down: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  });

  const onMove = (event: React.PointerEvent) => {
    pointer.current = { x: event.clientX, y: event.clientY };
    if (claimed(event.target)) return;
    const at = place(event);
    if (at) send({ type: "move", target: at.target, cell: at.cell, world: at.world });
  };

  const onDown = (event: React.PointerEvent) => {
    if (claimed(event.target)) return;
    pressed.current = { x: event.clientX, y: event.clientY };
    const at = place(event);
    if (!at) return;
    send({ type: "press", target: at.target, cell: at.cell, shift: event.shiftKey, button: event.button });
    // A press the grid holds keeps the pointer until release, wherever it goes.
    const g = useSession.getState().session.gesture;
    if (g && g.kind !== "dismiss" && g.kind !== "hold") (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onUp = (event: React.PointerEvent) => {
    if (claimed(event.target)) return;
    const start = pressed.current;
    pressed.current = null;
    const travelled = !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK;
    const at = place(event);
    if (at) send({ type: "release", target: at.target, cell: at.cell, travelled, shift: event.shiftKey, button: event.button, client: at.client });
  };

  const onContextMenu = (event: React.MouseEvent) => {
    if (claimed(event.target)) return;
    event.preventDefault();
    const at = place(event);
    if (at) send({ type: "context", cell: at.cell, client: at.client });
  };

  /* Overlays --------------------------------------------------------------- */

  const openedTile = opened ? grid.tiles.find((x) => x.id === opened.id) : undefined;
  const rects = ((): { from: Rect; to: Rect } | null => {
    const host = viewport.current;
    if (!openedTile || !host) return null;
    const f = footprint(grid, openedTile);
    const { x, y, k } = camera.current;
    const size = CELL * k;
    return {
      from: { x: worldX(f.ci) * k + x, y: worldX(f.ri) * k + y, w: size * f.span, h: size * f.rows },
      to: { x: OPEN_INSET, y: OPEN_INSET, w: host.clientWidth - OPEN_INSET * 2, h: host.clientHeight - OPEN_INSET * 2 },
    };
  })();

  return (
    <div
      className="viewport"
      ref={viewport}
      onPointerMove={onMove}
      onPointerLeave={() => send({ type: "leave" })}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onContextMenu={onContextMenu}
    >
      <canvas className="lattice" ref={canvas} />
      <div className="tiles" ref={layer}>
        {overlay?.kind === "edit" && (
          <Editor id={overlay.id} onDone={() => send({ type: "done" })} onDraft={(text, caret, scroll) => send({ type: "draft", text, caret, scroll })} />
        )}
        {overlay?.kind === "name" && <Namer id={overlay.id} onDone={() => send({ type: "done" })} />}
      </div>
      {opened && openedTile && rects && (
        <Opened
          name={openedTile.family === "text" ? undefined : openedTile.name}
          from={rects.from}
          to={rects.to}
          onLeave={() => send({ type: "leaving" })}
          onClose={() => send({ type: "closed" })}
        />
      )}
      <Keys mode={mode} hidden={!showKeys || (opened !== null && !opened.leaving)} offline={!connected} />
      <Toolbar
        zoom={zoom}
        hidden={opened !== null && !opened.leaving}
        onUndo={() => send({ type: "key", key: "Undo", down: true })}
        onRedo={() => send({ type: "key", key: "Redo", down: true })}
        onHome={() => {
          // The middle of the grid, at the size it is drawn.
          const host = viewport.current;
          if (!host) return;
          const { grid } = useGrid.getState();
          glide({ x: host.clientWidth / 2 - worldX(grid.columns.length) / 2, y: host.clientHeight / 2 - worldX(grid.rows.length) / 2, k: 1 });
        }}
        onActualSize={() => {
          // Where the view is, at the size it is drawn: about the middle of the window.
          const host = viewport.current;
          if (!host) return;
          const { x, y, k } = camera.current;
          const cx = host.clientWidth / 2;
          const cy = host.clientHeight / 2;
          glide({ x: cx - (cx - x) / k, y: cy - (cy - y) / k, k: 1 });
        }}
        onSettings={onSettings}
      />
      {overlay?.kind === "add" && (
        <Menu
          x={overlay.at.x}
          y={overlay.at.y}
          onPick={(choice) => send({ type: "choose", choice })}
          onClose={() => send({ type: "dismiss" })}
        />
      )}
      {overlay?.kind === "tile" && (
        <TileMenu
          x={overlay.at.x}
          y={overlay.at.y}
          isText={grid.tiles.find((x) => x.id === overlay.id)?.family === "text"}
          onClose={() => send({ type: "dismiss" })}
          onPick={(action) => send({ type: "act", action })}
        />
      )}
    </div>
  );
}
