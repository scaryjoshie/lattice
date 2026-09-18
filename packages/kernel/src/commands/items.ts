import { z } from "zod";
import {
  ATTENTION_KINDS,
  type AttentionRequest,
  anyId,
  type Decision,
  type Id,
  idOf,
  kindOf,
  newId,
  type Problem,
  type Question,
  scopeId,
  TASK_STATUSES,
  type Task,
} from "../model/index.ts";
import { type Ctx, command, KernelError } from "./define.ts";
import {
  ITEM_TABLE,
  requireAttention,
  requireItem,
  requireProblem,
  requireQuestion,
  requireScope,
  requireTask,
} from "./guards.ts";
import { addRelation, attach } from "./relations.ts";

const title = z.string().trim().min(1).max(200);
const ids = z.array(anyId).default([]);

/** Columns every item shares. */
function itemColumns(ctx: Ctx, id: string, scope: ReturnType<typeof requireScope>, t: string) {
  return {
    id,
    project_id: scope.projectId,
    scope_id: scope.scopeId,
    origin_scope_id: scope.scopeId,
    title: t,
    created_by: ctx.actor,
    created_at: ctx.now,
    updated_at: ctx.now,
  };
}

// ---- tasks ---------------------------------------------------------------------

export const createTask = command(
  "createTask",
  z.object({
    scopeId,
    title,
    description: z.string().default(""),
    status: z.enum(TASK_STATUSES).default("open"),
    dependsOn: z.array(idOf("task")).default([]),
    addresses: ids,
    derivedFrom: ids,
  }),
  (ctx, p): Task => {
    const scope = requireScope(ctx, p.scopeId);
    const id = newId("task");
    ctx.store.insert("tasks", {
      ...itemColumns(ctx, id, scope, p.title),
      description: p.description,
      status: p.status,
    });
    ctx.emit("task.created", {
      target: id,
      project: scope.projectId,
      payload: { title: p.title, scopeId: scope.scopeId },
    });
    attach(ctx, id, "depends_on", p.dependsOn);
    attach(ctx, id, "addresses", p.addresses);
    attach(ctx, id, "derived_from", p.derivedFrom);
    return requireTask(ctx, id);
  },
);

export const updateTask = command(
  "updateTask",
  z.object({ taskId: idOf("task"), title: title.optional(), description: z.string().optional() }),
  (ctx, p): Task => {
    const t = requireTask(ctx, p.taskId);
    const patch: Record<string, string | number> = { updated_at: ctx.now };
    if (p.title !== undefined) patch.title = p.title;
    if (p.description !== undefined) patch.description = p.description;
    ctx.store.update("tasks", { id: t.id }, patch);
    ctx.emit("task.updated", { target: t.id, project: t.projectId, payload: patch });
    return requireTask(ctx, t.id);
  },
);

export const setTaskStatus = command(
  "setTaskStatus",
  z.object({ taskId: idOf("task"), status: z.enum(TASK_STATUSES) }),
  (ctx, p): Task => {
    const t = requireTask(ctx, p.taskId);
    if (t.status === p.status) return t;
    ctx.store.update("tasks", { id: t.id }, { status: p.status, updated_at: ctx.now });
    ctx.emit("task.status_changed", {
      target: t.id,
      project: t.projectId,
      payload: { from: t.status, to: p.status },
    });
    return requireTask(ctx, t.id);
  },
);

// ---- problems ------------------------------------------------------------------

export const raiseProblem = command(
  "raiseProblem",
  z.object({
    scopeId,
    title,
    description: z.string().default(""),
    discoveredDuring: idOf("task", "worktree").optional(),
    causedBy: ids,
    derivedFrom: ids,
    blocks: ids,
  }),
  (ctx, p): Problem => {
    const scope = requireScope(ctx, p.scopeId);
    const id = newId("problem");
    ctx.store.insert("problems", {
      ...itemColumns(ctx, id, scope, p.title),
      description: p.description,
      status: "open",
      resolution: null,
    });
    ctx.emit("problem.raised", {
      target: id,
      project: scope.projectId,
      payload: { title: p.title, scopeId: scope.scopeId },
    });
    if (p.discoveredDuring) addRelation(ctx, id, "discovered_during", p.discoveredDuring);
    attach(ctx, id, "caused_by", p.causedBy);
    attach(ctx, id, "derived_from", p.derivedFrom);
    attach(ctx, id, "blocks", p.blocks);
    return requireProblem(ctx, id);
  },
);

export const updateProblem = command(
  "updateProblem",
  z.object({
    problemId: idOf("problem"),
    title: title.optional(),
    description: z.string().optional(),
  }),
  (ctx, p): Problem => {
    const pr = requireProblem(ctx, p.problemId);
    const patch: Record<string, string | number> = { updated_at: ctx.now };
    if (p.title !== undefined) patch.title = p.title;
    if (p.description !== undefined) patch.description = p.description;
    ctx.store.update("problems", { id: pr.id }, patch);
    ctx.emit("problem.updated", { target: pr.id, project: pr.projectId, payload: patch });
    return requireProblem(ctx, pr.id);
  },
);

export const resolveProblem = command(
  "resolveProblem",
  z.object({
    problemId: idOf("problem"),
    resolution: z.string().trim().min(1),
    /** The task, commit or decision that resolved it, if one did. */
    resolvedBy: idOf("task", "commit", "decision").optional(),
  }),
  (ctx, p): Problem => {
    const pr = requireProblem(ctx, p.problemId);
    if (pr.status !== "open") throw new KernelError(`problem is already ${pr.status}`, "conflict");
    ctx.store.update(
      "problems",
      { id: pr.id },
      { status: "resolved", resolution: p.resolution, updated_at: ctx.now },
    );
    ctx.emit("problem.resolved", {
      target: pr.id,
      project: pr.projectId,
      payload: { resolution: p.resolution },
    });
    if (p.resolvedBy) addRelation(ctx, p.resolvedBy, "resolves", pr.id);
    return requireProblem(ctx, pr.id);
  },
);

export const dismissProblem = command(
  "dismissProblem",
  z.object({ problemId: idOf("problem"), reason: z.string().trim().min(1) }),
  (ctx, p): Problem => {
    const pr = requireProblem(ctx, p.problemId);
    if (pr.status !== "open") throw new KernelError(`problem is already ${pr.status}`, "conflict");
    ctx.store.update(
      "problems",
      { id: pr.id },
      { status: "dismissed", resolution: p.reason, updated_at: ctx.now },
    );
    ctx.emit("problem.dismissed", {
      target: pr.id,
      project: pr.projectId,
      payload: { reason: p.reason },
    });
    return requireProblem(ctx, pr.id);
  },
);

// ---- questions -----------------------------------------------------------------

export const raiseQuestion = command(
  "raiseQuestion",
  z.object({ scopeId, title, description: z.string().default(""), derivedFrom: ids }),
  (ctx, p): Question => {
    const scope = requireScope(ctx, p.scopeId);
    const id = newId("question");
    ctx.store.insert("questions", {
      ...itemColumns(ctx, id, scope, p.title),
      description: p.description,
      status: "open",
      answer: null,
    });
    ctx.emit("question.raised", {
      target: id,
      project: scope.projectId,
      payload: { title: p.title, scopeId: scope.scopeId },
    });
    attach(ctx, id, "derived_from", p.derivedFrom);
    return requireQuestion(ctx, id);
  },
);

export const answerQuestion = command(
  "answerQuestion",
  z.object({ questionId: idOf("question"), answer: z.string().trim().min(1) }),
  (ctx, p): Question => {
    const q = requireQuestion(ctx, p.questionId);
    if (q.status !== "open") throw new KernelError("question is already answered", "conflict");
    ctx.store.update(
      "questions",
      { id: q.id },
      { status: "answered", answer: p.answer, updated_at: ctx.now },
    );
    ctx.emit("question.answered", {
      target: q.id,
      project: q.projectId,
      payload: { answer: p.answer },
    });
    return requireQuestion(ctx, q.id);
  },
);

// ---- decisions -----------------------------------------------------------------

export const recordDecision = command(
  "recordDecision",
  z.object({
    scopeId,
    title,
    rationale: z.string().default(""),
    alternatives: z.array(z.string()).default([]),
    derivedFrom: ids,
    resolves: ids,
  }),
  (ctx, p): Decision => {
    const scope = requireScope(ctx, p.scopeId);
    const id = newId("decision");
    ctx.store.insert("decisions", {
      ...itemColumns(ctx, id, scope, p.title),
      rationale: p.rationale,
      alternatives: JSON.stringify(p.alternatives),
    });
    ctx.emit("decision.recorded", {
      target: id,
      project: scope.projectId,
      payload: { title: p.title, scopeId: scope.scopeId },
    });
    attach(ctx, id, "derived_from", p.derivedFrom);
    for (const target of p.resolves) {
      addRelation(ctx, id, "resolves", target);
      if (kindOf(target) === "question") {
        const q = requireQuestion(ctx, target as Id<"question">);
        if (q.status === "open") {
          ctx.store.update(
            "questions",
            { id: q.id },
            { status: "answered", answer: p.title, updated_at: ctx.now },
          );
          ctx.emit("question.answered", {
            target: q.id,
            project: q.projectId,
            payload: { answer: p.title, decisionId: id },
          });
        }
      }
    }
    return ctx.store.decision(id) as Decision;
  },
);

// ---- attention requests --------------------------------------------------------

export const requestAttention = command(
  "requestAttention",
  z.object({
    scopeId,
    kind: z.enum(ATTENTION_KINDS),
    title,
    description: z.string().default(""),
    blocking: z.boolean().default(false),
    refs: ids,
  }),
  (ctx, p): AttentionRequest => {
    const scope = requireScope(ctx, p.scopeId);
    const id = newId("attention");
    ctx.store.insert("attention_requests", {
      ...itemColumns(ctx, id, scope, p.title),
      kind: p.kind,
      description: p.description,
      blocking: p.blocking ? 1 : 0,
      status: "open",
      resolution: null,
      resolved_at: null,
    });
    ctx.emit("attention.requested", {
      target: id,
      project: scope.projectId,
      payload: { kind: p.kind, title: p.title, blocking: p.blocking, scopeId: scope.scopeId },
    });
    attach(ctx, id, "references", p.refs);
    return requireAttention(ctx, id);
  },
);

export const resolveAttention = command(
  "resolveAttention",
  z.object({
    attentionId: idOf("attention"),
    resolution: z.string().trim().min(1),
    /** For a `decision` request: record the decision in the same step. */
    decision: z
      .object({
        title,
        rationale: z.string().default(""),
        alternatives: z.array(z.string()).default([]),
      })
      .optional(),
  }),
  (ctx, p): { attention: AttentionRequest; decision: Decision | null } => {
    const a = requireAttention(ctx, p.attentionId);
    if (a.status !== "open") throw new KernelError(`request is already ${a.status}`, "conflict");
    ctx.store.update(
      "attention_requests",
      { id: a.id },
      { status: "resolved", resolution: p.resolution, resolved_at: ctx.now, updated_at: ctx.now },
    );
    ctx.emit("attention.resolved", {
      target: a.id,
      project: a.projectId,
      payload: { resolution: p.resolution },
    });
    let decision: Decision | null = null;
    if (p.decision) {
      decision = recordDecision.run(ctx, {
        scopeId: a.scopeId,
        title: p.decision.title,
        rationale: p.decision.rationale,
        alternatives: p.decision.alternatives,
        derivedFrom: [a.id],
        resolves: [],
      });
    }
    return { attention: requireAttention(ctx, a.id), decision };
  },
);

export const dismissAttention = command(
  "dismissAttention",
  z.object({ attentionId: idOf("attention") }),
  (ctx, p): AttentionRequest => {
    const a = requireAttention(ctx, p.attentionId);
    if (a.status !== "open") throw new KernelError(`request is already ${a.status}`, "conflict");
    ctx.store.update(
      "attention_requests",
      { id: a.id },
      { status: "dismissed", resolved_at: ctx.now, updated_at: ctx.now },
    );
    ctx.emit("attention.dismissed", { target: a.id, project: a.projectId });
    return requireAttention(ctx, a.id);
  },
);

// ---- shared ----------------------------------------------------------------------

/** Move an item to another scope in the same project. Its origin never changes. */
export const escalateItem = command(
  "escalateItem",
  z.object({ itemId: idOf("task", "problem", "question", "decision", "attention"), scopeId }),
  (ctx, p) => {
    const item = requireItem(ctx, p.itemId);
    const scope = requireScope(ctx, p.scopeId);
    if (scope.projectId !== item.projectId)
      throw new KernelError("scope is in another project", "forbidden");
    const kind = kindOf(p.itemId) as keyof typeof ITEM_TABLE;
    ctx.store.update(
      ITEM_TABLE[kind],
      { id: item.id },
      { scope_id: scope.scopeId, updated_at: ctx.now },
    );
    ctx.emit("item.escalated", {
      target: item.id,
      project: item.projectId,
      payload: { from: item.scopeId, to: scope.scopeId },
    });
    return requireItem(ctx, p.itemId);
  },
);

export const assignOwner = command(
  "assignOwner",
  z.object({ itemId: idOf("task", "problem", "question"), actorId: idOf("agent", "human") }),
  (ctx, p) => {
    const item = requireItem(ctx, p.itemId);
    addRelation(ctx, item.id, "owned_by", p.actorId);
    ctx.emit("item.owned", {
      target: item.id,
      project: item.projectId,
      payload: { actorId: p.actorId },
    });
    return requireItem(ctx, p.itemId);
  },
);
