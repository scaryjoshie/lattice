import { unlinkSync } from "node:fs";
import { ensureHome } from "./core/paths.ts";

/**
 * The daemon. A child of the app: started when the app starts, stopped when it quits.
 * It will own the document and its history, the terminals, and the agent service; today
 * it owns a socket and answers hello, so that the shape exists and every missing piece
 * is a named hole inside a running process rather than an idea.
 *
 * The protocol is newline-delimited JSON over an owner-only Unix socket. No token: a
 * client that can open the socket is the owner.
 */
const p = ensureHome();
try {
  unlinkSync(p.socket);
} catch {
  // Nothing to remove.
}

interface Hello {
  kind: "hello";
}
type Request = Hello;

const answer = (request: Request): unknown => {
  switch (request.kind) {
    case "hello":
      return { kind: "hello", version: "0.0.0", home: p.root };
  }
};

Bun.listen<{ buffer: string }>({
  unix: p.socket,
  socket: {
    open(socket) {
      socket.data = { buffer: "" };
    },
    data(socket, chunk) {
      socket.data.buffer += chunk.toString();
      let at: number;
      while ((at = socket.data.buffer.indexOf("\n")) >= 0) {
        const line = socket.data.buffer.slice(0, at);
        socket.data.buffer = socket.data.buffer.slice(at + 1);
        if (!line.trim()) continue;
        let request: Request;
        try {
          request = JSON.parse(line) as Request;
        } catch {
          socket.write(`${JSON.stringify({ kind: "error", error: "not json" })}\n`);
          continue;
        }
        socket.write(`${JSON.stringify(answer(request))}\n`);
      }
    },
  },
});
console.log(`lattice daemon listening on ${p.socket}`);
