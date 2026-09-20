import { COLS, ROWS } from "../protocol.ts";

/**
 * A pane is exactly one terminal: fixed columns and rows, never reflowed. So the pane's
 * size in canvas units is derived from the font, measured once, rather than guessed at
 * and then fought with.
 */

export const FONT_SIZE = 14;
export const LINE_HEIGHT = 1.35;
export const FONT_FAMILY = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export const HEADER_H = 40;
export const PAD = 14;

function measureCell(): { w: number; h: number } {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${FONT_FAMILY};font-size:${FONT_SIZE}px;line-height:${LINE_HEIGHT}`;
  probe.textContent = "0".repeat(100);
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return { w: rect.width / 100, h: rect.height };
}

const cell = measureCell();

export const CELL = cell;
export const TERM_W = Math.ceil(cell.w * COLS);
export const TERM_H = Math.ceil(cell.h * ROWS);
export const PANE_W = TERM_W + PAD * 2;
export const PANE_H = TERM_H + PAD * 2 + HEADER_H;
