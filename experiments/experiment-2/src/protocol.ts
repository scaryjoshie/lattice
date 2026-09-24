/** The wire between the daemon and the canvas. PTY bytes travel base64 inside JSON. */

export type Provider = "claude" | "codex";

/**
 * The grid a pane is born with. It is only a starting point: a pane takes the grid of
 * whatever space it is opened into, which is what every terminal emulator does.
 */
export const SPAWN_COLS = 120;
export const SPAWN_ROWS = 36;

export interface PaneState {
  id: string;
  provider: Provider;
  pid: number;
  cols: number;
  rows: number;
  /** Set once the process has gone; the pane stays on the canvas until removed. */
  exit: number | null;
  /** Bumped by the daemon whenever bytes arrive, so the canvas can show activity. */
  lastOutputAt: number;
}

export type ClientMessage =
  /** Attaching carries the grid the pane is being opened into. */
  | { t: "attach"; id: string; cols: number; rows: number }
  | { t: "spawn"; provider: Provider }
  | { t: "detach"; id: string }
  | { t: "input"; id: string; data: string }
  | { t: "remove"; id: string };

export type ServerMessage =
  | { t: "panes"; panes: PaneState[] }
  /**
   * The screen as it stands, already at the grid the client asked for: escape sequences
   * that reconstruct it, not a replay of everything that was ever printed. Raw replay
   * would have been laid out for the old grid and arrive scrambled.
   */
  | { t: "snapshot"; id: string; data: string }
  | { t: "data"; id: string; b64: string }
  | { t: "exit"; id: string; code: number | null };
