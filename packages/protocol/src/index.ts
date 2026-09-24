import type { Command, Grid } from "@lattice/model";

/**
 * The wire between the app and the daemon: JSON-RPC 2.0, one message per line on the
 * socket and one per frame on the WebSocket. This package is the method names and the
 * types of their parameters and results, and the two helpers that frame a message.
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

export interface Methods {
  hello: { params: Record<string, never>; result: { version: string; home: string } };
  /** A document command. `mark` is whatever the client wants back when it is undone. */
  run: { params: { command: Command; mark?: unknown }; result: { ok: boolean; dc: number; dr: number; id?: string } };
  undo: { params: { mark?: unknown }; result: { ok: boolean; mark?: unknown } };
  redo: { params: { mark?: unknown }; result: { ok: boolean; mark?: unknown } };
  /** The runtime's: start an occupant in a host, or stop it. Not undoable. */
  start: { params: { host: string; occupant: string }; result: { ok: boolean } };
  stop: { params: { host: string }; result: { ok: boolean } };
}

/** What the daemon says on its own, to every client. */
export interface Notifications {
  grid: { grid: Grid; dc: number; dr: number };
  facts: { facts: Facts };
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
