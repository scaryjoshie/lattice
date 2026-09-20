import type { Transition } from "motion/react";

/**
 * A pane does not move the camera. It lifts off the canvas and grows into the screen
 * from wherever it happens to be, and settles back into the same place.
 *
 * The whole feel is these two curves, so they live alone rather than being scattered
 * through the components.
 */

export const OPEN: Transition = {
  type: "spring",
  stiffness: 340,
  damping: 34,
  mass: 0.9,
};

export const CLOSE: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 42,
  mass: 0.8,
};

/** The terminal appears once the chrome has arrived, never during the flight. */
export const REVEAL: Transition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] };

/** Margin between an expanded pane and the edge of the window. */
export const INSET = 28;

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function expandedRect(): Rect {
  return {
    top: INSET,
    left: INSET,
    width: window.innerWidth - INSET * 2,
    height: window.innerHeight - INSET * 2,
  };
}
