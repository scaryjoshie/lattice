/**
 * Three questions, three channels, and nothing else varies:
 *
 *   which group is this cell in   ->  hue
 *   is it occupied                ->  lightness: tint for a member, fill for an occupant
 *   what is the occupant doing    ->  the mark inside the tile
 */

export interface Hue {
  /** A cell that belongs to the region but holds nothing. */
  tint: string;
  /** A cell that holds something. */
  fill: string;
  /** The label tab and its ink. */
  ink: string;
}

export const HUES: readonly Hue[] = [
  { tint: "#e2ebfb", fill: "#bed1f1", ink: "#4f6f9e" },
  { tint: "#dff0e6", fill: "#b6dcc5", ink: "#4a7d5f" },
  { tint: "#fbe6d9", fill: "#f3c9ab", ink: "#a2673c" },
  { tint: "#eae2f8", fill: "#cfbef0", ink: "#6d5596" },
];

/** An occupant outside every region still has to read as occupied. */
export const LOOSE: Hue = { tint: "#ebebef", fill: "#cdd0d7", ink: "#6f7280" };

export const hue = (n: number): Hue => HUES[n % HUES.length] ?? LOOSE;
