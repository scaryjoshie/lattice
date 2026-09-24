import { useSyncExternalStore } from "react";

/**
 * There is one screen size in the application: the rectangle an open pane occupies.
 * Every terminal is built at that size, and a pane on the canvas is that same screen
 * drawn smaller. Opening one is therefore a scale and nothing else — no resize, no
 * reflow, no second layout.
 *
 * The cost is that a pane cannot have its own aspect ratio: it is a view of the screen,
 * so it has the screen's shape. On a different window shape the panes change shape too.
 * Fine while this is one person on one Mac; revisit if panes ever need a fixed card
 * shape, which would mean cropping the screen rather than scaling it.
 */

/** Margin between an open pane and the edge of the window. */
export const INSET = 28;
/** How wide a pane is drawn on the canvas at zoom 1. Its height follows the screen. */
export const PANE_W = 440;

export interface Screen {
  top: number;
  left: number;
  width: number;
  height: number;
  /** The canvas-space size of a closed pane: the screen, to scale. */
  paneW: number;
  paneH: number;
  /** What a pane on the canvas is scaled by, at canvas zoom 1. */
  scale: number;
}

function read(): Screen {
  const width = Math.max(320, window.innerWidth - INSET * 2);
  const height = Math.max(240, window.innerHeight - INSET * 2);
  const scale = PANE_W / width;
  return {
    top: INSET,
    left: INSET,
    width,
    height,
    paneW: PANE_W,
    paneH: Math.round(height * scale),
    scale,
  };
}

let current = read();

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    current = read();
    onChange();
  };
  window.addEventListener("resize", handler);
  return () => window.removeEventListener("resize", handler);
}

export function useScreen(): Screen {
  return useSyncExternalStore(subscribe, () => current);
}

export function screen(): Screen {
  return current;
}
