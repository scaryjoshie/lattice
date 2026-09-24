import { chmodSync, unlinkSync, writeFileSync } from "node:fs";
import { frame, unframe } from "@lattice/protocol";
import type { Client, Rpc } from "./rpc.ts";

/**
 * Two doors, one room. A Unix socket for tools and the command line; a WebSocket on a
 * localhost port for the app, since a webview cannot open a Unix socket. Both speak the
 * same framed JSON-RPC. The port and a random token go in an owner-only session file the
 * shell and the dev server read; a WebSocket that does not present the token is refused.
 */
export interface Session {
  port: number;
  token: string;
}

export function listen(rpc: Rpc, paths: { socket: string; session: string }): { session: Session; close(): void } {
  try {
    unlinkSync(paths.socket);
  } catch {
    // Nothing to remove.
  }

  const socket = Bun.listen<{ buffer: string; detach: () => void }>({
    unix: paths.socket,
    socket: {
      open(s) {
        const client: Client = { send: (m) => s.write(frame(m)) };
        s.data = { buffer: "", detach: rpc.attach(client) };
      },
      data(s, chunk) {
        const { messages, rest } = unframe(s.data.buffer + chunk.toString());
        s.data.buffer = rest;
        for (const m of messages) {
          const reply = rpc.handle(m);
          if (reply) s.write(frame(reply));
        }
      },
      close(s) {
        s.data.detach();
      },
    },
  });
  chmodSync(paths.socket, 0o600);

  const token = crypto.randomUUID();
  const ws = Bun.serve<{ detach: () => void }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname !== "/" || url.searchParams.get("token") !== token) return new Response("no", { status: 403 });
      return server.upgrade(request, { data: { detach: () => {} } }) ? undefined : new Response("no", { status: 400 });
    },
    websocket: {
      open(s) {
        const client: Client = { send: (m) => s.send(JSON.stringify(m)) };
        s.data.detach = rpc.attach(client);
      },
      message(s, raw) {
        const reply = rpc.handle(JSON.parse(raw.toString()));
        if (reply) s.send(JSON.stringify(reply));
      },
      close(s) {
        s.data.detach();
      },
    },
  });
  const session: Session = { port: ws.port ?? 0, token };
  writeFileSync(paths.session, JSON.stringify(session), { mode: 0o600 });

  return {
    session,
    close() {
      socket.stop(true);
      ws.stop(true);
      for (const p of [paths.socket, paths.session]) {
        try {
          unlinkSync(p);
        } catch {
          // Already gone.
        }
      }
    },
  };
}
