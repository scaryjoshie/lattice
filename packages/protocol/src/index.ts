import type { Command, Grid, Scope, Tile } from "@lattice/model";
import type { Patch, Preferences } from "./preferences.ts";

export * from "./preferences.ts";

/**
 * The wire between the app and the daemon: JSON-RPC 2.0, one message per line on the
 * socket and one per frame on the WebSocket. This package is the method names and the
 * types of their parameters and results, and the two helpers that frame a message; and
 * the settings' definitions, since both ends read a preference the same way.
 * Nothing else: no transport, no state.
 */

export interface Request<M extends keyof Methods = keyof Methods> {
  jsonrpc: "2.0";
  id: number;
  method: M;
  params: Methods[M]["params"];
}

export interface Response<M extends keyof Methods = keyof Methods> {
  jsonrpc: "2.0";
  id: number;
  result?: Methods[M]["result"];
  error?: { code: number; message: string };
}

export interface Notification<N extends keyof Notifications = keyof Notifications> {
  jsonrpc: "2.0";
  method: N;
  params: Notifications[N];
}

export type Message = Request | Response | Notification;

/** What the runtime has observed: which occupant each host is holding, by id. */
export interface Facts {
  readonly hosting: Readonly<Record<string, string>>;
}

/**
 * One step of the document's history, as a window lists it: the command, and what it was
 * done to, as that was once done (placed, renamed, resized) or just before (removed). A
 * move names what it carried when it carried one thing, and says how many things.
 */
export interface Step {
  command: Command;
  subject: Tile | Scope | null;
  carried: number;
}

export interface Methods {
  hello: { params: Record<string, never>; result: { version: string; home: string } };
  /** A document command. `mark` is whatever the client wants back when it is undone. */
  run: { params: { command: Command; mark?: unknown }; result: { ok: boolean; dc: number; dr: number; id?: string } };
  /** Back `steps` steps, one by default. The mark is the one the last of them was made
   *  with, which is what the window restores. */
  undo: { params: { mark?: unknown; steps?: number }; result: { ok: boolean; mark?: unknown } };
  redo: { params: { mark?: unknown; steps?: number }; result: { ok: boolean; mark?: unknown } };
  /** The runtime's: start an occupant in a host, or stop it. Not undoable. */
  start: { params: { host: string; occupant: string }; result: { ok: boolean } };
  stop: { params: { host: string }; result: { ok: boolean } };
  /**
   * A terminal host's terminal, at a window's grid: started if it is not running, resized
   * to the grid, and handed back as the screen it shows now. From then until detach this
   * window is sent its output. Not undoable, like every runtime request.
   */
  attach: { params: { host: string; cols: number; rows: number }; result: { ok: boolean; screen?: string } };
  /** Keystrokes and pastes, as the terminal emulator produced them. */
  input: { params: { host: string; data: string }; result: { ok: boolean } };
  resize: { params: { host: string; cols: number; rows: number }; result: { ok: boolean } };
  detach: { params: { host: string }; result: { ok: boolean } };
  /** Change the app's settings. Not undoable; the answer is all of them, as they now are. */
  prefer: { params: { patch: Patch }; result: { preferences: Preferences } };
  /** How many terminals are running: what quitting would stop, so the shell asks first. */
  running: { params: Record<string, never>; result: { terminals: number } };
}

/** What the daemon says on its own, to every client. */
export interface Notifications {
  grid: { grid: Grid; dc: number; dr: number };
  facts: { facts: Facts };
  /** The history, after every change and on arrival: what undo would take back, oldest
   *  first, and what redo would do again, next first. */
  history: { past: Step[]; future: Step[] };
  /** The app's settings, on arrival and after every change, from a window or the file. */
  preferences: { preferences: Preferences };
  /** What an attached terminal wrote, base64, since output is bytes and a chunk can end
   *  inside a character. Sent only to the windows attached to it. */
  output: { host: string; data: string };
  /** An attached terminal's process ended. */
  exited: { host: string; code: number | null };
}

export const isRequest = (m: Message): m is Request => "id" in m && "method" in m;
export const isResponse = (m: Message): m is Response => "id" in m && !("method" in m);
export const isNotification = (m: Message): m is Notification => !("id" in m);

/** One message, framed for the socket. */
export const frame = (m: Message): string => `${JSON.stringify(m)}\n`;

/** Split a stream into complete messages, keeping what is not yet complete. */
export function unframe(buffer: string): { messages: Message[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const messages: Message[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    messages.push(JSON.parse(line) as Message);
  }
  return { messages, rest };
}
