/**
 * A closed pane holds no terminal, so its size is a design choice rather than a
 * consequence of font metrics.
 */

export const PANE_W = 440;
export const PANE_H = 280;

export const FONT_FAMILY = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
export const FONT_SIZE = 15;
/** Honoured by the DOM and canvas renderers only, so 1 is the only safe value. */
export const LINE_HEIGHT = 1;

/** Breathing room between the terminal grid and the expanded pane's border. */
export const TERM_PAD = 22;
