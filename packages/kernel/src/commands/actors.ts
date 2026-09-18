import { z } from "zod";
import { type Actor, AGENT_LIFECYCLES, type Agent, type Id, idOf, newId } from "../model/index.ts";
import { type Ctx, command, KernelError } from "./define.ts";
import { groupKey, joinGroup, leaveGroup } from "./evidence.ts";
import { requireAgent, requireProject, requireWorktree } from "./guards.ts";
import { addRelation, exclusiveTarget, removeRelation } from "./relations.ts";

const name = z.string().trim().min(1).max(80);

export const createHuman = command("createHuman", z.object({ name }), (ctx, p): Actor => {
  const id = newId("human");
  ctx.store.insert("actors", { id, kind: "human", name: p.name, created_at: ctx.now });
  ctx.emit("actor.created", { target: id, payload: { kind: "human", name: p.name } });
  return ctx.store.actor(id) as Actor;
});

/** A persistent logical agent, assigned to a worktree from birth. */
export const createAgent = command(
  "createAgent",
  z.object({
    projectId: idOf("project"),
    name,
    provider: z.string().min(1).max(40),
    model: z.string().nullable().default(null),
    worktreeId: idOf("worktree"),
    forkedFromId: idOf("agent").optional(),
  }),
  (ctx, p): Agent => {
    requireProject(ctx, p.projectId);
    const wt = requireWorktree(ctx, p.worktreeId);
    if (wt.projectId !== p.projectId)
      throw new KernelError("worktree is in another project", "forbidden");
    if (p.forkedFromId) requireAgent(ctx, p.forkedFromId);
    const id = newId("agent");
    ctx.store.insert("actors", { id, kind: "agent", name: p.name, created_at: ctx.now });
    ctx.store.insert("agents", {
      id,
      project_id: p.projectId,
      provider: p.provider,
      model: p.model,
      session_key: null,
      lifecycle: "offline",
      forked_from_id: p.forkedFromId ?? null,
      created_by: ctx.actor,
      created_at: ctx.now,
      updated_at: ctx.now,
    });
    ctx.emit("agent.created", {
      target: id,
      project: p.projectId,
      payload: {
        name: p.name,
        provider: p.provider,
        worktreeId: wt.id,
        forkedFromId: p.forkedFromId ?? null,
      },
    });
    assign(ctx, id, wt.id);
    if (p.forkedFromId) addRelation(ctx, id, "forked_from", p.forkedFromId);
    return requireAgent(ctx, id);
  },
);

function assign(ctx: Ctx, agentId: Id<"agent">, worktreeId: Id<"worktree">): void {
  const wt = requireWorktree(ctx, worktreeId);
  const previous = exclusiveTarget(ctx, agentId, "assigned_to") as Id<"worktree"> | undefined;
  if (previous === wt.id) return;
  if (previous) {
    const old = ctx.store.conversationByKey(groupKey(previous));
    if (old) leaveGroup(ctx, old.id, agentId);
  }
  addRelation(ctx, agentId, "assigned_to", wt.id);
  const room = ctx.store.conversationByKey(groupKey(wt.id));
  if (room) joinGroup(ctx, room.id, agentId);
  ctx.emit("agent.assigned", {
    target: agentId,
    project: wt.projectId,
    payload: { worktreeId: wt.id },
  });
}

export const updateAgent = command(
  "updateAgent",
  z.object({
    agentId: idOf("agent"),
    name: name.optional(),
    model: z.string().nullable().optional(),
    sessionKey: z.string().nullable().optional(),
  }),
  (ctx, p): Agent => {
    const a = requireAgent(ctx, p.agentId);
    const patch: Record<string, string | number | null> = { updated_at: ctx.now };
    if (p.model !== undefined) patch.model = p.model;
    if (p.sessionKey !== undefined) patch.session_key = p.sessionKey;
    ctx.store.update("agents", { id: a.id }, patch);
    if (p.name !== undefined) ctx.store.update("actors", { id: a.id }, { name: p.name });
    ctx.emit("agent.updated", {
      target: a.id,
      project: a.projectId,
      payload: { ...patch, ...(p.name !== undefined ? { name: p.name } : {}) },
    });
    return requireAgent(ctx, a.id);
  },
);

export const setAgentLifecycle = command(
  "setAgentLifecycle",
  z.object({
    agentId: idOf("agent"),
    lifecycle: z.enum(AGENT_LIFECYCLES),
    detail: z.string().optional(),
  }),
  (ctx, p): Agent => {
    const a = requireAgent(ctx, p.agentId);
    if (a.lifecycle === p.lifecycle) return a;
    if (a.lifecycle === "archived")
      throw new KernelError("an archived agent stays archived", "forbidden");
    ctx.store.update("agents", { id: a.id }, { lifecycle: p.lifecycle, updated_at: ctx.now });
    ctx.emit(`agent.${p.lifecycle}`, {
      target: a.id,
      project: a.projectId,
      payload: { from: a.lifecycle, detail: p.detail ?? null },
    });
    return requireAgent(ctx, a.id);
  },
);

export const assignAgent = command(
  "assignAgent",
  z.object({ agentId: idOf("agent"), worktreeId: idOf("worktree") }),
  (ctx, p): Agent => {
    const a = requireAgent(ctx, p.agentId);
    const wt = requireWorktree(ctx, p.worktreeId);
    if (wt.projectId !== a.projectId)
      throw new KernelError("worktree is in another project", "forbidden");
    assign(ctx, a.id, wt.id);
    return requireAgent(ctx, a.id);
  },
);

/** Where an agent's process was seen. Null clears it (no process, or outside any worktree). */
export const observeAgentLocation = command(
  "observeAgentLocation",
  z.object({ agentId: idOf("agent"), worktreeId: idOf("worktree").nullable() }),
  (ctx, p): Agent => {
    const a = requireAgent(ctx, p.agentId);
    const current = exclusiveTarget(ctx, a.id, "located_in");
    if (current === (p.worktreeId ?? undefined)) return a;
    if (p.worktreeId) {
      requireWorktree(ctx, p.worktreeId);
      addRelation(ctx, a.id, "located_in", p.worktreeId);
    } else {
      for (const r of ctx.store.relationsFrom(a.id, "located_in")) removeRelation(ctx, r);
    }
    ctx.emit("agent.located", {
      target: a.id,
      project: a.projectId,
      payload: { worktreeId: p.worktreeId },
    });
    return a;
  },
);
