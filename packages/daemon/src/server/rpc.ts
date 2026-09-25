import { isRequest, type Message, type Methods, type Notification, type Notifications, type Request, type Response } from "@lattice/protocol";
import { isRun } from "@lattice/model";
import type { Agents } from "../agents/agents.ts";
import type { Document } from "../document/document.ts";
import type { Terminals } from "../terminals/terminals.ts";

/**
 * Requests to answers, whatever transport they came over. One handler per method, typed
 * by the protocol. A client is anything that can be sent a line; the server keeps the
 * set so a change reaches every window, and for each window the terminals it is attached
 * to, so a terminal's output goes only to the windows showing it.
 */
export interface Client {
  send(message: Message): void;
}

export class Rpc {
  private clients = new Set<Client>();
  /** Each window's attached terminals, by host, and how to stop sending it their output. */
  private attached = new Map<Client, Map<string, () => void>>();

  constructor(
    private readonly document: Document,
    private readonly agents: Agents,
    private readonly terminals: Terminals,
    private readonly home: string,
  ) {
    document.onChange((grid, dc, dr) => this.notify("grid", { grid, dc, dr }));
    agents.onChange((facts) => this.notify("facts", { facts }));
  }

  /** A client arrived: it gets the state as it is, then every change. */
  attach(client: Client): () => void {
    this.clients.add(client);
    this.attached.set(client, new Map());
    client.send({ jsonrpc: "2.0", method: "grid", params: { grid: this.document.current(), dc: 0, dr: 0 } });
    client.send({ jsonrpc: "2.0", method: "facts", params: { facts: this.agents.current() } });
    return () => {
      for (const stop of this.attached.get(client)?.values() ?? []) stop();
      this.attached.delete(client);
      this.clients.delete(client);
    };
  }

  /** One message in, at most one reply out. */
  async handle(message: Message, client: Client): Promise<Response | null> {
    if (!isRequest(message)) return null;
    try {
      return { jsonrpc: "2.0", id: message.id, result: await this.answer(message, client) };
    } catch (e) {
      return { jsonrpc: "2.0", id: message.id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } };
    }
  }

  private async answer(request: Request, client: Client): Promise<Methods[keyof Methods]["result"]> {
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
      case "attach": {
        const { host, cols, rows } = request.params as Methods["attach"]["params"];
        if (!this.isTerminal(host)) return { ok: false };
        const pty = this.terminals.ensure(host, cols, rows);
        pty.resize(cols, rows);
        const mine = this.attached.get(client);
        mine?.get(host)?.();
        // The screen first, then what follows it: subscribing before the snapshot is taken
        // would send output the screen already includes.
        const screen = await pty.snapshot();
        const stop = pty.subscribe({
          data: (chunk) => client.send({ jsonrpc: "2.0", method: "output", params: { host, data: Buffer.from(chunk).toString("base64") } }),
          exit: (code) => client.send({ jsonrpc: "2.0", method: "exited", params: { host, code } }),
        });
        mine?.set(host, stop);
        return { ok: true, screen };
      }
      case "input": {
        const { host, data } = request.params as Methods["input"]["params"];
        const pty = this.terminals.get(host);
        pty?.write(data);
        return { ok: pty !== undefined };
      }
      case "resize": {
        const { host, cols, rows } = request.params as Methods["resize"]["params"];
        const pty = this.terminals.get(host);
        pty?.resize(cols, rows);
        return { ok: pty !== undefined };
      }
      case "detach": {
        const { host } = request.params as Methods["detach"]["params"];
        const mine = this.attached.get(client);
        mine?.get(host)?.();
        mine?.delete(host);
        return { ok: true };
      }
      default:
        throw new Error(`no such method: ${String((request as { method: unknown }).method)}`);
    }
  }

  /** A host on the grid whose surface is a terminal. */
  private isTerminal(host: string): boolean {
    const tile = this.document.current().tiles.find((t) => t.id === host);
    return tile !== undefined && !isRun(tile) && tile.surface === "terminal";
  }

  private notify<N extends keyof Notifications>(method: N, params: Notifications[N]): void {
    const message: Notification<N> = { jsonrpc: "2.0", method, params };
    for (const client of this.clients) client.send(message);
  }
}
