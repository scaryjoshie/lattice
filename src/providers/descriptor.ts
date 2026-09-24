/**
 * What a provider says about itself. The descriptor half: data the client can draw and
 * offer from without knowing how the program is launched. The adapter half — launching,
 * resuming, finding a session id, delivering text — lives in the daemon when there is
 * one, in the same folder as the descriptor, so a provider is one folder that defines
 * everything about itself.
 */
export interface Descriptor<Id extends string = string> {
  readonly id: Id;
  readonly label: string;
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
