import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frame, type Message, unframe } from "@lattice/protocol";
import { paths } from "./core/paths.ts";
import { start } from "./main.ts";

/** A client over the Unix socket: sends a request, resolves with its reply, and keeps
 *  every notification in the order it came. */
async function connect(): Promise<{ call(method: string, params?: unknown): Promise<any>; notes: Message[]; end(): void }> {
  const notes: Message[] = [];
  const waiting = new Map<number, (r: any) => void>();
  let buffer = "";
  let n = 0;
  const socket = await Bun.connect<undefined>({
    unix: paths().socket,
    socket: {
      data(_s, chunk) {
        const out = unframe(buffer + chunk.toString());
        buffer = out.rest;
        for (const m of out.messages) {
          if ("id" in m && !("method" in m)) waiting.get(m.id)?.(m);
          else notes.push(m);
        }
      },
    },
  });
  return {
    notes,
    call(method, params = {}) {
      const id = ++n;
      return new Promise((resolve) => {
        waiting.set(id, resolve);
        socket.write(frame({ jsonrpc: "2.0", id, method: method as never, params: params as never }));
      });
    },
    end: () => socket.end(),
  };
}

let home: string;
let daemon: ReturnType<typeof start> | null = null;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "lattice-"));
  process.env.LATTICE_HOME = home;
});
afterEach(() => {
  daemon?.close();
  daemon = null;
  rmSync(home, { recursive: true, force: true });
});

describe("the daemon", () => {
  test("answers hello and sends the grid and the facts on arrival", async () => {
    daemon = start();
    const c = await connect();
    const hello = await c.call("hello");
    expect(hello.result.home).toBe(home);
    expect(c.notes.map((m) => (m as { method: string }).method)).toEqual(["grid", "facts"]);
    const grid = (c.notes[0] as any).params.grid;
    expect(grid.tiles.length).toBe(14);
    c.end();
  });

  test("runs a command, notifying every client before it replies, and undoes it with its mark", async () => {
    daemon = start();
    const a = await connect();
    const b = await connect();
    await a.call("hello");
    const seen: string[] = [];
    const before = a.notes.length;
    const reply = await a.call("run", { command: { kind: "place", ci: 0, ri: 0, what: { family: "host", surface: "terminal" } }, mark: { tile: "x" } });
    seen.push(...a.notes.slice(before).map((m) => (m as { method: string }).method));
    expect(reply.result.ok).toBe(true);
    expect(seen).toEqual(["grid"]);
    expect((a.notes.at(-1) as any).params.grid.tiles.length).toBe(15);
    // The other client saw it too.
    await new Promise((r) => setTimeout(r, 20));
    expect((b.notes.at(-1) as any).params.grid.tiles.length).toBe(15);
    const undone = await a.call("undo", { mark: { tile: "y" } });
    expect(undone.result).toEqual({ ok: true, mark: { tile: "x" } });
    expect((a.notes.at(-1) as any).params.grid.tiles.length).toBe(14);
    const redone = await a.call("redo", { mark: null });
    expect(redone.result).toEqual({ ok: true, mark: { tile: "y" } });
    a.end();
    b.end();
  });

  test("the document survives a restart; undo history does not", async () => {
    daemon = start();
    let c = await connect();
    await c.call("run", { command: { kind: "place", ci: 0, ri: 0, what: { family: "host", surface: "terminal" } } });
    c.end();
    daemon.close();
    daemon = start();
    c = await connect();
    await c.call("hello");
    expect((c.notes[0] as any).params.grid.tiles.length).toBe(15);
    expect((await c.call("undo", {})).result.ok).toBe(false);
    c.end();
  });

  test("starting an occupant is a fact every client hears", async () => {
    daemon = start();
    const c = await connect();
    await c.call("hello");
    const grid = (c.notes[0] as any).params.grid;
    const host = grid.tiles.find((t: any) => t.family === "host").id;
    await c.call("start", { host, occupant: "codex" });
    const facts = (c.notes.at(-1) as any);
    expect(facts.method).toBe("facts");
    expect(facts.params.facts.hosting[host]).toBe("codex");
    c.end();
  });

  test("the WebSocket door needs the token", async () => {
    daemon = start();
    const { port, token } = daemon.session;
    const refused = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=wrong`);
      ws.onerror = () => resolve(true);
      ws.onclose = () => resolve(true);
      ws.onopen = () => resolve(false);
    });
    expect(refused).toBe(true);
    const first = await new Promise<any>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`);
      ws.onmessage = (e) => { resolve(JSON.parse(String(e.data))); ws.close(); };
    });
    expect(first.method).toBe("grid");
  });
});
