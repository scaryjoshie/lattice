import type { TextStyle } from "../model/grid.ts";
import { METRICS, NAME } from "../model/text.ts";

/**
 * Fonts. The geometry of text is the model's (model/text.ts); this is only how it is
 * asked of the canvas. Sizes are not rounded: a rounded size snaps between integers as
 * the camera scales, so the glyphs change width in steps while the cell they sit in grows
 * smoothly — which is the jiggle.
 */
export const FONT = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export const fontOf = (style: TextStyle, cell: number): string => {
  const m = METRICS[style];
  return `${m.weight} ${cell * m.size}px ${FONT}`;
};

export const nameFont = (cell: number): string => `${NAME.weight} ${cell * NAME.size}px ${FONT}`;
