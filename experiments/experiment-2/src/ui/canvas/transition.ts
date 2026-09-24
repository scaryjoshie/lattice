import type { Transition } from "motion/react";

/**
 * A pane does not move the camera and does not change size. It is drawn at the screen's
 * size all along; opening one animates the scale it is drawn at, from a thumbnail on the
 * canvas up to 1. Everything scales together, chrome included, because that is what
 * moving closer to something looks like.
 */

export const OPEN: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 36,
  mass: 0.9,
};

export const CLOSE: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 44,
  mass: 0.8,
};

export const FADE: Transition = { duration: 0.16, ease: [0.22, 1, 0.36, 1] };

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
