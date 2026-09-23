import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { type RefObject, useEffect, useRef } from "react";
import type { Camera } from "./geometry.ts";

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

export function useCamera(
  ref: RefObject<HTMLElement | null>,
  onChange: (camera: Camera) => void,
): RefObject<Camera> {
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const behaviour = d3zoom<HTMLElement, unknown>()
      .scaleExtent([MIN_K, MAX_K])
      // Shift is the move gesture, so the camera does not also claim it.
      .filter((event: Event) => !(event as MouseEvent).shiftKey)
      .on("zoom", (event: { transform: ZoomTransform }) => {
        camera.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        handler.current(camera.current);
      });
    const sel = select(el);
    sel.call(behaviour).on("dblclick.zoom", null);
    sel.call(behaviour.transform, zoomIdentity.translate(80, 80));
    return () => {
      sel.on(".zoom", null);
    };
  }, [ref]);

  return camera;
}
