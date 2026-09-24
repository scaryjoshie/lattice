import {
  type Agent,
  ATTENTION_KINDS,
  type Id,
  idOf,
  TASK_STATUSES,
  type Worktree,
} from "@pane/kernel";
import { z } from "zod";
import type { Ops } from "./operations.ts";
import { OperationError, type Services } from "./services.ts";

/**
 * The coding-agent tools, defined once: the MCP shim exposes them by name and schema,
 * the daemon runs them. Every tool acts as the calling agent, in its own worktree.
 * Results are short text; agents pay for every token.
 */

export interface AgentCtx {
  s: Services;
  ops: Ops;
  agent: Agent;
  worktree: Worktree;
}

export interface AgentTool<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  params: S;
  run(ctx: AgentCtx, params: z.infer<z.ZodObject<S>>): Promise<string>;
}

function tool<S extends z.ZodRawShape>(t: AgentTool<S>): AgentTool<S> {
  return t;
}

const line = (id: string, title: string, extra?: string) =>
  `${id}  ${title}${extra ? `  (${extra})` : ""}`;

function scopeFor(ctx: AgentCtx, scope: "worktree" | "project" | undefined) {
  return scope === "project" ? ctx.worktree.projectId : ctx.worktree.id;
}

export const agentTools = [
  tool({
    name: "context",
    description:
      "Where you are and what is open: worktree, objective, open tasks, problems, questions, recent decisions, other agents.",
    params: {},
    async run(ctx) {
      const { kernel } = ctx.s;
      const w = ctx.worktree;
      const inScope = <T extends { scopeId: string }>(xs: T[]) =>
        xs.filter((x) => x.scopeId === w.id);
      const tasks = inScope(kernel.store.tasksOf(w.projectId)).filter(
        (t) => t.status !== "done" && t.status !== "cancelled",
      );
      const problems = inScope(kernel.store.problemsOf(w.projectId)).filter(
        (p) => p.status === "open",
      );
      const questions = inScope(kernel.store.questionsOf(w.projectId)).filter(
        (q) => q.status === "open",
      );
      const decisions = kernel.store.decisionsOf(w.projectId).slice(-10);
      const others = kernel.store
        .agentsOf(w.projectId)
        .filter((a) => a.id !== ctx.agent.id && a.lifecycle !== "archived")
        .map((a) => {
          const home = kernel.query.agentPlacement(kernel.store, a.id).assignedTo;
          const wt = home ? kernel.store.worktree(home)?.name : "?";
          return `${a.name} [${a.id}] ${a.lifecycle} in ${wt}`;
        });
      const project = kernel.store.project(w.projectId);
      return [
        `Worktree ${w.name} [${w.id}] on ${w.branch} at ${w.path}`,
        `Objective: ${w.objective || "(none)"}`,
        project?.goals ? `Project goals: ${project.goals}` : "",
        `Tasks: ${tasks.length ? "" : "none"}`,
        ...tasks.map((t) => line(t.id, t.title, t.status)),
        `Problems: ${problems.length ? "" : "none"}`,
        ...problems.map((p) => line(p.id, p.title)),
        `Questions: ${questions.length ? "" : "none"}`,
        ...questions.map((q) => line(q.id, q.title)),
        `Decisions: ${decisions.length ? "" : "none"}`,
        ...decisions.map((d) => line(d.id, d.title)),
        `Agents: ${others.length ? "" : "none"}`,
        ...others,
      ]
        .filter(Boolean)
        .join("\n");
    },
  }),

  tool({
    name: "create_task",
    description: "Add a task to this worktree's plan. Returns its id.",
    params: {
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      depends_on: z.array(z.string()).optional().describe("task ids this one waits for"),
      addresses: z
        .array(z.string())
        .optional()
        .describe("problem or question ids this task works on"),
    },
    async run(ctx, p) {
      const t = ctx.s.kernel.commands.createTask(ctx.agent.id, {
        scopeId: ctx.worktree.id,
        title: p.title,
        description: p.description ?? "",
        dependsOn: (p.depends_on ?? []) as Id<"task">[],
        addresses: p.addresses ?? [],
      });
      return line(t.id, t.title, t.status);
    },
  }),

  tool({
    name: "update_task",
    description: "Change a task's status, title or description.",
    params: {
      task_id: z.string(),
      status: z.enum(TASK_STATUSES).optional(),
      title: z.string().optional(),
      description: z.string().optional(),
    },
    async run(ctx, p) {
      const taskId = idOf("task").parse(p.task_id);
      if (p.title !== undefined || p.description !== undefined) {
        ctx.s.kernel.commands.updateTask(ctx.agent.id, {
          taskId,
          title: p.title,
          description: p.description,
        });
      }
      const t = p.status
        ? ctx.s.kernel.commands.setTaskStatus(ctx.agent.id, { taskId, status: p.status })
        : ctx.s.kernel.store.task(taskId);
      return t ? line(t.id, t.title, t.status) : `task ${taskId} not found`;
    },
  }),

  tool({
    name: "raise_problem",
    description:
      "Record something you observed that is wrong or risky. Use scope 'project' when it is not this worktree's to fix.",
    params: {
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      scope: z.enum(["worktree", "project"]).optional(),
      discovered_during: z.string().optional().describe("task id you were working on"),
      blocks: z.array(z.string()).optional().describe("task ids this problem blocks"),
    },
    async run(ctx, p) {
      const pr = ctx.s.kernel.commands.raiseProblem(ctx.agent.id, {
        scopeId: scopeFor(ctx, p.scope),
        title: p.title,
        description: p.description ?? "",
        discoveredDuring: (p.discovered_during ?? ctx.worktree.id) as Id<"task" | "worktree">,
        blocks: p.blocks ?? [],
      });
      return line(pr.id, pr.title, p.scope ?? "worktree");
    },
  }),

  tool({
    name: "resolve_problem",
    description:
      "Mark a problem resolved, saying how. Name the commit or task that resolved it when there is one.",
    params: {
      problem_id: z.string(),
      resolution: z.string().min(1),
      resolved_by: z.string().optional().describe("commit, task or decision id"),
    },
    async run(ctx, p) {
      const pr = ctx.s.kernel.commands.resolveProblem(ctx.agent.id, {
        problemId: idOf("problem").parse(p.problem_id),
        resolution: p.resolution,
        resolvedBy: p.resolved_by as Id<"task" | "commit" | "decision"> | undefined,
      });
      return line(pr.id, pr.title, pr.status);
    },
  }),

  tool({
    name: "raise_question",
    description:
      "Record something unresolved that someone must answer. Not for the human: use request_user for that.",
    params: { title: z.string().min(1).max(200), description: z.string().optional() },
    async run(ctx, p) {
      const q = ctx.s.kernel.commands.raiseQuestion(ctx.agent.id, {
        scopeId: ctx.worktree.id,
        title: p.title,
        description: p.description ?? "",
      });
      return line(q.id, q.title);
    },
  }),

  tool({
    name: "answer_question",
    description: "Answer an open question.",
    params: { question_id: z.string(), answer: z.string().min(1) },
    async run(ctx, p) {
      const q = ctx.s.kernel.commands.answerQuestion(ctx.agent.id, {
        questionId: idOf("question").parse(p.question_id),
        answer: p.answer,
      });
      return line(q.id, q.title, q.status);
    },
  }),

  tool({
    name: "record_decision",
    description: "Record a choice with its rationale and the alternatives you rejected.",
    params: {
      title: z.string().min(1).max(200),
      rationale: z.string().min(1),
      alternatives: z.array(z.string()).optional(),
      resolves: z.array(z.string()).optional().describe("question or problem ids this settles"),
    },
    async run(ctx, p) {
      const d = ctx.s.kernel.commands.recordDecision(ctx.agent.id, {
        scopeId: ctx.worktree.id,
        title: p.title,
        rationale: p.rationale,
        alternatives: p.alternatives ?? [],
        resolves: p.resolves ?? [],
      });
      return line(d.id, d.title);
    },
  }),

  tool({
    name: "request_user",
    description:
      "Ask the human for a decision, approval, review, input, a manual action, or to unblock you. Say whether you are blocked. Continue with other work meanwhile.",
    params: {
      kind: z.enum(ATTENTION_KINDS),
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      blocking: z.boolean().optional(),
      refs: z.array(z.string()).optional().describe("ids of related tasks, problems, commits"),
    },
    async run(ctx, p) {
      const a = ctx.s.kernel.commands.requestAttention(ctx.agent.id, {
        scopeId: ctx.worktree.id,
        kind: p.kind,
        title: p.title,
        description: p.description ?? "",
        blocking: p.blocking ?? false,
        refs: p.refs ?? [],
      });
      return line(a.id, a.title, p.blocking ? "blocking" : "not blocking");
    },
  }),

  tool({
    name: "escalate",
    description:
      "Move a task, problem or question to project scope when it is not this worktree's.",
    params: { id: z.string() },
    async run(ctx, p) {
      const item = ctx.s.kernel.commands.escalateItem(ctx.agent.id, {
        itemId: idOf("task", "problem", "question").parse(p.id),
        scopeId: ctx.worktree.projectId,
      });
      return line(item.id, item.title, "project");
    },
  }),

  tool({
    name: "commit",
    description:
      "Stage everything in this worktree and commit with a coherent message. Name the tasks and problems it addresses or resolves.",
    params: {
      message: z.string().min(1),
      addresses: z.array(z.string()).optional(),
      resolves: z.array(z.string()).optional(),
    },
    async run(ctx, p) {
      const c = await ctx.s.git.commit(ctx.worktree.path, {
        message: p.message,
        trailers: { "Pane-Agent": ctx.agent.id },
      });
      const commit = ctx.s.kernel.commands.recordCommit(ctx.agent.id, {
        repositoryId: ctx.worktree.repositoryId,
        sha: c.sha,
        message: c.message,
        authorName: c.authorName,
        authoredAt: c.authoredAt,
        insertions: c.insertions,
        deletions: c.deletions,
        filesChanged: c.filesChanged,
        worktreeId: ctx.worktree.id,
        addresses: p.addresses ?? [],
        resolves: p.resolves ?? [],
      });
      return `${commit.id}  ${c.sha.slice(0, 8)}  +${c.insertions} -${c.deletions}`;
    },
  }),

  tool({
    name: "who",
    description: "The other agents in this project, where they are and whether they are online.",
    params: {},
    async run(ctx) {
      const { kernel } = ctx.s;
      const rows = kernel.store
        .agentsOf(ctx.worktree.projectId)
        .filter((a) => a.id !== ctx.agent.id && a.lifecycle !== "archived")
        .map((a) => {
          const home = kernel.query.agentPlacement(kernel.store, a.id).assignedTo;
          const wt = (home && kernel.store.worktree(home)?.name) ?? "?";
          return `${a.name}  ${a.lifecycle}  ${wt}`;
        });
      return rows.length ? rows.join("\n") : "no other agents";
    },
  }),

  tool({
    name: "send",
    description: "Message another agent by name. Keep it to one concrete question or fact.",
    params: { to: z.string().describe("agent name as shown by who"), body: z.string().min(1) },
    async run(ctx, p) {
      const { kernel } = ctx.s;
      const to = kernel.store
        .agentsOf(ctx.worktree.projectId)
        .find((a) => (a.name === p.to || a.id === p.to) && a.id !== ctx.agent.id);
      if (!to) throw new OperationError(`no agent named "${p.to}"; try who`, "not_found");
      const dm = kernel.commands.openConversation(ctx.agent.id, {
        kind: "dm",
        projectId: ctx.worktree.projectId,
        a: ctx.agent.id,
        b: to.id,
      });
      const { message } = kernel.commands.postMessage(ctx.agent.id, {
        conversationId: dm.id,
        body: p.body,
      });
      return `sent ${message.id} to ${to.name}`;
    },
  }),

  tool({
    name: "reply",
    description:
      "Reply in a conversation you were messaged in (the conv_ id in the [pane ...] line).",
    params: { conversation_id: z.string(), body: z.string().min(1) },
    async run(ctx, p) {
      const { message } = ctx.s.kernel.commands.postMessage(ctx.agent.id, {
        conversationId: idOf("conversation").parse(p.conversation_id),
        body: p.body,
      });
      return `sent ${message.id}`;
    },
  }),
] as const;

export type AnyAgentTool = AgentTool<z.ZodRawShape>;

export function agentTool(name: string): AnyAgentTool | undefined {
  return (agentTools as readonly AnyAgentTool[]).find((t) => t.name === name);
}

/** The context a tool runs in: the agent behind an id, and its home worktree. */
export function agentContext(s: Services, ops: Ops, agentId: Id<"agent">): AgentCtx {
  const agent = s.kernel.store.agent(agentId);
  if (!agent) throw new OperationError(`agent ${agentId} not found`, "not_found");
  const home = s.kernel.query.agentPlacement(s.kernel.store, agent.id).assignedTo;
  const worktree = home ? s.kernel.store.worktree(home) : undefined;
  if (!worktree) throw new OperationError("agent is not assigned to a worktree", "conflict");
  return { s, ops, agent, worktree };
}
