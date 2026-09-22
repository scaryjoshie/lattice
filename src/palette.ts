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
 *   state              surface     outline
 *   empty, unowned     page        line
 *   empty, in region   tint        none
 *   occupied           fill        none
 *   focused            unchanged   edge
 */
export const NEUTRAL: Hue = {
  tint: "#eeeef1",
  fill: "#d9dbe1",
  line: "#e4e4e9",
  edge: "#b6b9c3",
  ink: "#5f6270",
};

export const HUES: readonly Hue[] = [
  { tint: "#e2ebfb", fill: "#c6d8f5", line: "#d3e0f8", edge: "#5b87d4", ink: "#3f6096" },
  { tint: "#dff0e6", fill: "#bfe2cd", line: "#d0e9da", edge: "#4e9c70", ink: "#3c7455" },
  { tint: "#fbe6d9", fill: "#f5d0b6", line: "#f7ddcb", edge: "#d5813f", ink: "#96603a" },
  { tint: "#eae2f8", fill: "#d6c7f2", line: "#e0d6f5", edge: "#7d5fc0", ink: "#5f4a8e" },
];

export const hue = (n: number | null): Hue => (n === null ? NEUTRAL : (HUES[n % HUES.length] ?? NEUTRAL));
