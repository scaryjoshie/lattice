import type { Message, Methods, Notifications, Response } from "@lattice/protocol";

/**
 * The daemon, from the app's side: one WebSocket speaking JSON-RPC 2.0. Where the daemon
 * is comes from the session the shell hands the webview, or, in a browser during
 * development, from the dev server, which reads the same file. The app never reads the
 * file itself. Reconnects with a short backoff, and says whether it is connected so the
 * app can refuse commands it cannot deliver.
 */
type Listener<N extends keyof Notifications> = (params: Notifications[N]) => void;

declare global {
  interface Window {
    __lattice?: { port: number; token: string };
  }
}

async function session(): Promise<{ port: number; token: string }> {
  if (window.__lattice) return window.__lattice;
  const res = await fetch("/__lattice/session");
  if (!res.ok) throw new Error("no daemon session");
  return (await res.json()) as { port: number; token: string };
}

export class Client {
  private socket: WebSocket | null = null;
  private waiting = new Map<number, { resolve(r: unknown): void; reject(e: Error): void }>();
  private listeners = new Map<keyof Notifications, Set<Listener<keyof Notifications>>>();
  private n = 0;
  private stopped = false;
  connected = false;
  onState: (connected: boolean) => void = () => {};

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
    return () => set.delete(listen as Listener<keyof Notifications>);
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
    socket.onopen = () => {
      this.connected = true;
      this.onState(true);
    };
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
        for (const listen of this.listeners.get(message.method) ?? []) listen(message.params as never);
      }
    };
    socket.onclose = () => {
      this.connected = false;
      this.onState(false);
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
