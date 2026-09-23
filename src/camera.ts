import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { type RefObject, useEffect, useRef } from "react";
import { claimed } from "./pointer.ts";
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
  /** Input the grid wants for itself: any while an overlay is open, and a press that
   *  starts inside a selection. */
  yields: (event: MouseEvent) => boolean,
): { camera: RefObject<Camera>; shift: (dx: number, dy: number) => void } {
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1 });
  /** Move the view by a world distance, so that when the world's origin moves the picture
   *  does not. Set once the behaviour exists. */
  const shift = useRef<(dx: number, dy: number) => void>(() => {});
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
    return () => {
      sel.on(".zoom", null);
    };
  }, [ref]);

  return { camera, shift: (dx, dy) => shift.current(dx, dy) };
}
