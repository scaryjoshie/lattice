import { type Grid, type Link, nextId, type Scope, type Tile } from "@lattice/model";
import type { OccupantId } from "../occupants/index.ts";
import type { Facts } from "../runtime/facts.ts";

/**
 * A grid to look at. Nothing in it is real: the scopes are not worktrees, the occupants
 * run nothing, and the links are made up. It exists so the canvas has something on it
 * while the daemon does not exist, and it is the only file that knows what is on it.
 */
export function seed(): { grid: Grid; facts: Facts } {
  const columns = Array.from({ length: 18 }, () => ({ id: nextId("c") }));
  const rows = Array.from({ length: 11 }, () => ({ id: nextId("r") }));
  const col = (i: number) => columns[i]!.id;
  const row = (i: number) => rows[i]!.id;

  const scopes: Scope[] = [
    { id: nextId("g"), name: "auth", hue: 0, columnStart: col(2), columnEnd: col(4), rowStart: row(1), rowEnd: row(4) },
    { id: nextId("g"), name: "infra", hue: 1, columnStart: col(11), columnEnd: col(14), rowStart: row(1), rowEnd: row(3) },
    { id: nextId("g"), name: "research", hue: 2, columnStart: col(3), columnEnd: col(6), rowStart: row(6), rowEnd: row(9) },
    { id: nextId("g"), name: "planner", hue: 3, columnStart: col(12), columnEnd: col(14), rowStart: row(6), rowEnd: row(8) },
  ];

  const texts: [number, number, string][] = [
    [2, 1, "auth"],
    [11, 1, "infra"],
    [3, 6, "research"],
    [12, 6, "planner"],
  ];


  const cells: [number, number, OccupantId | null][] = [
    [3, 2, "claude"], [3, 3, "codex"], [2, 3, "claude"],
    [12, 2, "codex"], [13, 2, "claude"],
    [4, 7, "claude"], [5, 7, "claude"], [5, 8, "codex"],
    [13, 7, "claude"],
    [8, 4, null],
  ];
  const tiles: Tile[] = [
    ...texts.map(([c, r, text]) => ({
      id: nextId("t"),
      family: "text" as const,
      style: "title" as const,
      columnId: col(c),
      rowId: row(r),
      text,
    })),
    ...cells.map(([c, r]) => ({
      id: nextId("t"),
      family: "host" as const,
      surface: "terminal",
      columnId: col(c),
      rowId: row(r),
    })),
  ];
  const terminals = tiles.filter((x) => x.family === "host");
  const agent = (n: number) => terminals[n]?.id ?? "";
  // What the mock says each host is holding. A terminal showing its shell has no entry.
  const hosting: Record<string, OccupantId> = {};
  cells.forEach(([, , occupant], n) => {
    if (occupant) hosting[agent(n)] = occupant;
  });
  const links: Link[] = [
    { from: agent(0), to: agent(3) },
    { from: agent(0), to: agent(5) },
    { from: agent(3), to: agent(8) },
    { from: agent(5), to: agent(6) },
    { from: agent(1), to: agent(9) },
  ];
  return { grid: { columns, rows, tiles, scopes, links }, facts: { hosting } };
}

/** The one seed the stores share: made once, so the facts name the grid's terminals. */
export const seeded = seed();
