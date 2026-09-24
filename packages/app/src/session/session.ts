import { type Command, type Region, type Verdict } from "@lattice/model";
import type { Target } from "./target.ts";

/**
 * The session: everything about the interface that is not the document and not the
 * camera. Selection, what the pointer is on, the gesture in progress, the overlay that is
 * open, the tile that is opened. It references the grid by id and index only, and it dies
 * with the window.
 *
 * It holds nothing that can be computed from the grid and itself. What a gesture would
 * do is the one exception: a gesture carries the command it last proposed and the
 * model's verdict on it, so the scene previews and the release runs the same thing.
 */
export interface Session {
  readonly selection: Selection | null;
  readonly pointing: Target | null;
  /** Shift is held. Input state, kept here because the scene draws differently for it. */
  readonly shift: boolean;
  readonly gesture: Gesture | null;
  readonly overlay: Overlay | null;
  readonly opened: Opened | null;
}

/**
 * What is selected: a tile, a scope, or a region of cells. Always a region underneath —
 * selecting a tile is shorthand for selecting the region it owns — but a tile or scope
 * is remembered by id so the selection follows it rather than the cells it was on.
 */
export type Selection = { tile: string } | { scope: string } | { region: Region };

/** A press the grid holds, from pointer-down to release. */
export type Gesture =
  | {
      kind: "carry";
      /** The one tile being carried, if it is one tile: its links stay lit as it goes. */
      id: string | null;
      from: Region;
      /** Where inside the region it was picked up, as an offset from the corner. */
      grab: readonly [number, number];
      command: Extract<Command, { kind: "move" }> | null;
      verdict: Verdict | null;
    }
  | {
      kind: "stretch";
      owner: string;
      /** The lines taken hold of, and their world position where the drag is measured from. */
      c: number | null;
      r: number | null;
      wx: number;
      wy: number;
      command: Extract<Command, { kind: "resize" }> | null;
      verdict: Verdict | null;
      /** Where the dragged lines are now. */
      at: { c: number | null; r: number | null };
    }
  | { kind: "sweep"; anchor: Region; region: Region | null }
  /** A press that began with an overlay open: spent closing it, and nothing else. */
  | { kind: "dismiss" }
  /** A press the grid holds that goes nowhere: on an invalid selection. */
  | { kind: "hold" };

/** One thing open over the grid at a time. Menus live in screen space, at the pointer. */
export type Overlay =
  | { kind: "add"; at: { x: number; y: number }; ci: number; ri: number }
  | { kind: "tile"; at: { x: number; y: number }; id: string }
  /** A run being typed. The draft is here so the scene can lay the run out as it grows. */
  | { kind: "edit"; id: string; draft: string; caret: number }
  | { kind: "name"; id: string };

export interface Opened {
  readonly id: string;
  /** Closing has begun: the panel is on its way back. */
  readonly leaving: boolean;
}

export const initial: Session = {
  selection: null,
  pointing: null,
  shift: false,
  gesture: null,
  overlay: null,
  opened: null,
};

/** A change to the session, as data. One per field, so the log reads as what happened. */
export type SessionCommand =
  | { kind: "select"; selection: Selection | null }
  | { kind: "point"; target: Target | null }
  | { kind: "shiftKey"; held: boolean }
  | { kind: "gesture"; gesture: Gesture | null }
  | { kind: "overlay"; overlay: Overlay | null }
  | { kind: "open"; opened: Opened | null }
  /** Tracks were prepended: every index the session holds moves with them. */
  | { kind: "shift"; dc: number; dr: number };

export function reduce(session: Session, command: SessionCommand): Session {
  switch (command.kind) {
    case "select":
      return { ...session, selection: command.selection };
    case "point":
      return { ...session, pointing: command.target };
    case "shiftKey":
      return { ...session, shift: command.held };
    case "shift": {
      const { dc, dr } = command;
      const r = (x: Region): Region => ({ ...x, ci: x.ci + dc, ri: x.ri + dr });
      const selection =
        session.selection && "region" in session.selection ? { region: r(session.selection.region) } : session.selection;
      const overlay = session.overlay?.kind === "add" ? { ...session.overlay, ci: session.overlay.ci + dc, ri: session.overlay.ri + dr } : session.overlay;
      return { ...session, selection, overlay };
    }
    case "gesture":
      return { ...session, gesture: command.gesture };
    case "overlay":
      return { ...session, overlay: command.overlay };
    case "open":
      return { ...session, opened: command.opened };
  }
}
