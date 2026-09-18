import { mkdirSync } from "node:fs";
import { createGit } from "@pane/git";
import { openKernel } from "@pane/kernel";
import { builtinProviders, Runtime } from "@pane/runtime";
import { agentTools } from "./agentTools.ts";
import { Ask } from "./ask.ts";
import { type Config, configFromEnv, loginShellPath } from "./config.ts";
import { createHttp } from "./http.ts";
import { ensureHuman } from "./human.ts";
import { createOperations } from "./operations.ts";
import { systemPrompt } from "./prompt.ts";
import { createRpc } from "./rpc.ts";
import type { Services } from "./services.ts";
import { startSummaries } from "./summaries.ts";
import { Hub } from "./ws.ts";

/** The composition root: one of everything, wired, then two listeners. */
export async function startDaemon(config: Config = configFromEnv()) {
  mkdirSync(config.home, { recursive: true, mode: 0o700 });
  const kernel = openKernel(config.dbPath);
  const git = createGit();
  const human = await ensureHuman(kernel, git);
  const runtime = new Runtime({
    kernel,
    providers: builtinProviders(),
    socketPath: config.socketPath,
    mcpCommand: config.mcpCommand,
    mcpTools: agentTools.map((t) => t.name),
    attachCommand: config.attachCommand,
    systemPrompt: (agent, worktree) =>
      systemPrompt(agent, worktree, kernel.store.project(worktree.projectId)?.name ?? "Pane"),
  });
  const s: Services = { config, kernel, git, runtime, human };
  const ask = new Ask(s);
  const ops = createOperations(s, ask);
  const hub = new Hub(runtime, () => runtime.allPresence());
  const stopSummaries = config.summaries ? startSummaries(s) : () => undefined;

  const offEvents = kernel.subscribe((event) => hub.broadcast({ type: "event", event }));
  const offPresence = runtime.on("presence", () =>
    hub.broadcast({ type: "presence", agents: runtime.allPresence() }),
  );
  const offLifecycle = runtime.on("lifecycle", () =>
    hub.broadcast({ type: "presence", agents: runtime.allPresence() }),
  );

  const rpc = createRpc(s, ops);
  const http = createHttp(s, ops, hub);

  async function stop(): Promise<void> {
    offEvents();
    offPresence();
    offLifecycle();
    stopSummaries();
    await runtime.shutdown();
    rpc.stop();
    http.server.stop(true);
    kernel.close();
  }

  return { config, kernel, runtime, ops, http, rpc, stop };
}

if (import.meta.main) {
  const path = loginShellPath();
  if (path) process.env.PATH = path;
  const d = await startDaemon();
  console.log(
    `pane daemon on http://localhost:${d.config.port}  socket ${d.rpc.path}  db ${d.config.dbPath}`,
  );
  const shutdown = () => {
    void d.stop().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
