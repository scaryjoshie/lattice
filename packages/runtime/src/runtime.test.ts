import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Id, openKernel, SYSTEM_ACTOR_ID } from "@pane/kernel";
import { Runtime } from "./runtime.ts";
import type { Launch, LaunchContext, LaunchMode, Provider } from "./types.ts";

/** A provider whose "host" is `cat`: it echoes whatever is typed into the PTY. */
class FakeProvider implements Provider {
  readonly name = "fake";
  readonly label = "Fake";
  launches: LaunchMode[] = [];
  async launch(_ctx: LaunchContext, mode: LaunchMode): Promise<Launch> {
    this.launches.push(mode);
    return { argv: ["bash", "-c", "cat"], env: { FAKE: "1" }, tempFiles: [] };
  }
  async sessionKey(): Promise<string | null> {
    return "fake-1";
  }
  async status() {
    return { installed: true, version: "0", loggedIn: true, account: null, loginCommand: "" };
  }
}

const dirs: string[] = [];
const runtimes: Runtime[] = [];

function world() {
  const dir = mkdtempSync(join(tmpdir(), "pane-rt-"));
  dirs.push(dir);
  const k = openKernel(":memory:");
  const me = k.commands.createHuman(SYSTEM_ACTOR_ID, { name: "Josh" }).id;
  const project = k.commands.createProject(me, { name: "P" });
  const { repository } = k.commands.addRepository(me, {
    projectId: project.id,
    name: "r",
    mode: "adopted",
    gitDir: join(dir, ".git"),
    defaultBranch: "main",
    mainPath: dir,
  });
  const wt = k.commands.createWorktree(me, {
    repositoryId: repository.id,
    name: "w",
    branch: "w",
    path: join(dir, "w"),
  });
  const cwd = mkdtempSync(join(dir, "cwd-"));
  const agent = k.commands.createAgent(me, {
    projectId: project.id,
    name: "A",
    provider: "fake",
    worktreeId: wt.id,
  });
  // The PTY runs in the assigned worktree's path; point it at a directory that exists.
  k.store.update("worktrees", { id: wt.id }, { path: cwd });
  const provider = new FakeProvider();
  const runtime = new Runtime({
    kernel: k,
    providers: [provider],
    socketPath: join(dir, "pane.sock"),
    mcpCommand: ["bun", "mcp.ts"],
    mcpTools: [],
    attachCommand: ["bun", "cli.ts", "attach"],
    systemPrompt: (a, w) => `You are ${a.name} in ${w.name}.`,
  });
  runtimes.push(runtime);
  return { k, me, project, wt, agent, provider, runtime };
}

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("timed out");
    await Bun.sleep(25);
  }
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((r) => r.shutdown()));
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("runtime", () => {
  test("ensureOnline spawns once, records lifecycle and session key", async () => {
    const { k, agent, runtime, provider } = world();
    await runtime.ensureOnline(agent.id);
    await runtime.ensureOnline(agent.id);
    expect(provider.launches).toEqual([{ kind: "fresh" }]);
    expect(k.store.agent(agent.id)?.lifecycle).toBe("online");
    await until(() => k.store.agent(agent.id)?.sessionKey === "fake-1");
    const p = runtime.presence(agent.id);
    expect(p.running).toBe(true);
    expect(p.pid).not.toBeNull();
  });

  test("send pastes into the terminal and late subscribers get the replay", async () => {
    const { agent, runtime } = world();
    const r = await runtime.send(agent.id, "hello there");
    expect(r).toEqual({ ok: true, via: "terminal" });
    const term = runtime.terminal(agent.id);
    if (!term) throw new Error("no terminal");
    await until(() => new TextDecoder().decode(term.replay()).includes("hello there"));
    const seen: string[] = [];
    const off = term.subscribe({
      data: (c) => seen.push(new TextDecoder().decode(c)),
      exit: () => undefined,
    });
    term.write("ping\r");
    await until(() => seen.join("").includes("ping"));
    off();
  });

  test("a message posted in the room is delivered into the agent", async () => {
    const { k, me, wt, agent, runtime } = world();
    const room = k.store.conversationByKey(`group:${wt.id}`);
    if (!room) throw new Error("no room");
    const { message } = k.commands.postMessage(me, {
      conversationId: room.id,
      body: "Start here.",
    });
    await until(() => k.store.delivery(message.id, agent.id)?.status === "delivered");
    expect(k.store.delivery(message.id, agent.id)?.detail).toBe("terminal");
    const term = runtime.terminal(agent.id);
    if (!term) throw new Error("no terminal");
    await until(() =>
      new TextDecoder().decode(term.replay()).includes(`[pane ${room.id}] Josh → #w: Start here.`),
    );
  });

  test("stop suspends and keeps the session; the next ensureOnline resumes", async () => {
    const { k, agent, runtime, provider } = world();
    await runtime.ensureOnline(agent.id);
    await until(() => k.store.agent(agent.id)?.sessionKey === "fake-1");
    const pid = runtime.presence(agent.id).pid;
    await runtime.stop(agent.id);
    expect(k.store.agent(agent.id)?.lifecycle).toBe("suspended");
    expect(k.store.agent(agent.id)?.sessionKey).toBe("fake-1");
    expect(runtime.presence(agent.id).running).toBe(false);
    expect(runtime.terminal(agent.id)).toBeUndefined();
    if (pid !== null) {
      expect(() => process.kill(pid, 0)).toThrow();
    }
    await runtime.ensureOnline(agent.id);
    expect(provider.launches.at(-1)).toEqual({ kind: "resume", sessionKey: "fake-1" });
    expect(k.store.agent(agent.id)?.lifecycle).toBe("online");
  });

  test("a process that exits on its own goes offline", async () => {
    const { k, agent, runtime } = world();
    await runtime.ensureOnline(agent.id);
    const term = runtime.terminal(agent.id);
    if (!term) throw new Error("no terminal");
    term.write("\x04");
    await until(() => k.store.agent(agent.id)?.lifecycle === "offline");
    expect(runtime.presence(agent.id).running).toBe(false);
  });

  test("fork creates a second agent from the source session", async () => {
    const { k, agent, runtime, provider } = world();
    await runtime.ensureOnline(agent.id);
    await until(() => k.store.agent(agent.id)?.sessionKey === "fake-1");
    const fork = await runtime.fork(agent.id, "B");
    expect(fork.forkedFromId).toBe(agent.id);
    expect(fork.lifecycle).toBe("online");
    expect(provider.launches.at(-1)).toEqual({ kind: "fork", fromSessionKey: "fake-1" });
    expect(k.query.agentPlacement(k.store, fork.id).assignedTo).toBe(
      k.query.agentPlacement(k.store, agent.id).assignedTo,
    );
  });

  test("archive is final and tokens verify", async () => {
    const { k, agent, runtime } = world();
    await runtime.ensureOnline(agent.id);
    expect(runtime.verifyToken(agent.id, "nope")).toBe(false);
    await runtime.archive(agent.id);
    expect(k.store.agent(agent.id)?.lifecycle).toBe("archived");
    await expect(runtime.ensureOnline(agent.id)).rejects.toThrow(/archived/);
  });

  test("lifecycle events fire on start and exit", async () => {
    const { agent, runtime } = world();
    const seen: Array<[Id<"agent">, boolean]> = [];
    runtime.on("lifecycle", (id, running) => seen.push([id, running]));
    await runtime.ensureOnline(agent.id);
    await runtime.stop(agent.id);
    expect(seen).toEqual([
      [agent.id, true],
      [agent.id, false],
    ]);
  });
});
