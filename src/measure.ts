import { CELL } from "./geometry.ts";

/**
 * How many cells a word needs. Measured at the cell's own size so the answer does not
 * depend on the zoom it happened to be typed at, and shared with the paint so the two
 * cannot disagree about how wide a run is.
 */

export const TEXT = 0.3;
export const TEXT_INSET = 0.26;
export const FONT = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

let ctx: CanvasRenderingContext2D | null = null;

export function spanFor(text: string): number {
  if (!ctx) {
    const canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    if (!ctx) return 1;
  }
  ctx.font = `${Math.round(CELL * TEXT)}px ${FONT}`;
  const width = CELL * TEXT_INSET * 2 + ctx.measureText(text).width;
  return Math.max(1, Math.ceil(width / CELL));
}
