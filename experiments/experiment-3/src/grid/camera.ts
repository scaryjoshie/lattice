import { pointer, select } from "d3-selection";
import {
  zoom as d3zoom,
  zoomIdentity,
  zoomTransform,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

/**
 * The camera is `d3-zoom` and nothing else. Input normalisation is the hard part of pan and
 * zoom — a trackpad pinch arrives as a wheel event with `ctrlKey` set, and delta magnitudes
 * vary by browser, OS and hardware — and d3 has already absorbed a decade of that.
 *
 * The one thing d3's defaults get wrong for a trackpad is that a plain wheel means zoom. On
 * a Mac a two-finger swipe *is* a plain wheel, so wheel is rebound: ctrl means pinch, and
 * everything else pans. Both still go through the behaviour, so the transform stays d3's.
 *
 * `nudge` exists for one case: inserting a track before every other one makes the grid grow
 * from its top-left, so the whole plane would appear to lurch. Moving the camera by the same
 * amount cancels it, and the insertion reads as a track appearing rather than as everything
 * else moving.
 */

const MIN_K = 0.2;
const MAX_K = 2.5;

/** d3's own wheel curve for a pinch, which is where its feel comes from. */
const pinchFactor = (event: WheelEvent) =>
  2 ** (-event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002) * 10);

export interface Camera {
  transform: ZoomTransform;
  /** Move the camera by plane pixels, leaving the zoom alone. */
  nudge(dx: number, dy: number): void;
}

export function useCamera(
  ref: RefObject<HTMLDivElement | null>,
  fit: { width: number; height: number },
): Camera {
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const behaviour = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sel = select(el);
    const zoomer = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([MIN_K, MAX_K])
      // Tiles and gutters run their own drag. One pointer, one interpretation.
      .filter((event: Event) => {
        const target = event.target as Element | null;
        return !target?.closest(".tile, .gutter");
      })
      .on("zoom", (event: { transform: ZoomTransform }) => setTransform(event.transform));

    behaviour.current = zoomer;
    sel.call(zoomer);
    sel.on("dblclick.zoom", null);
    sel.on(
      "wheel.zoom",
      (event: WheelEvent) => {
        event.preventDefault();
        if (event.ctrlKey) {
          zoomer.scaleBy(sel, pinchFactor(event), pointer(event, el));
          return;
        }
        // translateBy is applied before the scale, so screen pixels divide by k.
        const k = zoomTransform(el).k;
        zoomer.translateBy(sel, -event.deltaX / k, -event.deltaY / k);
      },
      { passive: false },
    );

    const rect = el.getBoundingClientRect();
    const start = zoomIdentity.translate(
      Math.round((rect.width - fitRef.current.width) / 2),
      Math.round((rect.height - fitRef.current.height) / 2),
    );
    sel.call(zoomer.transform, start);

    return () => {
      sel.on(".zoom", null);
      behaviour.current = null;
    };
  }, [ref]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const el = ref.current;
      const zoomer = behaviour.current;
      // translateBy is pre-scale, which is plane space — the units the caller has.
      if (el && zoomer) zoomer.translateBy(select(el), dx, dy);
    },
    [ref],
  );

  return { transform, nudge };
}
