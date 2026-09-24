import { type Command, propose } from "../model/command.ts";
import { bounds, close, footprint, type Grid, holder, nextId, type TextStyle, wellFormed } from "../model/grid.ts";
import { idleOf, OCCUPANTS, type OccupantId } from "../occupants/index.ts";
import type { RuntimeCommand } from "../runtime/facts.ts";
import { contains, type Region } from "../model/region.ts";
import type { Gesture, Selection, Session, SessionCommand } from "./session.ts";
import { sameTarget, type Target } from "./target.ts";

/**
 * What an input means, given what is already going on. This is the one place every rule
 * about the pointer and the keys lives: the same rules were once spread across four
 * handlers, the camera's filter and the painter's last pass.
 *
 * Pure. No React, no DOM, no canvas. It takes the grid and the session, and an input
 * already translated into grid terms by the view, and returns commands: for the document,
 * for the session, and for history. It runs nothing itself.
 */

/** An input in grid terms. The view is the only code that knows how to make one. */
export type Input =
  | { type: "press"; target: Target; cell: readonly [number, number]; shift: boolean; button: number }
  | { type: "move"; target: Target; cell: readonly [number, number]; world: { x: number; y: number } }
  | {
      type: "release";
      target: Target;
      cell: readonly [number, number];
      /** The press moved more than a click's worth. */
      travelled: boolean;
      shift: boolean;
      button: number;
      client: { x: number; y: number };
    }
  | { type: "context"; cell: readonly [number, number]; client: { x: number; y: number } }
  | { type: "leave" }
  | { type: "key"; key: "Escape" | "Shift" | "Undo" | "Redo"; down: boolean }
  /** What the overlays report back. */
  | { type: "choose"; choice: Choice }
  | { type: "act"; action: "rename" | "delete" }
  | { type: "draft"; text: string }
  | { type: "done" }
  | { type: "dismiss" }
  | { type: "leaving" }
  | { type: "closed" };

export type Effect = Command | SessionCommand | RuntimeCommand | { kind: "undo" } | { kind: "redo" };

/** What the add menu offers: text in a style, or an occupant, which brings its own surface. */
export type Choice = { family: "text"; style: TextStyle } | { family: "host"; occupant: OccupantId };

/** The smallest region holding both a region and a cell: what shift-click extends to. */
export function reach(r: Region, [ci, ri]: readonly [number, number]): Region {
  const c0 = Math.min(r.ci, ci);
  const r0 = Math.min(r.ri, ri);
  return {
    ci: c0,
    ri: r0,
    span: Math.max(r.ci + r.span - 1, ci) - c0 + 1,
    rows: Math.max(r.ri + r.rows - 1, ri) - r0 + 1,
  };
}

/**
 * A selection with a region that is exactly a scope's bounds is that scope. Selecting a
 * worktree's cells is selecting the worktree; there is no second way to mean it.
 */
export function selectionOf(grid: Grid, region: Region): Selection {
  const scope = grid.scopes.find((s) => {
    const b = bounds(grid, s);
    return b.ci === region.ci && b.ri === region.ri && b.span === region.span && b.rows === region.rows;
  });
  return scope ? { scope: scope.id } : { region };
}

/** The region a selection owns, according to the model. */
export function regionOf(grid: Grid, selection: Selection | null): Region | null {
  if (!selection) return null;
  if ("region" in selection) return selection.region;
  if ("scope" in selection) {
    const scope = grid.scopes.find((s) => s.id === selection.scope);
    return scope ? bounds(grid, scope) : null;
  }
  const tile = grid.tiles.find((t) => t.id === selection.tile);
  return tile ? footprint(grid, tile) : null;
}

/** A selection is invalid when closing it ran into something it could not include. */
export function invalid(grid: Grid, selection: Selection | null): boolean {
  return selection !== null && "region" in selection && !wellFormed(grid, selection.region);
}

/** The tile holding a cell, by the model's positions. */
const tileUnder = (grid: Grid, [ci, ri]: readonly [number, number]): string | null => holder(grid, ci, ri)?.id ?? null;

const select = (selection: Selection | null): SessionCommand => ({ kind: "select", selection });
const point = (target: Target | null): SessionCommand => ({ kind: "point", target });
const gesture = (g: Gesture | null): SessionCommand => ({ kind: "gesture", gesture: g });
const overlay = (o: Session["overlay"]): SessionCommand => ({ kind: "overlay", overlay: o });

export function react(grid: Grid, session: Session, input: Input): Effect[] {
  switch (input.type) {
    case "press":
      return press(grid, session, input);
    case "move":
      return move(grid, session, input);
    case "release":
      return release(grid, session, input);
    case "context": {
      const id = tileUnder(grid, input.cell);
      // The menu for what is there. On an empty cell that is the add menu, which is also
      // what shift-click offers: the act and the menu are the same thing for a place.
      return [
        point(null),
        overlay(id ? { kind: "tile", at: input.client, id } : { kind: "add", at: input.client, ci: input.cell[0], ri: input.cell[1] }),
      ];
    }
    case "leave":
      return [point(null)];
    case "key":
      return key(session, input);
    case "choose": {
      if (session.overlay?.kind !== "add") return [];
      const { ci, ri } = session.overlay;
      // A run opens for typing at once and is the selection, so its ring grows as it is
      // typed. Anything else is simply placed. The tile is named here so the commands
      // that follow can refer to it before it exists.
      const id = nextId("t");
      const { choice } = input;
      if (choice.family === "text") {
        const place: Command = { kind: "place", ci, ri, what: { family: "text", style: choice.style }, id };
        return [overlay(null), place, point(null), select({ tile: id }), overlay({ kind: "edit", id, draft: "" })];
      }
      // A host is placed with the surface its occupant needs; the occupant is the
      // runtime's to start, unless it is what that surface shows anyway.
      const { surface } = OCCUPANTS[choice.occupant];
      const place: Command = { kind: "place", ci, ri, what: { family: "host", surface }, id };
      const start: Effect[] = choice.occupant === idleOf(surface) ? [] : [{ kind: "start", host: id, occupant: choice.occupant }];
      return [overlay(null), place, ...start];
    }
    case "act": {
      if (session.overlay?.kind !== "tile") return [];
      const { id } = session.overlay;
      if (input.action === "delete") return [overlay(null), { kind: "remove", id }, select(null)];
      const tile = grid.tiles.find((t) => t.id === id);
      return tile && tile.family === "text"
        ? [point(null), select({ tile: id }), overlay({ kind: "edit", id, draft: tile.text })]
        : [overlay({ kind: "name", id })];
    }
    case "draft":
      return session.overlay?.kind === "edit" && session.overlay.draft !== input.text
        ? [overlay({ ...session.overlay, draft: input.text })]
        : [];
    case "done":
    case "dismiss":
      return [overlay(null)];
    case "leaving":
      return session.opened ? [{ kind: "open", opened: { ...session.opened, leaving: true } }] : [];
    case "closed":
      return [{ kind: "open", opened: null }];
  }
}

function press(grid: Grid, session: Session, input: Extract<Input, { type: "press" }>): Effect[] {
  // A press while something is open is spent closing it, whatever else it lands on.
  // Decided now, because an input commits on blur, which happens before the release.
  if (session.overlay) return [gesture({ kind: "dismiss" })];
  // Only the primary button presses on the grid. The others are the menu's and the camera's.
  if (input.button !== 0) return [];
  const { target, cell } = input;
  if (target.kind === "line" && !input.shift) {
    // Taking hold of a gridline of the selected scope or run. Measured from the line.
    const { owner, c, r } = target;
    return [
      gesture({ kind: "stretch", owner, c, r, wx: c === null ? 0 : c, wy: r === null ? 0 : r, command: null, verdict: null, at: { c, r } }),
    ];
  }
  const selected = regionOf(grid, session.selection);
  const inside = selected !== null && contains(selected, cell[0], cell[1]);
  const bad = invalid(grid, session.selection);
  if (input.shift) {
    // Shift and drag sweeps a rectangle: from the cell if nothing is selected, and from
    // the selection if something is, which is extending it. A shift-click is decided on
    // the release.
    const anchor = selected && !bad ? selected : { ci: cell[0], ri: cell[1], span: 1, rows: 1 };
    return [gesture({ kind: "sweep", anchor, region: null })];
  }
  // A press on an invalid selection is the grid's and goes nowhere: the selection is
  // already drawn in the colour that says so. A click there is still a click.
  if (inside && bad) return [gesture({ kind: "hold" })];
  // Only a press inside the selection carries anything. Anywhere else a plain drag pans,
  // tile or not, so there is always somewhere to pan from.
  if (!inside || !selected) return [];
  const id = session.selection && "tile" in session.selection ? session.selection.tile : null;
  return [gesture({ kind: "carry", id, from: selected, grab: [cell[0] - selected.ci, cell[1] - selected.ri], command: null, verdict: null })];
}

function move(grid: Grid, session: Session, input: Extract<Input, { type: "move" }>): Effect[] {
  if (session.overlay) return [];
  const g = session.gesture;
  if (g?.kind === "stretch") {
    const nc = g.c === null ? 0 : Math.round(input.world.x - g.wx);
    const nr = g.r === null ? 0 : Math.round(input.world.y - g.wy);
    const command: Extract<Command, { kind: "resize" }> = {
      kind: "resize",
      owner: g.owner,
      ...(g.c === null ? {} : { col: { line: g.c, n: nc } }),
      ...(g.r === null ? {} : { row: { line: g.r, n: nr } }),
    };
    const verdict = propose(grid, command);
    return [point(null), gesture({ ...g, command, verdict, at: { c: g.c === null ? null : g.c + nc, r: g.r === null ? null : g.r + nr } })];
  }
  if (g?.kind === "sweep") {
    return [point(null), gesture({ ...g, region: close(grid, reach(g.anchor, input.cell)) })];
  }
  if (g?.kind === "carry") {
    const to: Region = { ...g.from, ci: input.cell[0] - g.grab[0], ri: input.cell[1] - g.grab[1] };
    // From the model, never from the scene: the scene is built from this answer.
    const command: Extract<Command, { kind: "move" }> = { kind: "move", from: g.from, to };
    return [point(null), gesture({ ...g, command, verdict: propose(grid, command) })];
  }
  if (g) return [];
  // A lit line repaints on every move, since the grip follows the pointer along it.
  if (input.target.kind !== "line" && sameTarget(input.target, session.pointing)) return [];
  return [point(input.target)];
}

function release(grid: Grid, session: Session, input: Extract<Input, { type: "release" }>): Effect[] {
  const g = session.gesture;
  const done: Effect[] = [gesture(null)];
  if (input.button !== 0) return g ? done : [];
  if (g?.kind === "sweep") {
    if (!input.travelled) return [...done, ...click(grid, session, input)];
    return [...done, select(selectionOf(grid, close(grid, reach(g.anchor, input.cell))))];
  }
  if (g?.kind === "stretch") {
    // The command previewed is the command run; the store judges it again itself.
    return g.command ? [...done, g.command] : done;
  }
  if (g?.kind === "carry") {
    // A press inside the selection that never travelled is a click on it, not a move.
    if (!input.travelled) return [...done, ...click(grid, session, input)];
    if (!g.command || !g.verdict?.ok) return done;
    // A selected tile or scope follows itself; a selected region is told where it went.
    // Told before the move runs: the region is in this grid's indices, and if the move
    // prepends tracks the session's indices are shifted along with everything else.
    const follow: Effect[] =
      g.id === null && !(session.selection && "scope" in session.selection)
        ? [select(selectionOf(grid, g.command.to))]
        : [];
    return [...done, ...follow, g.command];
  }
  if (g?.kind === "dismiss") {
    // Point back at whatever is under the pointer already, rather than waiting for it to
    // move before the grid responds again.
    return [...done, overlay(null), point(input.target)];
  }
  if (g?.kind === "hold") return input.travelled ? done : [...done, ...click(grid, session, input)];
  // A press that travelled was a pan, not a click.
  if (input.travelled) return done;
  return [...done, ...click(grid, session, input)];
}

/** A press and release on one spot. */
function click(grid: Grid, session: Session, input: Extract<Input, { type: "release" }>): Effect[] {
  const { cell, target } = input;
  const id = tileUnder(grid, cell);
  const selected = regionOf(grid, session.selection);
  if (input.shift) {
    // With a selection, shift-click selects the rectangle out to this cell. Without one,
    // shift-click acts: on an empty cell the act is the add menu; on an occupant, opening.
    if (selected && !contains(selected, cell[0], cell[1])) {
      return [select(selectionOf(grid, close(grid, reach(selected, cell))))];
    }
    if (id) {
      const tile = grid.tiles.find((t) => t.id === id);
      if (!tile || tile.family === "text") return [];
      return [point(null), { kind: "open", opened: { id, leaving: false } }];
    }
    return [point(null), overlay({ kind: "add", at: input.client, ci: cell[0], ri: cell[1] })];
  }
  // Click selects, and clicking what is already selected clears it. A scope's corner
  // handle selects the scope; anywhere else inside it selects the cell.
  if (target.kind === "handle") return [select({ scope: target.scope })];
  if (selected && contains(selected, cell[0], cell[1])) return [select(null)];
  return [select(id ? { tile: id } : selectionOf(grid, { ci: cell[0], ri: cell[1], span: 1, rows: 1 }))];
}

function key(session: Session, input: Extract<Input, { type: "key" }>): Effect[] {
  if (input.key === "Shift") return session.shift === input.down ? [] : [{ kind: "shiftKey", held: input.down }];
  if (!input.down) return [];
  // An opened tile owns every key while it is up, the way an overlay owns the pointer.
  if (session.opened) return [];
  // The store hands back the selection each change was made with; the runner applies it.
  if (input.key === "Undo" || input.key === "Redo") return [{ kind: input.key === "Undo" ? "undo" : "redo" }];
  // Escape cancels the gesture in progress, else clears the selection.
  if (session.gesture) return [gesture(null)];
  return [select(null)];
}
