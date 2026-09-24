/**
 * Cell size and gutter are declared in CSS so the look can be retuned in one place, and
 * read back here because drag arithmetic needs the same numbers the layout used. Read once:
 * these are authoring constants, not responsive values.
 */

export interface Metrics {
  cellW: number;
  cellH: number;
  gutter: number;
  /** Cell plus gutter — the distance from one lane to the next. */
  stepX: number;
  stepY: number;
}

let cached: Metrics | null = null;

export function metrics(): Metrics {
  if (cached) return cached;
  const style = getComputedStyle(document.documentElement);
  const px = (name: string) => {
    const value = Number.parseFloat(style.getPropertyValue(name));
    if (Number.isNaN(value)) throw new Error(`${name} is not set`);
    return value;
  };
  const cellW = px("--cell-w");
  const cellH = px("--cell-h");
  const gutter = px("--gutter");
  cached = { cellW, cellH, gutter, stepX: cellW + gutter, stepY: cellH + gutter };
  return cached;
}

/** Pixel size of a grid of `lanes` tracks, gutters included. */
export function span(lanes: number, step: number, gutter: number): number {
  return lanes <= 0 ? 0 : lanes * step - gutter;
}
