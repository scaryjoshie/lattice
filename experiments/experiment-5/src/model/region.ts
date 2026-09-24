/**
 * A region is a rectangle of cells, by index. It is a value, not a thing: two things at
 * the same place have the same region. Everything that holds cells — a tile's footprint,
 * a scope's bounds, the two halves of a proposed move — is one of these, and the three
 * questions the grid ever asks about cells are asked here and nowhere else.
 */
export interface Region {
  readonly ci: number;
  readonly ri: number;
  readonly span: number;
  readonly rows: number;
}

/** Does this region hold the cell. */
export const contains = (r: Region, ci: number, ri: number): boolean =>
  ci >= r.ci && ci < r.ci + r.span && ri >= r.ri && ri < r.ri + r.rows;

/** Is `inner` entirely within `outer`. */
export const covers = (outer: Region, inner: Region): boolean =>
  inner.ci >= outer.ci &&
  inner.ci + inner.span <= outer.ci + outer.span &&
  inner.ri >= outer.ri &&
  inner.ri + inner.rows <= outer.ri + outer.rows;

/** Do the two share any cell. */
export const overlaps = (a: Region, b: Region): boolean =>
  a.ci < b.ci + b.span && b.ci < a.ci + a.span && a.ri < b.ri + b.rows && b.ri < a.ri + a.rows;

/** Every cell in the region, row by row. */
export function* cells(r: Region): Generator<[number, number]> {
  for (let dy = 0; dy < r.rows; dy++) {
    for (let dx = 0; dx < r.span; dx++) yield [r.ci + dx, r.ri + dy];
  }
}
