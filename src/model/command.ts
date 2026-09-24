import {
  addTile,
  applied,
  ensureTracks,
  type Grid,
  type Move,
  nextId,
  proposeMove,
  proposeResize,
  removeTile,
  type TextStyle,
} from "./grid.ts";
import type { Region } from "./region.ts";

/**
 * A command is a change to the document, as data: everything needed to judge it and
 * apply it against a grid, and nothing else. No verdict, no pointer, nothing about the
 * screen. `propose` judges one; `apply` judges it again and applies the whole verdict or
 * none of it, so nothing can be applied that was not judged. The view previews with
 * `propose` and commits with `apply`, and never holds a verdict between the two.
 *
 * Regions and lines are indices, meaningful against the grid the command is run on.
 */
export type Command =
  | { kind: "move"; from: Region; to: Region }
  | { kind: "resize"; owner: string; col?: Edge; row?: Edge }
  | { kind: "place"; ci: number; ri: number; what: Placing; id?: string }
  | { kind: "remove"; id: string }
  | { kind: "setText"; id: string; text: string }
  | { kind: "setName"; id: string; name: string };

/** What a place makes: a run in a style, or a host with a surface. */
export type Placing = { family: "text"; style?: TextStyle } | { family: "host"; surface: string };

/** One gridline moved by `n` cells. A corner is one of these per axis. */
export interface Edge {
  line: number;
  n: number;
}

export interface Verdict {
  ok: boolean;
  /** Every position change the command implies, applied together. Empty when refused. */
  moves: readonly Move[];
  /** A move: something at the destination comes back the other way. */
  swaps: boolean;
  /** A resize: the owner's bounds after, and the cells being made or unmade. Answered
   *  whatever the verdict, since a refusal is drawn as the resize it refuses. */
  after: Region | null;
  bands: readonly Region[];
}

const none: Verdict = { ok: false, moves: [], swaps: false, after: null, bands: [] };
const plain = (ok: boolean): Verdict => ({ ...none, ok });
const has = (grid: Grid, id: string): boolean => grid.tiles.some((t) => t.id === id);

export function propose(grid: Grid, command: Command): Verdict {
  switch (command.kind) {
    case "move": {
      const v = proposeMove(grid, command.from, command.to);
      return { ...none, ok: v.ok, moves: v.moves, swaps: v.swaps };
    }
    case "resize":
      return corner(grid, command);
    case "place": {
      const column = grid.columns[command.ci];
      const row = grid.rows[command.ri];
      // Past the tracks is free by definition; the tracks are made when it is applied.
      return plain(!column || !row || !grid.tiles.some((t) => t.columnId === column.id && t.rowId === row.id));
    }
    case "remove":
    case "setText":
    case "setName":
      return plain(has(grid, command.id));
  }
}

/**
 * A resize on one or two axes. A corner is two resizes, the second proposed on the grid
 * the first would leave: that grid may have gained tracks at the front, shifting every
 * index, so the row resize is asked in its terms and answered back in the model's.
 */
function corner(grid: Grid, { owner, col, row }: Extract<Command, { kind: "resize" }>): Verdict {
  const c = col ? proposeResize(grid, owner, "col", col.line, col.n) : null;
  const mid = c ? applied(grid, c.moves) : { grid, dc: 0, dr: 0 };
  const back = (r: Region): Region => ({ ...r, ci: r.ci - mid.dc, ri: r.ri - mid.dr });
  const raw = row ? proposeResize(mid.grid, owner, "row", row.line + mid.dr, row.n) : null;
  const r = raw
    ? {
        ...raw,
        after: back(raw.after),
        band: raw.band ? back(raw.band) : null,
        moves: raw.moves.map((m) => ({ ...m, ci: m.ci - mid.dc, ri: m.ri - mid.dr })),
      }
    : null;
  const ok = (c?.ok ?? true) && (r?.ok ?? true);
  const after = r?.after ?? c?.after ?? null;
  // A column band spans the rows the owner will have, so a corner's new cells are all
  // shown, including the block where the two bands meet.
  const bands: Region[] = [];
  if (c?.band && after) bands.push({ ...c.band, ri: after.ri, rows: after.rows });
  if (r?.band) bands.push(r.band);
  return { ok, moves: ok ? [...(c?.moves ?? []), ...(r?.moves ?? [])] : [], swaps: false, after, bands };
}

export interface Applied {
  ok: boolean;
  grid: Grid;
  /** Tracks prepended on the way, which shift every index. */
  dc: number;
  dr: number;
  /** A place: the new tile. */
  id?: string;
}

/** The grid with the command done, whole, or unchanged with `ok: false`. */
export function apply(grid: Grid, command: Command): Applied {
  const same: Applied = { ok: false, grid, dc: 0, dr: 0 };
  if (!propose(grid, command).ok) return same;
  switch (command.kind) {
    case "move":
    case "resize":
      return { ok: true, ...applied(grid, propose(grid, command).moves) };
    case "place": {
      const made = ensureTracks(grid, { ci: command.ci, ri: command.ri, span: 1, rows: 1 });
      const column = made.grid.columns[command.ci + made.dc];
      const row = made.grid.rows[command.ri + made.dr];
      if (!column || !row) return same;
      // Named by the caller when what follows must refer to it, else here.
      const id = command.id ?? nextId("t");
      return { ok: true, grid: addTile(made.grid, column.id, row.id, command.what, id), dc: made.dc, dr: made.dr, id };
    }
    case "remove":
      return { ok: true, grid: removeTile(grid, command.id), dc: 0, dr: 0 };
    case "setText":
      return {
        ok: true,
        grid: {
          ...grid,
          tiles: grid.tiles.map((t) =>
            t.id === command.id ? { ...t, text: command.text } : t,
          ),
        },
        dc: 0,
        dr: 0,
      };
    case "setName":
      return {
        ok: true,
        grid: {
          ...grid,
          tiles: grid.tiles.map((t) => (t.id === command.id ? { ...t, name: command.name.trim() || undefined } : t)),
        },
        dc: 0,
        dr: 0,
      };
  }
}
