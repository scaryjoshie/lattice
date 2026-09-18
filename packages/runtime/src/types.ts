import type { Agent, Id, Worktree } from "@pane/kernel/model";

/**
 * The runtime keeps agents alive. An agent is a kernel row; the runtime attaches a
 * process to it inside a PTY, in its worktree, with the `pane` MCP server configured
 * through the provider CLI's own flags, and with its identity in the environment.
 */

/** What a spawned process is told about itself. */
export interface Identity {
  agentId: Id<"agent">;
  token: string;
  /** The Pane daemon's unix socket, for the MCP shim. */
  socket: string;
}

export interface LaunchContext {
  agent: Agent;
  worktree: Worktree;
  identity: Identity;
  /** The command that starts the `pane` MCP shim, e.g. ["bun", ".../mcp.ts"]. */
  mcpCommand: string[];
  /** Text every coding agent gets: who it is, where it is, what the tools are for. */
  systemPrompt: string;
  /** The command a Claude Code SessionStart hook runs to hand over its inbox token. */
  attachCommand: string[];
}

export interface Launch {
  argv: string[];
  env: Record<string, string>;
  /** Files the launch wrote (settings, mcp config); removed when the process exits. */
  tempFiles: string[];
}

/** Presence as the host reports it, for one session. */
export interface SessionPresence {
  status: string | null;
  activeAt: number | null;
  cwd: string | null;
}

export type DeliveryOutcome = { ok: true; via: string } | { ok: false; reason: string };

/**
 * A provider adapts one host CLI. It decides the argv for a fresh, resumed or forked
 * session, knows how to find the session's own id, and may deliver text into a
 * session without typing into its terminal.
 */
export interface Provider {
  readonly name: string;
  readonly label: string;
  /** How a fresh session starts. `sessionKey` is chosen by Pane when the host allows it. */
  launch(
    ctx: LaunchContext,
    mode:
      | { kind: "fresh" }
      | { kind: "resume"; sessionKey: string }
      | { kind: "fork"; fromSessionKey: string },
  ): Promise<Launch>;
  /**
   * The session key of the running process, once the host has made it knowable.
   * Called until it returns a value; a provider that chose the key returns it at once.
   */
  sessionKey(pid: number, launch: Launch): Promise<string | null>;
  /** Deliver text into the session without using the terminal, when the host allows. */
  deliver?(sessionKey: string, text: string): Promise<DeliveryOutcome>;
  /** What the host says about the session right now. */
  presence?(sessionKey: string, pid: number): Promise<SessionPresence | null>;
  /** Whether the CLI is installed and logged in. */
  status(): Promise<{
    installed: boolean;
    version: string | null;
    loggedIn: boolean | null;
    account: string | null;
    loginCommand: string;
  }>;
  /** The host's own identification of a session, handed over by a hook (Claude's inbox token). */
  attach?(sessionKey: string, info: Record<string, unknown>): void;
}

export interface TerminalSubscriber {
  data(chunk: Uint8Array): void;
  exit(code: number | null): void;
}

export interface RuntimeEvents {
  /** A process started or ended; the runtime has already recorded the kernel lifecycle. */
  lifecycle(agentId: Id<"agent">, running: boolean, detail: string | null): void;
  /** Presence changed for an agent. */
  presence(agentId: Id<"agent">): void;
}
