import { CELL } from "./geometry.ts";
import type { TextStyle } from "./model.ts";

/**
 * Type metrics, shared between the paint and the editor so the two cannot disagree about
 * how much room a run needs. Everything is a fraction of the cell, and everything is
 * measured at the cell's own size, so an answer does not depend on the zoom it was asked
 * at.
 */

export const FONT = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export interface Metrics {
  /** Cap height as a fraction of the cell. */
  size: number;
  /** Line spacing as a fraction of the cell. A title's is a whole cell, so one line sits
   *  in the middle of one cell and the same formula centres it. */
  leading: number;
  /** Space before the text, across the run. */
  inset: number;
  /** Space above the first line. Zero for a title, which is centred by its leading. */
  pad: number;
  weight: number;
}

/** A tile's name, under its mark. Smaller than a note, and never wrapped. */
export const NAME = { size: 0.155, weight: 400 };

export const nameFont = (cell: number): string => `${NAME.weight} ${cell * NAME.size}px ${FONT}`;

/** Cut to fit, with an ellipsis, since a name has exactly one cell to live in. */
export function clip(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * The only thing that differs between a title and a note is how big it is. Nothing
 * branches on which one a run is; both are drawn by the same code with these numbers.
 */
export const METRICS: Record<TextStyle, Metrics> = {
  title: { size: 0.32, leading: 1, inset: 0.26, pad: 0, weight: 500 },
  note: { size: 0.19, leading: 0.34, inset: 0.2, pad: 0.16, weight: 400 },
};

/**
 * Not rounded. A rounded size snaps between integers as the camera scales, so the glyphs
 * change width in steps while the cell they sit in grows smoothly — which is the jiggle.
 */
export const fontOf = (style: TextStyle, cell: number): string => {
  const m = METRICS[style];
  return `${m.weight} ${cell * m.size}px ${FONT}`;
};

let ctx: CanvasRenderingContext2D | null = null;

function measurer(): CanvasRenderingContext2D | null {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  return ctx;
}

/** How many columns a title needs to sit on one line. */
export function spanFor(style: TextStyle, text: string): number {
  const c = measurer();
  if (!c) return 1;
  c.font = fontOf(style, CELL);
  const width = CELL * METRICS[style].inset * 2 + c.measureText(text).width;
  return Math.max(1, Math.ceil(width / CELL));
}

/** Break a note into lines that fit the width it has been given. */
export function wrap(
  measure: CanvasRenderingContext2D,
  text: string,
  width: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
