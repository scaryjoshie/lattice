import type { Viewport } from "@xyflow/react";
import { PANE_H, PANE_W } from "../metrics.ts";
import type { Point } from "../store.ts";

/**
 * How the camera moves. The whole feel of the thing is in these four numbers and two
 * curves, so they live together rather than being scattered through the components.
 */

/** Entering a pane lands at 1:1, which is the only zoom where the terminal is crisp. */
export const ENTERED_ZOOM = 1;
export const RESTING_ZOOM = 0.42;

export const ENTER_MS = 520;
export const EXIT_MS = 420;

/** Fast away from rest, long settle into the pane. Reads as being pulled in. */
export const easeEnter = (t: number): number => (t === 1 ? 1 : 1 - 2 ** (-11 * t));

/** Gentler both ends: leaving should feel like stepping back, not being thrown. */
export const easeExit = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function paneCenter(at: Point): Point {
  return { x: at.x + PANE_W / 2, y: at.y + PANE_H / 2 };
}

export function restingViewport(at: Point, width: number, height: number): Viewport {
  const c = paneCenter(at);
  return {
    x: width / 2 - c.x * RESTING_ZOOM,
    y: height / 2 - c.y * RESTING_ZOOM,
    zoom: RESTING_ZOOM,
  };
}
