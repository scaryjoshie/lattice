import type { Message, Methods, Notifications, Response } from "@lattice/protocol";

/**
 * The daemon, from the app's side: one WebSocket speaking JSON-RPC 2.0. Where the daemon
 * is comes from the session the shell hands the webview, or, in a browser during
 * development, from the dev server, which reads the same file. The app never reads the
 * file itself. Reconnects with a short backoff, and says whether it is connected so the
 * app can refuse commands it cannot deliver.
 *
 * A listener that arrives late is told the state as it is: whether it is connected, and
 * the last of each notification that is state rather than an event, the way the daemon
 * greets a client that attaches. So a store made after the connection opened, as hot
 * reload makes them, is not left believing it is offline with an empty grid. A terminal's
 * output is an event: a late listener is not handed someone else's last chunk.
 */
type Listener<N extends keyof Notifications> = (params: Notifications[N]) => void;

/** Notifications that say what is, as opposed to what happened. */
const STATE: ReadonlySet<keyof Notifications> = new Set(["grid", "facts", "history"]);

declare global {
  interface Window {
    /** Set by the shell before the first script runs; null when it found no daemon. */
    __lattice?: { port: number; token: string } | null;
  }
}

async function session(): Promise<{ port: number; token: string }> {
  if (window.__lattice) return window.__lattice;
  if (window.__lattice === null) throw new Error("the shell found no daemon");
  const res = await fetch("/__lattice/session");
  if (!res.ok) throw new Error("no daemon session");
  return (await res.json()) as { port: number; token: string };
}

export class Client {
  private socket: WebSocket | null = null;
  private waiting = new Map<number, { resolve(r: unknown): void; reject(e: Error): void }>();
  private listeners = new Map<keyof Notifications, Set<Listener<keyof Notifications>>>();
  private last = new Map<keyof Notifications, unknown>();
  private states = new Set<(connected: boolean) => void>();
  private n = 0;
  private stopped = false;
  private connected = false;

  start(): void {
    this.stopped = false;
    void this.open();
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
  }

  on<N extends keyof Notifications>(method: N, listen: Listener<N>): () => void {
    const set = this.listeners.get(method) ?? new Set();
    set.add(listen as Listener<keyof Notifications>);
    this.listeners.set(method, set);
    if (this.last.has(method)) listen(this.last.get(method) as Notifications[N]);
    return () => set.delete(listen as Listener<keyof Notifications>);
  }

  /** Whether it is connected, now and on every change. */
  onState(listen: (connected: boolean) => void): () => void {
    this.states.add(listen);
    listen(this.connected);
    return () => this.states.delete(listen);
  }

  private setConnected(connected: boolean): void {
    this.connected = connected;
    for (const listen of this.states) listen(connected);
  }

  call<M extends keyof Methods>(method: M, params: Methods[M]["params"]): Promise<Methods[M]["result"]> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("not connected"));
    const id = ++this.n;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve: resolve as (r: unknown) => void, reject });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  private async open(): Promise<void> {
    let where: { port: number; token: string };
    try {
      where = await session();
    } catch {
      this.retry();
      return;
    }
    const socket = new WebSocket(`ws://127.0.0.1:${where.port}/?token=${where.token}`);
    this.socket = socket;
    socket.onopen = () => this.setConnected(true);
    socket.onmessage = (e) => {
      const message = JSON.parse(String(e.data)) as Message;
      if ("id" in message) {
        const reply = message as Response;
        const pending = this.waiting.get(reply.id);
        this.waiting.delete(reply.id);
        if (!pending) return;
        if (reply.error) pending.reject(new Error(reply.error.message));
        else pending.resolve(reply.result);
      } else {
        if (STATE.has(message.method)) this.last.set(message.method, message.params);
        for (const listen of this.listeners.get(message.method) ?? []) listen(message.params as never);
      }
    };
    socket.onclose = () => {
      // A socket replaced by a newer one says nothing about the connection.
      if (this.socket !== socket) return;
      this.setConnected(false);
      for (const pending of this.waiting.values()) pending.reject(new Error("disconnected"));
      this.waiting.clear();
      this.retry();
    };
    socket.onerror = () => socket.close();
  }

  private retry(): void {
    if (this.stopped) return;
    setTimeout(() => void this.open(), 800);
  }
}

/** The one connection, shared by every store. */
export const client = new Client();
