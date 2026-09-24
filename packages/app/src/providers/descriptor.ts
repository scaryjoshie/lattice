/**
 * What an occupant says about itself. An occupant is anything a host can hold: a shell,
 * a browser page, an agent. A provider is an occupant that is an agent — Claude Code,
 * Codex — and not necessarily a program in a terminal, since a browser agent would be
 * one too. Each declares the surface it needs; how it is started there is its adapter's
 * business.
 *
 * This is the descriptor half: data the client can draw and offer from without knowing
 * how anything is started. The adapter half — starting, resuming, finding a session,
 * delivering text — lives in the daemon when there is one, in the same folder, so a
 * provider is one folder that defines everything about itself.
 */
export interface Descriptor<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  /** The surface a host must have to hold this: what the daemon allocates and the view
   *  opens into. Named by a surface's id; the model stores it and never branches on it. */
  readonly surface: string;
  /** An agent, as opposed to a utility. The add menu groups by this; the canvas does not. */
  readonly agent: boolean;
  /** Its mark, as path data on a 24-unit grid, drawn by the painter and the menu alike. */
  readonly mark: readonly Stroke[];
}

export interface Stroke {
  readonly d: string;
  /** Stroke width in the mark's own 24-unit space, or absent to fill. */
  readonly width?: number;
}
