import { homedir } from "node:os";
import type { ClientMessage, PaneState, Provider, ServerMessage } from "../protocol.ts";
import { Pty } from "./pty.ts";

/**
 * The whole daemon. It spawns provider CLIs in PTYs and streams them to the canvas.
 * There is no database, no git and no agent identity: experiment 2 is about the pane.
 */

const PORT = Number(process.env.PANE2_PORT ?? 7778);
const CWD = process.env.PANE2_CWD ?? homedir();
const SCROLLBACK = 256 * 1024;

const ARGV: Record<Provider, string[]> = {
  claude: ["claude"],
  codex: ["codex"],
};

interface Pane {
  state: PaneState;
  pty: Pty;
}

const panes = new Map<string, Pane>();
const sockets = new Set<Bun.ServerWebSocket<SocketData>>();
/** Which panes each socket is attached to, so we only ship bytes someone is watching. */
interface SocketData {
  attached: Set<string>;
  unsubscribe: Map<string, () => void>;
}

let counter = 0;

function send(ws: Bun.ServerWebSocket<SocketData>, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

function broadcastPanes(): void {
  const msg: ServerMessage = { t: "panes", panes: [...panes.values()].map((p) => p.state) };
  const json = JSON.stringify(msg);
  for (const ws of sockets) ws.send(json);
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function spawn(provider: Provider): void {
  const id = `pane_${++counter}`;
  const argv = ARGV[provider];
  let paneRef: Pane | undefined;
  const pty = new Pty({
    argv,
    cwd: CWD,
    scrollback: SCROLLBACK,
    onData: () => {
      if (paneRef) paneRef.state.lastOutputAt = Date.now();
    },
    onExit: (code) => {
      if (paneRef) paneRef.state.exit = code;
      broadcastPanes();
    },
  });
  const pane: Pane = {
    pty,
    state: { id, provider, pid: pty.pid, exit: null, lastOutputAt: Date.now() },
  };
  paneRef = pane;
  panes.set(id, pane);
  broadcastPanes();
}

function attach(ws: Bun.ServerWebSocket<SocketData>, id: string): void {
  const pane = panes.get(id);
  if (!pane || ws.data.attached.has(id)) return;
  ws.data.attached.add(id);
  send(ws, { t: "replay", id, b64: b64(pane.pty.replay()) });
  const off = pane.pty.subscribe({
    data: (chunk) => send(ws, { t: "data", id, b64: b64(chunk) }),
    exit: (code) => send(ws, { t: "exit", id, code }),
  });
  ws.data.unsubscribe.set(id, off);
}

function detach(ws: Bun.ServerWebSocket<SocketData>, id: string): void {
  ws.data.unsubscribe.get(id)?.();
  ws.data.unsubscribe.delete(id);
  ws.data.attached.delete(id);
}

Bun.serve<SocketData>({
  port: PORT,
  fetch(req, server) {
    if (new URL(req.url).pathname === "/ws") {
      const ok = server.upgrade(req, {
        data: { attached: new Set<string>(), unsubscribe: new Map<string, () => void>() },
      });
      return ok ? undefined : new Response("upgrade failed", { status: 400 });
    }
    return new Response("pane experiment 2", { status: 200 });
  },
  websocket: {
    open(ws) {
      sockets.add(ws);
      send(ws, { t: "panes", panes: [...panes.values()].map((p) => p.state) });
    },
    close(ws) {
      for (const off of ws.data.unsubscribe.values()) off();
      sockets.delete(ws);
    },
    message(ws, raw) {
      const msg = JSON.parse(String(raw)) as ClientMessage;
      switch (msg.t) {
        case "spawn":
          spawn(msg.provider);
          break;
        case "attach":
          attach(ws, msg.id);
          break;
        case "detach":
          detach(ws, msg.id);
          break;
        case "input":
          panes.get(msg.id)?.pty.write(msg.data);
          break;
        case "remove": {
          const pane = panes.get(msg.id);
          if (!pane) break;
          panes.delete(msg.id);
          for (const s of sockets) detach(s, msg.id);
          void pane.pty.stop();
          broadcastPanes();
          break;
        }
      }
    },
  },
});

console.log(`pane daemon on :${PORT}, panes run in ${CWD}`);
