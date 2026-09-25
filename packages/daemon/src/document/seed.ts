import { type Grid, nextId, type Scope, spanFor, type Tile } from "@lattice/model";
import type { Facts } from "@lattice/protocol";

/**
 * A grid to look at when there is no document yet. Nothing in it is real: the scopes are
 * not worktrees, the hosts run nothing, the links are made up. It goes when projects and
 * terminals exist. The one file that knows what is on it.
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
  const texts: [number, number, string][] = [[2, 1, "auth"], [11, 1, "infra"], [3, 6, "research"], [12, 6, "planner"]];
  const cells: [number, number, string | null][] = [
    [3, 2, "claude"], [3, 3, "codex"], [2, 3, "claude"],
    [12, 2, "codex"], [13, 2, "claude"],
    [4, 7, "claude"], [5, 7, "claude"], [5, 8, "codex"],
    [13, 7, "claude"],
    [8, 4, null],
  ];
  const tiles: Tile[] = [
    ...texts.map(([c, r, text]): Tile => ({ id: nextId("t"), family: "text", style: "title", columnId: col(c), rowId: row(r), text, span: spanFor("title", text), rows: 1 })),
    ...cells.map(([c, r]): Tile => ({ id: nextId("t"), family: "host", surface: "terminal", columnId: col(c), rowId: row(r), span: 1, rows: 1 })),
  ];
  const hosts = tiles.filter((x) => x.family === "host");
  const host = (n: number) => hosts[n]?.id ?? "";
  const hosting: Record<string, string> = {};
  cells.forEach(([, , occupant], n) => {
    if (occupant) hosting[host(n)] = occupant;
  });
  const links = [
    { from: host(0), to: host(3) },
    { from: host(0), to: host(5) },
    { from: host(3), to: host(8) },
    { from: host(5), to: host(6) },
    { from: host(1), to: host(9) },
  ];
  return { grid: { columns, rows, tiles, scopes, links }, facts: { hosting } };
}
