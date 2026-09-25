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

  test("a terminal host runs a shell: attach, type, see it, and only attached windows hear", async () => {
    // A plain shell, so the test does not depend on anyone's login profile.
    const shell = process.env.SHELL;
    process.env.SHELL = "/bin/sh";
    daemon = start();
    const a = await connect();
    const b = await connect();
    await a.call("hello");
    const grid = (a.notes[0] as any).params.grid;
    const host = grid.tiles.find((t: any) => t.family === "host").id;
    const text = grid.tiles.find((t: any) => t.family === "text").id;
    expect((await a.call("attach", { host: text, cols: 80, rows: 24 })).result.ok).toBe(false);
    const attached = await a.call("attach", { host, cols: 80, rows: 24 });
    expect(attached.result.ok).toBe(true);
    expect(typeof attached.result.screen).toBe("string");
    const heard = (c: typeof a) =>
      c.notes
        .filter((m: any) => m.method === "output" && m.params.host === host)
        .map((m: any) => Buffer.from(m.params.data, "base64").toString())
        .join("");
    await a.call("input", { host, data: "echo lattice-$((20+22))\r" });
    const until = async (ok: () => boolean) => {
      for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 30));
    };
    await until(() => heard(a).includes("lattice-42"));
    expect(heard(a)).toContain("lattice-42");
    expect(heard(b)).toBe("");
    // Exiting the shell is heard, and the next attach starts a fresh one.
    await a.call("input", { host, data: "exit\r" });
    await until(() => a.notes.some((m: any) => m.method === "exited" && m.params.host === host));
    expect(a.notes.some((m: any) => m.method === "exited" && m.params.host === host)).toBe(true);
    expect((await a.call("attach", { host, cols: 80, rows: 24 })).result.ok).toBe(true);
    // Removing the host stops its terminal: input then reaches nothing.
    await a.call("run", { command: { kind: "remove", id: host } });
    expect((await a.call("input", { host, data: "echo gone\r" })).result.ok).toBe(false);
    a.end();
    b.end();
    process.env.SHELL = shell;
  });
});
