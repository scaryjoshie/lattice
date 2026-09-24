/**
 * What the pointer is on: exactly one of these at a time. A scope's corner handle, a
 * gridline of the selected scope or run, or a cell. Their hit areas nest — a handle's
 * square lies within a line's band, which lies within a cell — so the pointer is on the
 * most specific thing whose area contains it. `targetAt` is the only place that knows.
 */
export type Target =
  | { kind: "cell"; ci: number; ri: number }
  | { kind: "handle"; scope: string }
  | { kind: "line"; owner: string; c: number | null; r: number | null };

export const sameTarget = (a: Target | null, b: Target | null): boolean => {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "cell" && b.kind === "cell") return a.ci === b.ci && a.ri === b.ri;
  if (a.kind === "handle" && b.kind === "handle") return a.scope === b.scope;
  if (a.kind === "line" && b.kind === "line") return a.owner === b.owner && a.c === b.c && a.r === b.r;
  return false;
};

