import {
  type Agent,
  type Event,
  type Id,
  type Kernel,
  type Message,
  SYSTEM_ACTOR_ID,
  type Worktree,
} from "@pane/kernel";
import { attributed, DeliveryQueue } from "./delivery.ts";
import { PresenceTable } from "./presence.ts";
import { AgentProcess } from "./process.ts";
import type {
  AgentLifecycleIntent,
  AgentPresence,
  DeliveryOutcome,
  Launch,
  LaunchMode,
  Provider,
  RuntimeEvents,
  Terminal,
} from "./types.ts";
import { removeQuietly } from "./util/files.ts";

/**
 * Keeps agents alive. An agent is a kernel row; this attaches a process to it in a
 * PTY inside its worktree, delivers bus messages into it, and reports presence.
 * Every fact it learns goes into the kernel as the system actor.
 */

const DEFAULT_SCROLLBACK = 200_000;
const SESSION_KEY_POLL_MS = 2000;
const SESSION_KEY_GIVE_UP_MS = 5 * 60 * 1000;
const PRESENCE_INTERVAL_MS = 3000;
const PASTE_SETTLE_MS = 150;
/** A resumed session that dies this quickly did not resume; the agent starts fresh instead. */
const RESUME_GRACE_MS = 8000;
/** Lifecycles a bus message does not wake an agent from. */
const DORMANT: ReadonlySet<Agent["lifecycle"]> = new Set(["suspended", "archived"]);

export interface RuntimeOptions {
  kernel: Kernel;
  providers: Provider[];
  socketPath: string;
  mcpCommand: string[];
  mcpTools: string[];
  attachCommand: string[];
  systemPrompt(agent: Agent, worktree: Worktree): string;
  scrollback?: number;
}

interface Running {
  process: AgentProcess;
  provider: Provider;
  launch: Launch;
  mode: LaunchMode;
  startedAt: number;
  sessionKey: string | null;
  /** Set by stop/archive before the kill, so the exit handler keeps that lifecycle. */
  intent: AgentLifecycleIntent | null;
}

type Listener<K extends keyof RuntimeEvents> = RuntimeEvents[K];

/**
 * The daemon's environment minus anything a host CLI would read as "you are inside
 * another session" (a daemon started from a Claude Code shell would otherwise make
 * every agent a child session with no registry and no transcript).
 */
function inheritableEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k.startsWith("CLAUDE_CODE_") || k === "CLAUDECODE" || k === "CLAUDE_PID") continue;
    out[k] = v;
  }
  return out;
}

export class Runtime {
  private readonly kernel: Kernel;
  private readonly byName = new Map<string, Provider>();
  private readonly running = new Map<Id<"agent">, Running>();
  private readonly tokens = new Map<Id<"agent">, string>();
  private readonly presenceTable = new PresenceTable();
  private readonly queue = new DeliveryQueue();
  private readonly listeners: { [K in keyof RuntimeEvents]: Set<Listener<K>> } = {
    lifecycle: new Set(),
    presence: new Set(),
  };
  private readonly unsubscribe: () => void;
  private readonly presenceTimer: ReturnType<typeof setInterval>;
  private readonly opts: RuntimeOptions;

  constructor(opts: RuntimeOptions) {
    this.opts = opts;
    this.kernel = opts.kernel;
    for (const p of opts.providers) this.byName.set(p.name, p);
    this.unsubscribe = this.kernel.subscribe((e) => this.onKernelEvent(e));
    this.presenceTimer = setInterval(() => void this.refreshPresence(), PRESENCE_INTERVAL_MS);
  }

  providers(): Provider[] {
    return [...this.byName.values()];
  }

  provider(name: string): Provider | undefined {
    return this.byName.get(name);
  }

  on<K extends keyof RuntimeEvents>(event: K, fn: Listener<K>): () => void {
    const set = this.listeners[event] as Set<Listener<K>>;
    set.add(fn);
    return () => set.delete(fn);
  }

  private emit<K extends keyof RuntimeEvents>(event: K, ...args: Parameters<RuntimeEvents[K]>) {
    for (const fn of this.listeners[event] as Set<(...a: Parameters<RuntimeEvents[K]>) => void>) {
      fn(...args);
    }
  }

  // ---- lifecycle -------------------------------------------------------------------

  private agent(agentId: Id<"agent">): Agent {
    const a = this.kernel.store.agent(agentId);
    if (!a) throw new Error(`agent ${agentId} not found`);
    return a;
  }

  private worktreeOf(agent: Agent): Worktree {
    const wtId = this.kernel.query.agentPlacement(this.kernel.store, agent.id).assignedTo;
    const wt = wtId ? this.kernel.store.worktree(wtId) : undefined;
    if (!wt) throw new Error(`agent ${agent.id} is not assigned to a worktree`);
    return wt;
  }

  async ensureOnline(agentId: Id<"agent">): Promise<void> {
    if (this.running.get(agentId)?.process.running) return;
    const agent = this.agent(agentId);
    if (agent.lifecycle === "archived") throw new Error(`agent ${agent.name} is archived`);
    const mode: LaunchMode = agent.sessionKey
      ? { kind: "resume", sessionKey: agent.sessionKey }
      : { kind: "fresh" };
    await this.launch(agent, mode);
  }

  private async launch(agent: Agent, mode: LaunchMode): Promise<void> {
    const provider = this.byName.get(agent.provider);
    if (!provider) throw new Error(`no provider "${agent.provider}"`);
    const worktree = this.worktreeOf(agent);
    const token = crypto.randomUUID();
    this.tokens.set(agent.id, token);
    const launch = await provider.launch(
      {
        agent,
        worktree,
        identity: { agentId: agent.id, token, socket: this.opts.socketPath },
        mcpCommand: this.opts.mcpCommand,
        mcpTools: this.opts.mcpTools,
        attachCommand: this.opts.attachCommand,
        systemPrompt: this.opts.systemPrompt(agent, worktree),
      },
      mode,
    );
    const entry: Running = {
      provider,
      launch,
      mode,
      startedAt: Date.now(),
      sessionKey: null,
      intent: null,
    } as Running;
    entry.process = new AgentProcess({
      argv: launch.argv,
      cwd: worktree.path,
      env: {
        ...inheritableEnv(),
        ...launch.env,
        TERM: "xterm-256color",
        PANE_AGENT_ID: agent.id,
        PANE_TOKEN: token,
        PANE_SOCKET: this.opts.socketPath,
      },
      scrollback: this.opts.scrollback ?? DEFAULT_SCROLLBACK,
      onExit: (code) => this.onExit(agent.id, entry, code),
    });
    this.running.set(agent.id, entry);
    this.kernel.commands.setAgentLifecycle(SYSTEM_ACTOR_ID, {
      agentId: agent.id,
      lifecycle: "online",
      detail: `pid ${entry.process.pid}`,
    });
    this.emit("lifecycle", agent.id, true, `pid ${entry.process.pid}`);
    void this.learnSessionKey(agent.id, entry);
    void this.redeliver(agent.id);
  }

  private async learnSessionKey(agentId: Id<"agent">, entry: Running): Promise<void> {
    const started = Date.now();
    while (entry.process.running && Date.now() - started < SESSION_KEY_GIVE_UP_MS) {
      const key = await entry.provider
        .sessionKey(entry.process.pid, entry.launch)
        .catch(() => null);
      if (key) {
        entry.sessionKey = key;
        if (this.kernel.store.agent(agentId)?.sessionKey !== key) {
          this.kernel.commands.updateAgent(SYSTEM_ACTOR_ID, { agentId, sessionKey: key });
        }
        return;
      }
      await Bun.sleep(SESSION_KEY_POLL_MS);
    }
  }

  private onExit(agentId: Id<"agent">, entry: Running, code: number | null): void {
    if (this.running.get(agentId) === entry) this.running.delete(agentId);
    for (const f of entry.launch.tempFiles) removeQuietly(f);
    if (this.resumeFailed(entry, code)) {
      // The host had nothing to resume. The agent keeps its identity and starts over.
      this.kernel.commands.updateAgent(SYSTEM_ACTOR_ID, { agentId, sessionKey: null });
      const agent = this.kernel.store.agent(agentId);
      if (agent) {
        void this.launch(agent, { kind: "fresh" }).catch(() =>
          this.markOffline(agentId, `resume failed (exit ${code}) and a fresh start failed too`),
        );
        return;
      }
    }
    const detail = code === null ? "killed" : `exit ${code}`;
    const lifecycle = entry.intent ?? "offline";
    const current = this.kernel.store.agent(agentId);
    if (current && current.lifecycle !== lifecycle && current.lifecycle !== "archived") {
      this.kernel.commands.setAgentLifecycle(SYSTEM_ACTOR_ID, { agentId, lifecycle, detail });
    }
    if (this.presenceTable.delete(agentId)) this.emit("presence", agentId);
    this.emit("lifecycle", agentId, false, detail);
  }

  private resumeFailed(entry: Running, code: number | null): boolean {
    return (
      entry.mode.kind === "resume" &&
      entry.intent === null &&
      code !== null &&
      code !== 0 &&
      Date.now() - entry.startedAt < RESUME_GRACE_MS
    );
  }

  private markOffline(agentId: Id<"agent">, detail: string): void {
    const current = this.kernel.store.agent(agentId);
    if (current && current.lifecycle !== "offline" && current.lifecycle !== "archived") {
      this.kernel.commands.setAgentLifecycle(SYSTEM_ACTOR_ID, {
        agentId,
        lifecycle: "offline",
        detail,
      });
    }
    this.emit("lifecycle", agentId, false, detail);
  }

  async stop(agentId: Id<"agent">): Promise<void> {
    await this.end(agentId, "suspended");
  }

  async archive(agentId: Id<"agent">): Promise<void> {
    await this.end(agentId, "archived");
  }

  private async end(agentId: Id<"agent">, intent: AgentLifecycleIntent): Promise<void> {
    const entry = this.running.get(agentId);
    if (entry) {
      entry.intent = intent;
      await entry.process.stop();
    }
    const agent = this.kernel.store.agent(agentId);
    if (agent && agent.lifecycle !== intent && agent.lifecycle !== "archived") {
      this.kernel.commands.setAgentLifecycle(SYSTEM_ACTOR_ID, { agentId, lifecycle: intent });
    }
  }

  async interrupt(agentId: Id<"agent">): Promise<void> {
    this.running.get(agentId)?.process.write("\x1b");
  }

  async fork(agentId: Id<"agent">, name?: string): Promise<Agent> {
    const source = this.agent(agentId);
    const from = this.running.get(agentId)?.sessionKey ?? source.sessionKey;
    if (!from) throw new Error(`agent ${source.name} has no session to fork yet`);
    const worktree = this.worktreeOf(source);
    const agent = this.kernel.commands.createAgent(SYSTEM_ACTOR_ID, {
      projectId: source.projectId,
      name: name ?? `${source.name} fork`,
      provider: source.provider,
      model: source.model,
      worktreeId: worktree.id,
      forkedFromId: source.id,
    });
    await this.launch(agent, { kind: "fork", fromSessionKey: from });
    return this.agent(agent.id);
  }

  // ---- messages ----------------------------------------------------------------------

  async send(agentId: Id<"agent">, text: string): Promise<DeliveryOutcome> {
    await this.ensureOnline(agentId);
    const entry = this.running.get(agentId);
    if (!entry) return { ok: false, reason: "not running" };
    const key = entry.sessionKey ?? this.kernel.store.agent(agentId)?.sessionKey ?? null;
    if (key && entry.provider.deliver) {
      const r = await entry.provider.deliver(key, text);
      if (r.ok) return r;
    }
    await Bun.sleep(PASTE_SETTLE_MS);
    if (!entry.process.running) return { ok: false, reason: "process exited" };
    entry.process.write(`\x1b[200~${text}\x1b[201~\r`);
    return { ok: true, via: "terminal" };
  }

  private onKernelEvent(e: Event): void {
    if (e.kind !== "message.posted" || !e.targetId) return;
    const message = this.kernel.store.message(e.targetId as Id<"message">);
    if (!message) return;
    const to = (e.payload.to as string[] | undefined) ?? [];
    for (const actorId of to) {
      const agent = this.kernel.store.agent(actorId as Id<"agent">);
      if (!agent || DORMANT.has(agent.lifecycle)) continue;
      void this.deliverTo(agent.id, message);
    }
  }

  private deliverTo(agentId: Id<"agent">, message: Message): Promise<void> {
    return this.queue.enqueue(agentId, message.id, async () => {
      const conversation = this.kernel.store.conversation(message.conversationId);
      if (!conversation) return;
      const text = attributed(this.kernel, message, conversation);
      let outcome: DeliveryOutcome;
      try {
        outcome = await this.send(agentId, text);
      } catch (e) {
        outcome = { ok: false, reason: e instanceof Error ? e.message : String(e) };
      }
      if (!outcome.ok) this.queue.release(agentId, message.id);
      this.kernel.commands.setDelivery(SYSTEM_ACTOR_ID, {
        messageId: message.id,
        toActorId: agentId,
        status: outcome.ok ? "delivered" : "failed",
        detail: outcome.ok ? outcome.via : outcome.reason,
      });
    });
  }

  /** Push what is still waiting for an agent that just came up, in order. */
  private async redeliver(agentId: Id<"agent">): Promise<void> {
    for (const m of this.kernel.query.undelivered(this.kernel.store, agentId)) {
      await this.deliverTo(agentId, m);
    }
  }

  // ---- presence ---------------------------------------------------------------------

  private async refreshPresence(): Promise<void> {
    for (const [agentId, entry] of this.running) {
      if (!entry.process.running || !entry.sessionKey || !entry.provider.presence) continue;
      const next = await entry.provider
        .presence(entry.sessionKey, entry.process.pid)
        .catch(() => null);
      const changed = this.presenceTable.set(agentId, next);
      if (next?.cwd) this.observeLocation(agentId, next.cwd);
      if (changed) this.emit("presence", agentId);
    }
  }

  private observeLocation(agentId: Id<"agent">, cwd: string): void {
    const wt = this.kernel.store.worktreeByPath(cwd);
    const current = this.kernel.query.agentPlacement(this.kernel.store, agentId).locatedIn;
    const next = wt?.id ?? null;
    if (current === next) return;
    this.kernel.commands.observeAgentLocation(SYSTEM_ACTOR_ID, { agentId, worktreeId: next });
  }

  presence(agentId: Id<"agent">): AgentPresence {
    const agent = this.agent(agentId);
    const entry = this.running.get(agentId);
    const running = entry?.process.running ?? false;
    const p = this.presenceTable.get(agentId);
    return {
      agentId,
      lifecycle: agent.lifecycle,
      running,
      pid: running && entry ? entry.process.pid : null,
      status: p?.status ?? null,
      cwd: p?.cwd ?? null,
      activeAt: p?.activeAt ?? null,
    };
  }

  allPresence(): AgentPresence[] {
    return this.kernel.store.agents().map((a) => this.presence(a.id));
  }

  // ---- terminals and tokens ----------------------------------------------------------

  terminal(agentId: Id<"agent">): Terminal | undefined {
    const entry = this.running.get(agentId);
    return entry?.process.running ? entry.process : undefined;
  }

  verifyToken(agentId: Id<"agent">, token: string): boolean {
    const expected = this.tokens.get(agentId);
    return expected !== undefined && expected === token;
  }

  async shutdown(): Promise<void> {
    clearInterval(this.presenceTimer);
    this.unsubscribe();
    await Promise.all([...this.running.keys()].map((id) => this.stop(id)));
  }
}
