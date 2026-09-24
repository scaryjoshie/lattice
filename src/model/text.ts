import type { TextStyle } from "./grid.ts";

/**
 * Text geometry, by arithmetic. The face is monospace and every glyph advances 0.6 em at
 * every size and weight — measured, not assumed — so the width of a line is its length
 * times its size times 0.6, and no canvas is needed to know how much room a run wants.
 * That is what lets the model own a run's extent, and lets a daemon with no font judge
 * a run the same way the client draws it.
 *
 * Everything is a fraction of the cell, so an answer does not depend on the zoom.
 */
export const ADVANCE = 0.6;

export interface Metrics {
  /** Type size as a fraction of the cell. */
  readonly size: number;
  /** Line spacing as a fraction of the cell. A title's is a whole cell, so one line sits
   *  in the middle of one cell and the same formula centres it. */
  readonly leading: number;
  /** Space before the text, across the run. */
  readonly inset: number;
  /** Space above the first line. Zero for a title, which is centred by its leading. */
  readonly pad: number;
  readonly weight: number;
}

/**
 * The only thing that differs between a title and a note is how big it is. Nothing
 * branches on which one a run is; both are laid out and drawn by the same code with
 * these numbers.
 */
export const METRICS: Readonly<Record<TextStyle, Metrics>> = {
  title: { size: 0.32, leading: 1, inset: 0.26, pad: 0, weight: 500 },
  note: { size: 0.19, leading: 0.34, inset: 0.2, pad: 0.16, weight: 400 },
};

/** A host's name, under its mark. Smaller than a note, and never wrapped. */
export const NAME = { size: 0.155, weight: 400 } as const;

/** The width of `n` characters in cells. */
export const widthOf = (size: number, n: number): number => n * size * ADVANCE;

/** How many characters fit in a width, in cells. */
export const fits = (size: number, width: number): number => Math.max(0, Math.floor(width / (size * ADVANCE) + 1e-9));

/** How many columns a run needs to sit each paragraph on one line. */
export function spanFor(style: TextStyle, text: string): number {
  const m = METRICS[style];
  const widest = Math.max(...text.split("\n").map((line) => line.length));
  return Math.max(1, Math.ceil(m.inset * 2 + widthOf(m.size, widest) - 1e-9));
}

/**
 * Break a run into lines that fit the width it has been given, in cells. A line break the
 * writer typed is kept: each paragraph wraps on its own, and an empty one is an empty line.
 */
export function wrap(style: TextStyle, text: string, span: number): string[] {
  const m = METRICS[style];
  const room = fits(m.size, span - m.inset * 2);
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && next.length > room) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** How many lines a run's text takes at a width in cells. */
export const linesFor = (style: TextStyle, text: string, span: number): number => Math.max(1, wrap(style, text, span).length);

/**
 * How many cells tall a run of this many lines is. A title's leading is a whole cell, so
 * it is one cell per line; a note fits several lines in a cell. Rounded up, because a run
 * owns whole cells.
 */
export function cellsFor(style: TextStyle, lines: number): number {
  const m = METRICS[style];
  return Math.max(1, Math.ceil(m.pad + lines * m.leading - 1e-6));
}

/** Cut to a number of characters with an ellipsis, when it does not fit. */
export function clip(text: string, room: number): string {
  if (text.length <= room) return text;
  return room <= 1 ? "…" : `${text.slice(0, room - 1)}…`;
}
