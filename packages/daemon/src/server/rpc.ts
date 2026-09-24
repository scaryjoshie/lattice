import { isRequest, type Message, type Methods, type Notification, type Notifications, type Request, type Response } from "@lattice/protocol";
import type { Agents } from "../agents/agents.ts";
import type { Document } from "../document/document.ts";

/**
 * Requests to answers, whatever transport they came over. One handler per method, typed
 * by the protocol. A client is anything that can be sent a line; the server keeps the
 * set so a change reaches every window.
 */
export interface Client {
  send(message: Message): void;
}

export class Rpc {
  private clients = new Set<Client>();

  constructor(
    private readonly document: Document,
    private readonly agents: Agents,
    private readonly home: string,
  ) {
    document.onChange((grid, dc, dr) => this.notify("grid", { grid, dc, dr }));
    agents.onChange((facts) => this.notify("facts", { facts }));
  }

  /** A client arrived: it gets the state as it is, then every change. */
  attach(client: Client): () => void {
    this.clients.add(client);
    client.send({ jsonrpc: "2.0", method: "grid", params: { grid: this.document.current(), dc: 0, dr: 0 } });
    client.send({ jsonrpc: "2.0", method: "facts", params: { facts: this.agents.current() } });
    return () => this.clients.delete(client);
  }

  /** One message in, at most one reply out. */
  handle(message: Message): Response | null {
    if (!isRequest(message)) return null;
    try {
      return { jsonrpc: "2.0", id: message.id, result: this.answer(message) };
    } catch (e) {
      return { jsonrpc: "2.0", id: message.id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } };
    }
  }

  private answer(request: Request): Methods[keyof Methods]["result"] {
    switch (request.method) {
      case "hello":
        return { version: "0.0.0", home: this.home };
      case "run": {
        const { command, mark } = request.params as Methods["run"]["params"];
        return this.document.run(command, mark);
      }
      case "undo":
        return this.document.undo((request.params as Methods["undo"]["params"]).mark);
      case "redo":
        return this.document.redo((request.params as Methods["redo"]["params"]).mark);
      case "start": {
        const { host, occupant } = request.params as Methods["start"]["params"];
        this.agents.start(host, occupant);
        return { ok: true };
      }
      case "stop":
        this.agents.stop((request.params as Methods["stop"]["params"]).host);
        return { ok: true };
      default:
        throw new Error(`no such method: ${String((request as { method: unknown }).method)}`);
    }
  }

  private notify<N extends keyof Notifications>(method: N, params: Notifications[N]): void {
    const message: Notification<N> = { jsonrpc: "2.0", method, params };
    for (const client of this.clients) client.send(message);
  }
}
