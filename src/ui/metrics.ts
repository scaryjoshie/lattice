import { COLS, ROWS } from "../protocol.ts";

/**
 * A closed pane holds no terminal, so its size is a design choice rather than a
 * consequence of font metrics. The terminal exists only expanded, where the font is
 * sized to the viewport and the PTY's columns and rows never change.
 */

export const PANE_W = 440;
export const PANE_H = 280;

export const FONT_FAMILY = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
/** xterm's lineHeight is a canvas/DOM-renderer option, and 1 is the only safe value. */
export const LINE_HEIGHT = 1;

const MIN_FONT = 12;
const MAX_FONT = 22;
/** Geist Mono advance width as a fraction of the em. */
const ADVANCE = 0.6;

/** The largest font size at which COLS x ROWS still fits the expanded pane. */
export function fontSizeFor(width: number, height: number): number {
  const byWidth = width / (COLS * ADVANCE);
  const byHeight = height / (ROWS * LINE_HEIGHT);
  return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.floor(Math.min(byWidth, byHeight))));
}
