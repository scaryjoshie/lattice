import {
  type ActorId,
  type AnyObject,
  type Event,
  type Id,
  kindOf,
  type ProvenanceNode,
  type ScopeId,
  type Worktree,
} from "@pane/kernel";
import type { AskAnswer, AskRequest, OpName, ProposedOp } from "@pane/protocol";
import { callModel, extractJson, ModelError } from "./model.ts";
import { OperationError, type Services } from "./services.ts";

/**
 * Ask mode. Three levels, tried in order and always labeled:
 *   1. recorded: the answer is in provenance edges and decisions; no model.
 *   2. actor: the responsible agent is asked, verbatim, over the bus, and replies.
 *   3. reconstructed: a headless model call over the evidence.
 * Imperative asks become a proposal of operations to confirm, never direct execution.
 */

const REPLY_WAIT_MS = 90_000;
const DIFF_LIMIT = 15_000;

const WHY =
  /\bwhy\b|where (did|does) .* come from|who (created|made|added|raised|decided)|what caused/i;
const IMPERATIVE =
  /^(deal with|handle|fix|create|make|add|split|parallelize|parallelise|assign|merge|resolve|close|move|escalate|start|stop|spawn|open|record|mark)\b/i;

/** Operations a proposal may contain, with the shape the model must produce. */
const PROPOSABLE: Partial<Record<OpName, string>> = {
  createTask: "{ scopeId, title, description?, dependsOn?: taskIds[] }",
  setTaskStatus: "{ taskId, status: open|in_progress|blocked|done|cancelled }",
  raiseProblem: "{ scopeId, title, description? }",
  resolveProblem: "{ problemId, resolution }",
  recordDecision: "{ scopeId, title, rationale, alternatives?: string[] }",
  requestAttention:
    "{ scopeId, kind: decision|approval|review|input|manual_action|unblock, title, blocking? }",
  escalateItem: "{ itemId, scopeId }",
  createWorktree: "{ repositoryId, name, objective }",
  spawnAgent: "{ worktreeId, provider: claude-code|codex }",
  assignOwner: "{ itemId, actorId }",
  link: "{ sourceId, type, targetId }",
};

interface Ref {
  id: string;
  kind: string;
  title: string;
  object: AnyObject;
}

export class Ask {
  constructor(private readonly s: Services) {}

  async ask(req: AskRequest): Promise<AskAnswer> {
    const { kernel } = this.s;
    const project = kernel.store.project(req.projectId);
    if (!project) throw new OperationError(`project ${req.projectId} not found`, "not_found");
    const refs = req.refs.map((id) => this.ref(id)).filter((r): r is Ref => r !== undefined);
    const conversation =
      req.conversationId ??
      kernel.commands.openConversation(this.s.human, {
        kind: "ask",
        projectId: project.id,
        scopeId: this.scopeOf(refs) ?? null,
        title: req.text.slice(0, 80),
      }).id;
    kernel.commands.postMessage(this.s.human, { conversationId: conversation, body: req.text });

    const answer = IMPERATIVE.test(req.text)
      ? await this.propose(req, refs, conversation)
      : (this.recorded(req, refs, conversation) ??
        (await this.fromActor(req, refs, conversation)) ??
        (await this.reconstruct(req, refs, conversation)));
    if (answer.text) {
      kernel.commands.postMessage(this.s.human, {
        conversationId: conversation,
        body: `[${answer.level}] ${answer.text}`,
      });
    }
    return answer;
  }

  private ref(id: string): Ref | undefined {
    const object = this.s.kernel.store.object(id);
    if (!object) return undefined;
    return { id, kind: kindOf(id) ?? "object", title: titleOf(object), object };
  }

  private scopeOf(refs: Ref[]): ScopeId | undefined {
    for (const r of refs) {
      const o = r.object as { scopeId?: ScopeId; id: string };
      if (r.kind === "worktree" || r.kind === "repository" || r.kind === "project")
        return o.id as ScopeId;
      if (o.scopeId) return o.scopeId;
    }
    return undefined;
  }

  private worktreeOf(refs: Ref[]): Worktree | undefined {
    const scope = this.scopeOf(refs);
    if (!scope) return undefined;
    const path = this.s.kernel.query.scopePath(this.s.kernel.store, scope);
    const last = path.at(-1);
    return last && "path" in last ? last : undefined;
  }

  // ---- level 1 ------------------------------------------------------------------

  private recorded(
    req: AskRequest,
    refs: Ref[],
    conversationId: Id<"conversation">,
  ): AskAnswer | undefined {
    if (!WHY.test(req.text) || refs.length === 0) return undefined;
    const lines: string[] = [];
    const sources: AskAnswer["sources"] = [];
    for (const r of refs) {
      const node = this.s.kernel.query.provenance(this.s.kernel.store, r.id);
      if (!node) continue;
      lines.push(...this.describe(node, sources, 0));
      for (const rel of this.s.kernel.store.relationsTo(r.id, "resolves")) {
        const d = this.s.kernel.store.object(rel.sourceId);
        if (d && kindOf(rel.sourceId) === "decision") {
          const dec = d as { title: string; rationale: string };
          lines.push(`Decision "${dec.title}": ${dec.rationale}`);
          sources.push({ id: rel.sourceId, kind: "decision", title: dec.title });
        }
      }
    }
    // A creation event alone is not an explanation.
    if (sources.length === 0) return undefined;
    return {
      conversationId,
      level: "recorded",
      text: lines.join("\n"),
      sources,
      respondents: [],
      proposal: null,
    };
  }

  private describe(node: ProvenanceNode, sources: AskAnswer["sources"], depth: number): string[] {
    const indent = "  ".repeat(depth);
    const title = titleOf(node.object);
    const kind = kindOf(node.object.id) ?? "object";
    const out: string[] = [];
    if (depth === 0) {
      const by = node.created ? this.s.kernel.store.actor(node.created.actorId)?.name : undefined;
      out.push(
        `${cap(kind)} "${title}"${by ? ` was created by ${by}` : ""}${node.created ? ` on ${when(node.created)}` : ""}.`,
      );
    }
    if (kind === "decision") {
      const d = node.object as { rationale: string; alternatives: string[] };
      if (d.rationale) out.push(`${indent}Rationale: ${d.rationale}`);
      if (d.alternatives.length) out.push(`${indent}Alternatives: ${d.alternatives.join("; ")}`);
      sources.push({ id: node.object.id, kind, title });
    }
    for (const e of node.edges) {
      const t = titleOf(e.node.object);
      const k = kindOf(e.node.object.id) ?? "object";
      out.push(`${indent}${e.relation.type.replace("_", " ")} ${k} "${t}"`);
      sources.push({ id: e.node.object.id, kind: k, title: t });
      out.push(...this.describe(e.node, sources, depth + 1));
    }
    return out;
  }

  // ---- level 2 ------------------------------------------------------------------

  private respondents(refs: Ref[]): Array<{ id: Id<"agent">; score: number }> {
    const { kernel } = this.s;
    const scores = new Map<Id<"agent">, number>();
    const add = (actor: ActorId | undefined, n: number) => {
      if (actor && kindOf(actor) === "agent")
        scores.set(actor as Id<"agent">, (scores.get(actor as Id<"agent">) ?? 0) + n);
    };
    for (const r of refs) {
      const o = r.object as { createdBy?: ActorId; recordedBy?: ActorId; scopeId?: ScopeId };
      add(o.createdBy ?? o.recordedBy, 100);
      add(kernel.store.relationsFrom(r.id, "owned_by")[0]?.targetId as ActorId | undefined, 80);
      const scope = r.kind === "worktree" ? (r.id as Id<"worktree">) : o.scopeId;
      if (scope && kindOf(scope) === "worktree") {
        for (const a of kernel.query.agentsIn(kernel.store, scope as Id<"worktree">)) add(a.id, 50);
      }
      for (const rel of kernel.store.relationsFrom(r.id)) {
        if (kindOf(rel.targetId) === "message")
          add((kernel.store.message(rel.targetId as Id<"message">) ?? {}).fromActorId, 30);
      }
    }
    return [...scores]
      .map(([id, score]) => ({ id, score }))
      .filter(({ id }) => {
        const a = kernel.store.agent(id);
        return a && (a.lifecycle === "online" || (a.lifecycle === "offline" && a.sessionKey));
      })
      .sort((x, y) => y.score - x.score);
  }

  private async fromActor(
    req: AskRequest,
    refs: Ref[],
    conversationId: Id<"conversation">,
  ): Promise<AskAnswer | undefined> {
    const { kernel, runtime } = this.s;
    const best = this.respondents(refs)[0];
    if (!best) return undefined;
    const agent = kernel.store.agent(best.id);
    if (!agent) return undefined;
    kernel.commands.joinConversation(this.s.human, { conversationId, actorId: agent.id });
    const subject = refs.map((r) => `${r.kind} "${r.title}" [${r.id}]`).join(", ");
    const text = [
      `${kernel.store.actor(this.s.human)?.name ?? "The user"} asks: "${req.text}"`,
      subject ? `Subject: ${subject}` : "",
      `Answer directly with the reply tool (conversation_id: ${conversationId}).`,
    ]
      .filter(Boolean)
      .join("\n");
    const reply = this.waitForReply(conversationId, agent.id);
    const sent = await runtime.send(agent.id, `[pane ${conversationId}] ${text}`);
    if (!sent.ok) return undefined;
    const m = await reply;
    if (!m) return undefined;
    return {
      conversationId,
      level: "actor",
      text: m,
      sources: refs.map((r) => ({ id: r.id, kind: r.kind, title: r.title })),
      respondents: [{ actorId: agent.id, name: agent.name, text: m }],
      proposal: null,
    };
  }

  private waitForReply(
    conversationId: Id<"conversation">,
    from: ActorId,
  ): Promise<string | undefined> {
    return new Promise((resolve) => {
      const done = (v: string | undefined) => {
        clearTimeout(timer);
        off();
        resolve(v);
      };
      const timer = setTimeout(() => done(undefined), REPLY_WAIT_MS);
      const off = this.s.kernel.subscribe((e: Event) => {
        if (e.kind !== "message.posted" || e.actorId !== from) return;
        if (e.payload.conversationId !== conversationId || !e.targetId) return;
        done(this.s.kernel.store.message(e.targetId as Id<"message">)?.body);
      });
    });
  }

  // ---- level 3 ------------------------------------------------------------------

  private async evidence(refs: Ref[]): Promise<string> {
    const { kernel, git } = this.s;
    const parts: string[] = [];
    for (const r of refs) {
      const o = r.object as unknown as Record<string, unknown>;
      const fields = [
        "status",
        "description",
        "rationale",
        "alternatives",
        "objective",
        "message",
        "resolution",
        "answer",
      ]
        .filter((f) => o[f] !== undefined && o[f] !== null && o[f] !== "")
        .map((f) => `${f}: ${typeof o[f] === "string" ? o[f] : JSON.stringify(o[f])}`);
      parts.push(`## ${r.kind} "${r.title}" [${r.id}]\n${fields.join("\n")}`);
      const node = kernel.query.provenance(kernel.store, r.id);
      if (node?.edges.length) parts.push(this.describe(node, [], 0).join("\n"));
      if (r.kind === "commit") {
        const c = r.object as { sha: string; repositoryId: Id<"repository"> };
        const main = kernel.store.worktreesOfRepository(c.repositoryId).find((w) => w.isMain);
        if (main)
          parts.push(
            `diff:\n${(await git.diff(main.path, { sha: c.sha }).catch(() => "")).slice(0, DIFF_LIMIT)}`,
          );
      }
    }
    const wt = this.worktreeOf(refs);
    if (wt) {
      const s = kernel.query.worktreeSummary(kernel.store, wt.id);
      parts.push(
        `## worktree "${wt.name}" objective: ${wt.objective || "(none)"}; tasks ${s?.tasks.done}/${s?.tasks.total} done; ${s?.problemsOpen} open problems`,
      );
      const open = [
        ...kernel.store
          .tasksOf(wt.projectId)
          .filter((t) => t.scopeId === wt.id && t.status !== "done"),
        ...kernel.store
          .problemsOf(wt.projectId)
          .filter((p) => p.scopeId === wt.id && p.status === "open"),
      ].slice(0, 20);
      if (open.length)
        parts.push(open.map((x) => `- ${kindOf(x.id)} "${x.title}" [${x.id}]`).join("\n"));
      const decisions = kernel.store
        .decisionsOf(wt.projectId)
        .filter((d) => d.scopeId === wt.id)
        .slice(-10);
      if (decisions.length)
        parts.push(decisions.map((d) => `- decision "${d.title}": ${d.rationale}`).join("\n"));
      const commits = kernel.store.commitsOf(wt.projectId).slice(0, 10);
      if (commits.length)
        parts.push(
          commits
            .map(
              (c) =>
                `- ${c.sha.slice(0, 8)} ${c.message.split("\n")[0]}${c.explanation ? ` — ${c.explanation}` : ""}`,
            )
            .join("\n"),
        );
    }
    return parts.join("\n\n");
  }

  private async reconstruct(
    req: AskRequest,
    refs: Ref[],
    conversationId: Id<"conversation">,
  ): Promise<AskAnswer> {
    const evidence = await this.evidence(refs);
    const wt = this.worktreeOf(refs);
    try {
      const text = await callModel({
        model: this.s.config.askModel,
        cwd: wt?.path,
        tools: wt ? ["Read", "Grep", "Glob"] : [],
        system:
          "You answer questions about a software project from recorded evidence and, when a worktree is given, its code. Say plainly what the evidence does not show. Be brief: a few sentences, no headings.",
        prompt: `Question: ${req.text}\n\nEvidence:\n${evidence || "(none recorded)"}`,
      });
      return {
        conversationId,
        level: "reconstructed",
        text,
        sources: refs.map((r) => ({ id: r.id, kind: r.kind, title: r.title })),
        respondents: [],
        proposal: null,
      };
    } catch (e) {
      const reason = e instanceof ModelError ? e.message : String(e);
      return {
        conversationId,
        level: "none",
        text: `No answer: ${reason}`,
        sources: [],
        respondents: [],
        proposal: null,
      };
    }
  }

  // ---- proposals ----------------------------------------------------------------

  private async propose(
    req: AskRequest,
    refs: Ref[],
    conversationId: Id<"conversation">,
  ): Promise<AskAnswer> {
    const evidence = await this.evidence(refs);
    const wt = this.worktreeOf(refs);
    const scopeId = this.scopeOf(refs) ?? req.projectId;
    const agents = this.s.kernel.store
      .agentsOf(req.projectId)
      .filter((a) => a.lifecycle !== "archived")
      .map((a) => `${a.name} [${a.id}]`)
      .join(", ");
    const ops = Object.entries(PROPOSABLE)
      .map(([n, shape]) => `- ${n} ${shape}`)
      .join("\n");
    try {
      const raw = await callModel({
        model: this.s.config.askModel,
        cwd: wt?.path,
        system: `You turn a request about a software project into a short plan of operations. Reply with JSON only: {"summary": string, "ops": [{"name": string, "params": object, "summary": string}]}. Use only these operations:\n${ops}\nUse the ids given in the evidence. The current scope id is ${scopeId}${wt ? ` (worktree "${wt.name}", repository ${wt.repositoryId})` : ""}. Agents: ${agents || "none"}. Prefer few operations.`,
        prompt: `Request: ${req.text}\n\nEvidence:\n${evidence || "(none)"}`,
      });
      const parsed = extractJson(raw) as {
        summary?: string;
        ops?: Array<{ name?: string; params?: Record<string, unknown>; summary?: string }>;
      };
      const proposal: ProposedOp[] = (parsed.ops ?? [])
        .filter(
          (o): o is { name: OpName; params: Record<string, unknown>; summary: string } =>
            typeof o.name === "string" &&
            o.name in PROPOSABLE &&
            typeof o.params === "object" &&
            o.params !== null,
        )
        .map((o) => ({ name: o.name, params: o.params, summary: o.summary ?? o.name }));
      return {
        conversationId,
        level: "reconstructed",
        text: parsed.summary ?? "",
        sources: refs.map((r) => ({ id: r.id, kind: r.kind, title: r.title })),
        respondents: [],
        proposal,
      };
    } catch (e) {
      const reason = e instanceof ModelError ? e.message : String(e);
      return {
        conversationId,
        level: "none",
        text: `No proposal: ${reason}`,
        sources: [],
        respondents: [],
        proposal: null,
      };
    }
  }
}

export function titleOf(o: AnyObject): string {
  const x = o as unknown as Record<string, unknown>;
  for (const f of ["title", "name", "message", "body"]) {
    const v = x[f];
    if (typeof v === "string" && v) return v.split("\n")[0] ?? v;
  }
  return o.id;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (e: Event) => new Date(e.at).toLocaleString();
