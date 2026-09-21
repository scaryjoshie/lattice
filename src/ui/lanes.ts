import type { Track } from "../grid/model.ts";

/**
 * A lane is one rendered column or row. The rendered grid is the model's tracks plus a
 * one-track margin on every side, so there is always an empty cell to point at, and plus
 * any ghost tracks an insertion is currently previewing.
 *
 * `at` is the model index a lane stands for: -1 and `tracks.length` are the margin, which
 * the store reads as "make a track here".
 */
export type Lane =
  | { kind: "edge"; at: number }
  | { kind: "track"; at: number; id: string }
  | { kind: "ghost"; at: number; key: string };

export interface Lanes {
  list: Lane[];
  /** Track id to 1-based CSS grid line. */
  ofTrack: Map<string, number>;
  /** Model index, margin included, to 1-based CSS grid line. */
  ofIndex: Map<number, number>;
}

export function buildLanes(
  tracks: readonly Track[],
  ghosts: { at: number; ids: readonly string[] } | null,
): Lanes {
  const middle: Lane[] = tracks.map((t, at) => ({ kind: "track", at, id: t.id }));
  if (ghosts) {
    const inserted: Lane[] = ghosts.ids.map((key) => ({ kind: "ghost", at: ghosts.at, key }));
    middle.splice(ghosts.at, 0, ...inserted);
  }
  const list: Lane[] = [{ kind: "edge", at: -1 }, ...middle, { kind: "edge", at: tracks.length }];

  const ofTrack = new Map<string, number>();
  const ofIndex = new Map<number, number>();
  list.forEach((lane, i) => {
    if (lane.kind === "ghost") return;
    ofIndex.set(lane.at, i + 1);
    if (lane.kind === "track") ofTrack.set(lane.id, i + 1);
  });
  return { list, ofTrack, ofIndex };
}
