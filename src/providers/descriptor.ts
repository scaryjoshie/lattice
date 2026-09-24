/**
 * What a provider says about itself. A provider is an agent — Claude Code, Codex — and
 * not necessarily a program in a terminal: a browser agent would be one too. How a
 * provider is hosted is its adapter's business, and a terminal is the first host, not
 * the only one.
 *
 * This is the descriptor half: data the client can draw and offer from without knowing
 * how the agent is started. The adapter half — starting, resuming, finding a session,
 * delivering text — lives in the daemon when there is one, in the same folder, so a
 * provider is one folder that defines everything about itself.
 */
export interface Descriptor<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
  /** Its mark, as path data on a 24-unit grid, drawn by the painter and the menu alike. */
  readonly mark: readonly Stroke[];
}

export interface Stroke {
  readonly d: string;
  /** Stroke width in the mark's own 24-unit space, or absent to fill. */
  readonly width?: number;
}
