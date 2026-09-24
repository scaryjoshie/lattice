import {
  type ActorId,
  type Agent,
  type AttentionRequest,
  type Conversation,
  type Decision,
  type Id,
  type ItemId,
  kindOf,
  type Problem,
  type Project,
  type Question,
  type Repository,
  type ScopeId,
  type Task,
  type Worktree,
} from "../model/index.ts";
import type { Ctx } from "./define.ts";
import { KernelError } from "./define.ts";

/** Lookups that throw `not_found` with a readable message. */

function missing(what: string, id: string): never {
  throw new KernelError(`${what} ${id} not found`, "not_found");
}

export const requireProject = (ctx: Ctx, id: Id<"project">): Project =>
  ctx.store.project(id) ?? missing("project", id);
export const requireRepository = (ctx: Ctx, id: Id<"repository">): Repository =>
  ctx.store.repository(id) ?? missing("repository", id);
export const requireWorktree = (ctx: Ctx, id: Id<"worktree">): Worktree =>
  ctx.store.worktree(id) ?? missing("worktree", id);
export const requireAgent = (ctx: Ctx, id: Id<"agent">): Agent =>
  ctx.store.agent(id) ?? missing("agent", id);
export const requireTask = (ctx: Ctx, id: Id<"task">): Task =>
  ctx.store.task(id) ?? missing("task", id);
export const requireProblem = (ctx: Ctx, id: Id<"problem">): Problem =>
  ctx.store.problem(id) ?? missing("problem", id);
export const requireQuestion = (ctx: Ctx, id: Id<"question">): Question =>
  ctx.store.question(id) ?? missing("question", id);
export const requireDecision = (ctx: Ctx, id: Id<"decision">): Decision =>
  ctx.store.decision(id) ?? missing("decision", id);
export const requireAttention = (ctx: Ctx, id: Id<"attention">): AttentionRequest =>
  ctx.store.attention(id) ?? missing("attention request", id);
export const requireConversation = (ctx: Ctx, id: Id<"conversation">): Conversation =>
  ctx.store.conversation(id) ?? missing("conversation", id);

export function requireActor(ctx: Ctx, id: ActorId) {
  return ctx.store.actor(id) ?? missing("actor", id);
}

/** A scope and the project it belongs to. */
export function requireScope(
  ctx: Ctx,
  scopeId: ScopeId,
): { scopeId: ScopeId; projectId: Id<"project"> } {
  const projectId = ctx.store.projectOfScope(scopeId);
  if (!projectId) missing("scope", scopeId);
  return { scopeId, projectId };
}

/** Any object, and that it exists. */
export function requireObject(ctx: Ctx, id: string) {
  const o = ctx.store.object(id);
  if (!o) missing(kindOf(id) ?? "object", id);
  return o;
}

export function requireSameProject(ctx: Ctx, projectId: Id<"project">, ...ids: string[]): void {
  for (const id of ids) {
    const p = ctx.store.projectOf(id);
    if (p === undefined) missing(kindOf(id) ?? "object", id);
    if (p !== projectId) {
      throw new KernelError(`${id} belongs to another project`, "forbidden");
    }
  }
}

/** The task, problem or question an id names. */
export function requireItem(
  ctx: Ctx,
  id: ItemId,
): Task | Problem | Question | Decision | AttentionRequest {
  switch (kindOf(id)) {
    case "task":
      return requireTask(ctx, id as Id<"task">);
    case "problem":
      return requireProblem(ctx, id as Id<"problem">);
    case "question":
      return requireQuestion(ctx, id as Id<"question">);
    case "decision":
      return requireDecision(ctx, id as Id<"decision">);
    case "attention":
      return requireAttention(ctx, id as Id<"attention">);
    default:
      return missing("item", id);
  }
}

export const ITEM_TABLE: Record<
  "task" | "problem" | "question" | "decision" | "attention",
  string
> = {
  task: "tasks",
  problem: "problems",
  question: "questions",
  decision: "decisions",
  attention: "attention_requests",
};
