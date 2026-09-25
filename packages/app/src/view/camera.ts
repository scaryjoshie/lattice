import { interpolateZoom, type ZoomView } from "d3-interpolate";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { type RefObject, useEffect, useRef } from "react";
import { claimed } from "./pointer.ts";
import type { Camera } from "../scene/geometry.ts";

/**
 * The camera never touches React.
 *
 * d3-zoom writes into a mutable object and calls back; the callback paints. Routing it
 * through component state instead would reconcile the whole tree on every wheel event,
 * which is what makes a canvas feel heavy and makes anything animated fall behind.
 *
 * d3's defaults are kept: wheel zooms, drag pans. Input normalisation is the hard part of
 * a camera — a trackpad pinch arrives as a wheel event with `ctrlKey` set, and deltas vary
 * by browser, OS and hardware — and this is the library that has absorbed that.
 */

const MIN_K = 0.25;
const MAX_K = 3;
/** A glide takes as long as its distance asks, within these, in milliseconds. */
const GLIDE_MIN = 450;
const GLIDE_MAX = 1100;

export function useCamera(
  ref: RefObject<HTMLElement | null>,
  onChange: (camera: Camera) => void,
  /** Input the grid wants for itself: any while an overlay is open, and a press that
   *  starts inside a selection. */
  yields: (event: MouseEvent) => boolean,
): {
  camera: RefObject<Camera>;
  shift: (dx: number, dy: number) => void;
  /** Glide to a camera, the way a drag would move it. */
  glide: (to: Camera) => void;
} {
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1 });
  /** Move the view by a world distance, so that when the world's origin moves the picture
   *  does not. Set once the behaviour exists. */
  const shift = useRef<(dx: number, dy: number) => void>(() => {});
  const glide = useRef<(to: Camera) => void>(() => {});
  const handler = useRef(onChange);
  handler.current = onChange;
  const claim = useRef(yields);
  claim.current = yields;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const behaviour = d3zoom<HTMLElement, unknown>()
      .scaleExtent([MIN_K, MAX_K])
      // The camera only gets input nothing else has claimed: shift belongs to the grid,
      // overlays are in pointer.ts, and the grid says what else it is holding.
      .filter(
        (event: Event) =>
          !(event as MouseEvent).shiftKey && !claimed(event.target) && !claim.current(event as MouseEvent),
      )
      .on("zoom", (event: { transform: ZoomTransform }) => {
        camera.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        handler.current(camera.current);
      });
    const sel = select(el);
    sel.call(behaviour).on("dblclick.zoom", null);
    sel.call(behaviour.transform, zoomIdentity.translate(80, 80));
    shift.current = (dx, dy) => sel.call(behaviour.translateBy, dx, dy);
    /*
     * A glide follows van Wijk and Nuij's smooth zoom, as d3's own zoom transitions do: a
     * long trip pulls back, travels and settles in along one curve, taking as long as its
     * distance asks. Eased out, so it slows into where it lands. Through the behaviour,
     * frame by frame, so d3 keeps its own idea of the camera and a drag that starts halfway
     * continues from where the glide has got to.
     */
    let frame = 0;
    glide.current = (to) => {
      cancelAnimationFrame(frame);
      const w = el.clientWidth;
      const h = el.clientHeight;
      // A camera as what it shows: the world point at the middle of the window, and how
      // wide a stretch of world the window spans.
      const view = (c: Camera): ZoomView => [(w / 2 - c.x) / c.k, (h / 2 - c.y) / c.k, w / c.k];
      const path = interpolateZoom(view(camera.current), view({ ...to, k: Math.min(MAX_K, Math.max(MIN_K, to.k)) }));
      const ms = Math.min(GLIDE_MAX, Math.max(GLIDE_MIN, path.duration));
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        const [cx, cy, span] = path(1 - (1 - t) ** 4);
        const k = w / span;
        sel.call(behaviour.transform, zoomIdentity.translate(w / 2 - cx * k, h / 2 - cy * k).scale(k));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    return () => {
      cancelAnimationFrame(frame);
      sel.on(".zoom", null);
    };
  }, [ref]);

  return { camera, shift: (dx, dy) => shift.current(dx, dy), glide: (to) => glide.current(to) };
}
