import type { Id } from "@pane/kernel";
import type { AgentPresence, ClientFrame, ServerFrame } from "@pane/protocol";
import type { Runtime } from "@pane/runtime";
import type { ServerWebSocket } from "bun";

/**
 * The WebSocket hub: every client gets every kernel event and presence change;
 * a client subscribes to agent terminals one at a time.
 */

interface Client {
  terminals: Map<Id<"agent">, () => void>;
}

export class Hub {
  private readonly clients = new Map<ServerWebSocket<Client>, Client>();

  constructor(
    private readonly runtime: Runtime,
    private readonly presence: () => AgentPresence[],
  ) {}

  broadcast(frame: ServerFrame): void {
    const text = JSON.stringify(frame);
    for (const ws of this.clients.keys()) ws.send(text);
  }

  open(ws: ServerWebSocket<Client>): void {
    this.clients.set(ws, ws.data);
    ws.send(JSON.stringify({ type: "presence", agents: this.presence() } satisfies ServerFrame));
  }

  close(ws: ServerWebSocket<Client>): void {
    for (const off of ws.data.terminals.values()) off();
    ws.data.terminals.clear();
    this.clients.delete(ws);
  }

  message(ws: ServerWebSocket<Client>, raw: string | Buffer): void {
    let frame: ClientFrame;
    try {
      frame = JSON.parse(String(raw)) as ClientFrame;
    } catch {
      return;
    }
    const term = this.runtime.terminal(frame.agentId);
    switch (frame.type) {
      case "terminal.open": {
        ws.data.terminals.get(frame.agentId)?.();
        if (!term) {
          ws.send(
            JSON.stringify({
              type: "terminal.exit",
              agentId: frame.agentId,
              code: null,
            } satisfies ServerFrame),
          );
          return;
        }
        term.resize(frame.cols, frame.rows);
        const send = (data: Uint8Array) =>
          ws.send(
            JSON.stringify({
              type: "terminal",
              agentId: frame.agentId,
              data: Buffer.from(data).toString("base64"),
            } satisfies ServerFrame),
          );
        send(term.replay());
        const off = term.subscribe({
          data: send,
          exit: (code) =>
            ws.send(
              JSON.stringify({
                type: "terminal.exit",
                agentId: frame.agentId,
                code,
              } satisfies ServerFrame),
            ),
        });
        ws.data.terminals.set(frame.agentId, off);
        return;
      }
      case "terminal.input":
        term?.write(frame.data);
        return;
      case "terminal.resize":
        term?.resize(frame.cols, frame.rows);
        return;
      case "terminal.close":
        ws.data.terminals.get(frame.agentId)?.();
        ws.data.terminals.delete(frame.agentId);
        return;
    }
  }

  static data(): Client {
    return { terminals: new Map() };
  }
}

export type { Client };
