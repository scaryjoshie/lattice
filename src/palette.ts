/**
 * Three questions, three channels, and nothing else varies:
 *
 *   which group is this cell in   ->  hue
 *   is it occupied                ->  lightness: tint for a member, fill for an occupant
 *   what is the occupant doing    ->  the mark inside the tile
 *
 * Every hue carries the same four roles, so there is no palette of one-off colours and no
 * rule that applies to some hues and not others. A cell belonging to no region is not a
 * special case either — it has a hue like anything else, the neutral one, which is why the
 * lattice outline and a region's focus ring are the same role at different hues.
 */

export interface Hue {
  /** Surface of a cell that belongs but holds nothing. */
  tint: string;
  /** Surface of a cell that holds something. */
  fill: string;
  /** Outline at rest. Only the neutral hue ever shows one; a tint needs no border. */
  line: string;
  /** Outline when focused. Always the hue of the thing it outlines. */
  edge: string;
  /** Label ink and the occupant's mark. */
  ink: string;
}

/**
 * Which role is used is a table, not a judgement:
 *
 *   state                surface     outline
 *   empty, unowned       page        line
 *   empty, in region     tint        line
 *   occupied, unowned    fill        none
 *   occupied, in region  fill        none
 *   focused              unchanged   edge
 *
 * So an outline means the cell is empty and a fill means it holds something, at every hue
 * and in or out of a region. Belonging to a region changes the colour, never the reading.
 * An earlier version dropped the outline on a region's empty cells, which left them looking
 * like weak occupants rather than like empty cells that belong somewhere.
 */
export const NEUTRAL: Hue = {
  tint: "#eeeef1",
  fill: "#c6c9d2",
  line: "#ebebef",
  edge: "#b6b9c3",
  ink: "#5f6270",
};

/** tint < line < fill, so the three are always the same distance apart in every hue. */
export const HUES: readonly Hue[] = [
  { tint: "#e3ecfb", fill: "#a8c3ee", line: "#cddef8", edge: "#5b87d4", ink: "#3f6096" },
  { tint: "#e0f1e7", fill: "#9fd3b3", line: "#c7e7d3", edge: "#4e9c70", ink: "#3c7455" },
  { tint: "#fce7da", fill: "#f0bd97", line: "#f8d9c4", edge: "#d5813f", ink: "#96603a" },
  { tint: "#ebe3f8", fill: "#c0aceb", line: "#ddd2f6", edge: "#7d5fc0", ink: "#5f4a8e" },
];

export const hue = (n: number | null): Hue => (n === null ? NEUTRAL : (HUES[n % HUES.length] ?? NEUTRAL));
