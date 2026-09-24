import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type {
  DeliveryOutcome,
  Launch,
  LaunchContext,
  LaunchMode,
  Provider,
  SessionPresence,
} from "../types.ts";
import { shellQuote, tempJson } from "../util/files.ts";
import { postViaHelper } from "../util/post.ts";
import { tryRun } from "../util/ps.ts";

/**
 * Claude Code.
 *
 * Identity: Pane chooses the session id (`--session-id`), so it is known at launch.
 * Delivery: the session's inbox socket, once its SessionStart hook has handed over
 * the messaging token through `attach`; otherwise the runtime types into the PTY.
 * Presence: the per-session registry file Claude writes at ~/.claude/sessions/<pid>.json.
 */

const Registry = z.object({
  sessionId: z.string(),
  cwd: z.string().optional(),
  status: z.string().optional(),
  updatedAt: z.number().optional(),
  messagingSocketPath: z.string().optional(),
});

/**
 * Claude asks whether a folder is trusted the first time it starts there, and the
 * dialog would swallow the first message. Pane made the worktree, so it answers for
 * the user by recording the trust where Claude records it itself.
 */
function trustFolder(path: string): void {
  const file = join(homedir(), ".claude.json");
  let config: { projects?: Record<string, Record<string, unknown>> } = {};
  try {
    if (existsSync(file)) config = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return;
  }
  const projects = config.projects ?? {};
  const entry = projects[path] ?? { allowedTools: [] };
  if (entry.hasTrustDialogAccepted === true) return;
  projects[path] = { ...entry, hasTrustDialogAccepted: true };
  config.projects = projects;
  const tmp = `${file}.pane-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(config, null, 2));
  renameSync(tmp, file);
}

function readRegistry(pid: number): z.infer<typeof Registry> | null {
  const file = join(homedir(), ".claude", "sessions", `${pid}.json`);
  if (!existsSync(file)) return null;
  try {
    return Registry.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export class ClaudeCodeProvider implements Provider {
  readonly name = "claude-code";
  readonly label = "Claude Code";
  /** Inbox tokens by session id, handed over by the SessionStart hook. */
  private readonly tokens = new Map<string, string>();
  /** Session id → pid of the process Pane launched, so delivery can find the socket. */
  private readonly pids = new Map<string, number>();

  async launch(ctx: LaunchContext, mode: LaunchMode): Promise<Launch> {
    const { identity } = ctx;
    trustFolder(ctx.worktree.path);
    const env = {
      PANE_AGENT_ID: identity.agentId,
      PANE_TOKEN: identity.token,
      PANE_SOCKET: identity.socket,
    };
    const mcp = tempJson("mcp", {
      mcpServers: {
        pane: { command: ctx.mcpCommand[0], args: ctx.mcpCommand.slice(1), env },
      },
    });
    const settings = tempJson("settings", {
      hooks: {
        SessionStart: [
          { hooks: [{ type: "command", command: ctx.attachCommand.map(shellQuote).join(" ") }] },
        ],
      },
      permissions: { allow: ["mcp__pane__*"] },
    });
    const common = [
      "--name",
      ctx.agent.name,
      "--append-system-prompt",
      ctx.systemPrompt,
      "--mcp-config",
      mcp,
      "--settings",
      settings,
    ];
    if (ctx.agent.model) common.push("--model", ctx.agent.model);
    let argv: string[];
    switch (mode.kind) {
      case "fresh":
        argv = ["claude", "--session-id", crypto.randomUUID(), ...common];
        break;
      case "resume":
        argv = ["claude", "--resume", mode.sessionKey, ...common];
        break;
      case "fork":
        argv = [
          "claude",
          "--resume",
          mode.fromSessionKey,
          "--fork-session",
          "--session-id",
          crypto.randomUUID(),
          ...common,
        ];
        break;
    }
    return { argv, env, tempFiles: [mcp, settings] };
  }

  async sessionKey(pid: number, launch: Launch): Promise<string | null> {
    const i = launch.argv.indexOf("--session-id");
    const chosen = i >= 0 ? launch.argv[i + 1] : undefined;
    const key = chosen ?? readRegistry(pid)?.sessionId ?? null;
    if (key) this.pids.set(key, pid);
    return key;
  }

  attach(sessionKey: string, info: Record<string, unknown>): void {
    if (typeof info.token === "string") this.tokens.set(sessionKey, info.token);
  }

  async deliver(sessionKey: string, text: string): Promise<DeliveryOutcome> {
    const token = this.tokens.get(sessionKey);
    const pid = this.pids.get(sessionKey);
    if (!token || pid === undefined) return { ok: false, reason: "no inbox token" };
    const reg = readRegistry(pid);
    const socket = reg?.messagingSocketPath;
    if (!socket || !existsSync(socket)) return { ok: false, reason: "no inbox socket" };
    try {
      await postViaHelper(socket, token, text);
      return { ok: true, via: "inbox socket" };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  async presence(_sessionKey: string, pid: number): Promise<SessionPresence | null> {
    const reg = readRegistry(pid);
    if (!reg) return null;
    return { status: reg.status ?? null, activeAt: reg.updatedAt ?? null, cwd: reg.cwd ?? null };
  }

  async status() {
    const version = (await tryRun(["claude", "--version"]))?.trim() ?? null;
    if (version === null) {
      return {
        installed: false,
        version,
        loggedIn: null,
        account: null,
        loginCommand: "claude login",
      };
    }
    let loggedIn: boolean | null = null;
    let account: string | null = null;
    const out = await tryRun(["claude", "auth", "status"]);
    if (out) {
      try {
        const j = JSON.parse(out) as { loggedIn?: boolean; email?: string };
        loggedIn = j.loggedIn ?? null;
        account = j.email ?? null;
      } catch {
        loggedIn = null;
      }
    }
    return { installed: true, version, loggedIn, account, loginCommand: "claude login" };
  }

  /** Forget a session that is gone. */
  forget(sessionKey: string): void {
    this.tokens.delete(sessionKey);
    this.pids.delete(sessionKey);
  }
}
