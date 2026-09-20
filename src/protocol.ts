/** The wire between the daemon and the canvas. Bytes travel base64 inside JSON. */

export type Provider = "claude" | "codex";

/** One PTY, fixed geometry. A TUI must never reflow because the camera moved. */
export const COLS = 120;
export const ROWS = 36;

export interface PaneState {
  id: string;
  provider: Provider;
  pid: number;
  /** Set once the process has gone; the pane stays on the canvas until removed. */
  exit: number | null;
  /** Bumped by the daemon whenever bytes arrive, so the canvas can show activity. */
  lastOutputAt: number;
}

export type ClientMessage =
  | { t: "spawn"; provider: Provider }
  | { t: "attach"; id: string }
  | { t: "detach"; id: string }
  | { t: "input"; id: string; data: string }
  | { t: "remove"; id: string };

export type ServerMessage =
  | { t: "panes"; panes: PaneState[] }
  | { t: "replay"; id: string; b64: string }
  | { t: "data"; id: string; b64: string }
  | { t: "exit"; id: string; code: number | null };
