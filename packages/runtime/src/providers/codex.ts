import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  DeliveryOutcome,
  Launch,
  LaunchContext,
  LaunchMode,
  Provider,
  SessionPresence,
} from "../types.ts";
import { cwdOf, openFiles, tryRun } from "../util/ps.ts";

/**
 * Codex (OpenAI).
 *
 * Identity: the thread id of the process's root thread, learned from the lock file
 * it holds once the first turn starts. Delivery: `codex queue --thread`.
 * Presence: the rollout file's mtime.
 */

const codexHome = () => process.env.CODEX_HOME ?? join(homedir(), ".codex");

interface Thread {
  id: string;
  rolloutPath?: string;
  root: boolean;
  cwd?: string;
}

/** A TOML string literal. */
const toml = (s: string) => JSON.stringify(s);

/**
 * Codex asks whether a directory is trusted the first time it starts there, keyed by
 * the repository root, and the dialog would hold the session. Pane made the worktree,
 * so it records the trust where Codex records it itself: `~/.codex/config.toml`.
 */
function trustFolder(worktreePath: string): void {
  const file = join(codexHome(), "config.toml");
  let config = "";
  try {
    config = existsSync(file) ? readFileSync(file, "utf8") : "";
  } catch {
    return;
  }
  const paths = new Set([worktreePath]);
  const root = repositoryRoot(worktreePath);
  if (root) paths.add(root);
  let add = "";
  for (const p of paths) {
    if (config.includes(`[projects.${toml(p)}]`)) continue;
    add += `\n[projects.${toml(p)}]\ntrust_level = "trusted"\n`;
  }
  if (!add) return;
  const sep = config.length && !config.endsWith("\n") ? "\n" : "";
  appendFileSync(file, sep + add);
}

/** The main checkout of a linked worktree, from its `.git` pointer file; null for a main checkout. */
function repositoryRoot(worktreePath: string): string | null {
  const dotGit = join(worktreePath, ".git");
  try {
    const stat = statSync(dotGit);
    if (stat.isDirectory()) return null;
    const m = readFileSync(dotGit, "utf8").match(/^gitdir:\s*(.+)$/m);
    const gitDir = m?.[1]?.trim();
    if (!gitDir) return null;
    const i = gitDir.indexOf("/.git/worktrees/");
    return i > 0 ? gitDir.slice(0, i) : dirname(gitDir);
  } catch {
    return null;
  }
}

function threadMeta(id: string): Thread {
  const t: Thread = { id, root: false };
  try {
    // immutable=1: read without locks or a -shm sidecar.
    const db = new Database(`file:${join(codexHome(), "state_5.sqlite")}?immutable=1`, {
      readonly: true,
    });
    try {
      const row = db
        .query<
          { rollout_path: string | null; cwd: string | null; thread_source: string | null },
          [string]
        >("SELECT rollout_path, cwd, thread_source FROM threads WHERE id = ?")
        .get(id);
      if (row) {
        t.rolloutPath = row.rollout_path ?? undefined;
        t.cwd = row.cwd ?? undefined;
        t.root = row.thread_source === "user";
      }
    } finally {
      db.close();
    }
  } catch {
    /* fall through to the rollout header */
  }
  if (!t.root && t.rolloutPath && existsSync(t.rolloutPath)) {
    try {
      const head = JSON.parse(readFileSync(t.rolloutPath, "utf8").split("\n")[0] ?? "") as {
        payload?: { thread_source?: unknown; source?: unknown; cwd?: string };
      };
      const p = head.payload ?? {};
      if (p.thread_source === "user" || p.source === "cli") t.root = true;
      t.cwd ??= p.cwd;
    } catch {
      /* unreadable header: stays unknown */
    }
  }
  return t;
}

async function threadsForPid(pid: number): Promise<Thread[]> {
  const ids = new Set<string>();
  for (const f of await openFiles(pid)) {
    const m = f.match(/thread-writer-locks\/([0-9a-f-]{36})\.lock$/);
    if (m?.[1]) ids.add(m[1]);
  }
  const threads = [...ids].map(threadMeta);
  const only = threads[0];
  if (threads.length === 1 && only && !only.root) only.root = true;
  return threads;
}

export class CodexProvider implements Provider {
  readonly name = "codex";
  readonly label = "Codex";

  async launch(ctx: LaunchContext, mode: LaunchMode): Promise<Launch> {
    const { identity } = ctx;
    trustFolder(ctx.worktree.path);
    const env = {
      PANE_AGENT_ID: identity.agentId,
      PANE_TOKEN: identity.token,
      PANE_SOCKET: identity.socket,
    };
    const [cmd = "", ...args] = ctx.mcpCommand;
    const config = [
      "-c",
      `mcp_servers.pane.command=${toml(cmd)}`,
      "-c",
      `mcp_servers.pane.args=[${args.map(toml).join(", ")}]`,
      "-c",
      `mcp_servers.pane.env={${Object.entries(env)
        .map(([k, v]) => `${k}=${toml(v)}`)
        .join(", ")}}`,
    ];
    // Codex asks before each MCP tool unless the tool is pre-approved.
    for (const t of ctx.mcpTools) {
      config.push("-c", `mcp_servers.pane.tools.${t}.approval_mode="approve"`);
    }
    if (ctx.agent.model) config.push("-c", `model=${toml(ctx.agent.model)}`);
    let argv: string[];
    switch (mode.kind) {
      case "fresh":
        argv = ["codex", ...config, `System context:\n${ctx.systemPrompt}`];
        break;
      case "resume":
        argv = ["codex", "resume", ...config, mode.sessionKey];
        break;
      case "fork":
        argv = ["codex", "fork", ...config, mode.fromSessionKey];
        break;
    }
    return { argv, env, tempFiles: [] };
  }

  async sessionKey(pid: number): Promise<string | null> {
    const roots = (await threadsForPid(pid)).filter((t) => t.root);
    return roots.length === 1 ? (roots[0]?.id ?? null) : null;
  }

  async deliver(sessionKey: string, text: string): Promise<DeliveryOutcome> {
    const out = await tryRun(["codex", "queue", "--thread", sessionKey, "--message", text]);
    return out === null
      ? { ok: false, reason: "codex queue failed" }
      : { ok: true, via: "codex queue" };
  }

  async presence(sessionKey: string, pid: number): Promise<SessionPresence | null> {
    const t = threadMeta(sessionKey);
    const activeAt =
      t.rolloutPath && existsSync(t.rolloutPath) ? statSync(t.rolloutPath).mtimeMs : null;
    return { status: null, activeAt, cwd: t.cwd ?? (await cwdOf(pid)) ?? null };
  }

  async status() {
    const version = (await tryRun(["codex", "--version"]))?.trim() ?? null;
    if (version === null) {
      return {
        installed: false,
        version,
        loggedIn: null,
        account: null,
        loginCommand: "codex login",
      };
    }
    const out = await tryRun(["codex", "login", "status"], { stderr: true });
    const loggedIn = out === null ? null : /logged in/i.test(out);
    return { installed: true, version, loggedIn, account: null, loginCommand: "codex login" };
  }
}
