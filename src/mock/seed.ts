import { type Grid, type Link, nextId, type Scope, type Tile } from "../model/grid.ts";
import type { ProgramId } from "../providers/index.ts";
import type { Facts } from "../runtime/facts.ts";

/**
 * A grid to look at. Nothing in it is real: the scopes are not worktrees, the occupants
 * run nothing, and the links are made up. It exists so the canvas has something on it
 * while the daemon does not exist, and it is the only file that knows what is on it.
 * The runs' spans here are placeholders; the store measures them from their words.
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

  const texts: [number, number, number, string][] = [
    [2, 1, 3, "auth"],
    [11, 1, 4, "infra"],
    [3, 6, 4, "research"],
    [12, 6, 3, "planner"],
  ];


  const cells: [number, number, ProgramId][] = [
    [3, 2, "claude"], [3, 3, "codex"], [2, 3, "claude"],
    [12, 2, "codex"], [13, 2, "claude"],
    [4, 7, "claude"], [5, 7, "claude"], [5, 8, "codex"],
    [13, 7, "claude"],
    [8, 4, "shell"],
  ];
  const tiles: Tile[] = [
    ...texts.map(([c, r, span, text]) => ({
      id: nextId("t"),
      family: "text" as const,
      style: "title" as const,
      columnId: col(c),
      rowId: row(r),
      text,
      span,
      rows: 1,
    })),
    ...cells.map(([c, r]) => ({
      id: nextId("t"),
      family: "terminal" as const,
      columnId: col(c),
      rowId: row(r),
    })),
  ];
  const terminals = tiles.filter((x) => x.family === "terminal");
  const agent = (n: number) => terminals[n]?.id ?? "";
  // What the mock says is running in each terminal. A shell has no entry.
  const programs: Record<string, ProgramId> = {};
  cells.forEach(([, , program], n) => {
    if (program !== "shell") programs[agent(n)] = program;
  });
  const links: Link[] = [
    { from: agent(0), to: agent(3) },
    { from: agent(0), to: agent(5) },
    { from: agent(3), to: agent(8) },
    { from: agent(5), to: agent(6) },
    { from: agent(1), to: agent(9) },
  ];
  return { grid: { columns, rows, tiles, scopes, links }, facts: { programs } };
}

/** The one seed the stores share: made once, so the facts name the grid's terminals. */
export const seeded = seed();
