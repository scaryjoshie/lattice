import { z } from "zod";
import {
  type ActorId,
  actorId,
  anyId,
  type Commit,
  type Conversation,
  DELIVERY_STATUSES,
  type Delivery,
  type Id,
  idOf,
  type Message,
  newId,
  scopeId,
} from "../model/index.ts";
import { type Ctx, command, KernelError } from "./define.ts";
import {
  requireActor,
  requireConversation,
  requireProject,
  requireRepository,
  requireScope,
} from "./guards.ts";
import { attach } from "./relations.ts";

// ---- commits -------------------------------------------------------------------

/** Idempotent on (repository, sha): recording a known commit returns it unchanged. */
export const recordCommit = command(
  "recordCommit",
  z.object({
    repositoryId: idOf("repository"),
    sha: z.string().min(7),
    message: z.string(),
    authorName: z.string(),
    authoredAt: z.number(),
    insertions: z.number().int().nonnegative().default(0),
    deletions: z.number().int().nonnegative().default(0),
    filesChanged: z.number().int().nonnegative().default(0),
    /** The worktree it was made in, for a `references` edge. */
    worktreeId: idOf("worktree").optional(),
    addresses: z.array(anyId).default([]),
    resolves: z.array(anyId).default([]),
  }),
  (ctx, p): Commit => {
    const repo = requireRepository(ctx, p.repositoryId);
    const known = ctx.store.commitBySha(repo.id, p.sha);
    if (known) return known;
    const id = newId("commit");
    ctx.store.insert("commits", {
      id,
      project_id: repo.projectId,
      repository_id: repo.id,
      sha: p.sha,
      message: p.message,
      author_name: p.authorName,
      authored_at: p.authoredAt,
      insertions: p.insertions,
      deletions: p.deletions,
      files_changed: p.filesChanged,
      explanation: null,
      recorded_by: ctx.actor,
      recorded_at: ctx.now,
    });
    ctx.emit("commit.recorded", {
      target: id,
      project: repo.projectId,
      payload: {
        sha: p.sha,
        message: p.message.split("\n")[0] ?? "",
        worktreeId: p.worktreeId ?? null,
      },
    });
    if (p.worktreeId) attach(ctx, id, "references", [p.worktreeId]);
    attach(ctx, id, "addresses", p.addresses);
    attach(ctx, id, "resolves", p.resolves);
    return ctx.store.commit(id) as Commit;
  },
);

export const explainCommit = command(
  "explainCommit",
  z.object({ commitId: idOf("commit"), explanation: z.string().trim().min(1) }),
  (ctx, p): Commit => {
    const c = ctx.store.commit(p.commitId);
    if (!c) throw new KernelError(`commit ${p.commitId} not found`, "not_found");
    ctx.store.update("commits", { id: c.id }, { explanation: p.explanation });
    ctx.emit("commit.explained", { target: c.id, project: c.projectId });
    return ctx.store.commit(c.id) as Commit;
  },
);

// ---- conversations -------------------------------------------------------------

export const groupKey = (scope: Id<"worktree"> | Id<"repository"> | Id<"project">) =>
  `group:${scope}`;
export const dmKey = (a: ActorId, b: ActorId) => `dm:${[a, b].sort().join("+")}`;

function insertConversation(
  ctx: Ctx,
  c: {
    projectId: Id<"project">;
    kind: Conversation["kind"];
    key: string;
    scopeId: Conversation["scopeId"];
    title: string | null;
  },
): Conversation {
  const id = newId("conversation");
  ctx.store.insert("conversations", {
    id,
    project_id: c.projectId,
    kind: c.kind,
    key: c.key,
    scope_id: c.scopeId,
    title: c.title,
    created_by: ctx.actor,
    created_at: ctx.now,
  });
  ctx.emit("conversation.opened", {
    target: id,
    project: c.projectId,
    payload: { kind: c.kind, scopeId: c.scopeId },
  });
  return requireConversation(ctx, id);
}

/** The room of a scope, created with every human in it. Idempotent. */
export function openGroup(ctx: Ctx, projectId: Id<"project">, scope: Id<"worktree">): Conversation {
  const key = groupKey(scope);
  const existing = ctx.store.conversationByKey(key);
  if (existing) return existing;
  const c = insertConversation(ctx, { projectId, kind: "group", key, scopeId: scope, title: null });
  for (const h of ctx.store.humans()) joinGroup(ctx, c.id, h.id);
  return c;
}

export function joinGroup(ctx: Ctx, conversationId: Id<"conversation">, actor: ActorId): void {
  if (ctx.store.isParticipant(conversationId, actor)) return;
  ctx.store.insert("participants", {
    conversation_id: conversationId,
    actor_id: actor,
    joined_at: ctx.now,
  });
  const c = requireConversation(ctx, conversationId);
  ctx.emit("conversation.joined", {
    target: conversationId,
    project: c.projectId,
    payload: { actorId: actor },
  });
}

export function leaveGroup(ctx: Ctx, conversationId: Id<"conversation">, actor: ActorId): void {
  const n = ctx.store.delete("participants", { conversation_id: conversationId, actor_id: actor });
  if (!n) return;
  const c = requireConversation(ctx, conversationId);
  ctx.emit("conversation.left", {
    target: conversationId,
    project: c.projectId,
    payload: { actorId: actor },
  });
}

/** A DM between two actors (one per pair), or a fresh ask thread. */
export const openConversation = command(
  "openConversation",
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("dm"), projectId: idOf("project"), a: actorId, b: actorId }),
    z.object({
      kind: z.literal("ask"),
      projectId: idOf("project"),
      scopeId: scopeId.nullable().default(null),
      title: z.string().nullable().default(null),
    }),
  ]),
  (ctx, p): Conversation => {
    requireProject(ctx, p.projectId);
    if (p.kind === "dm") {
      if (p.a === p.b) throw new KernelError("a DM needs two different actors");
      requireActor(ctx, p.a);
      requireActor(ctx, p.b);
      for (const id of [p.a, p.b]) {
        const agent = ctx.store.agent(id as Id<"agent">);
        if (agent && agent.projectId !== p.projectId)
          throw new KernelError(`${id} is in another project`, "forbidden");
      }
      const key = dmKey(p.a, p.b);
      const existing = ctx.store.conversationByKey(key);
      if (existing) return existing;
      const c = insertConversation(ctx, {
        projectId: p.projectId,
        kind: "dm",
        key,
        scopeId: null,
        title: null,
      });
      joinGroup(ctx, c.id, p.a);
      joinGroup(ctx, c.id, p.b);
      return c;
    }
    if (p.scopeId) requireScope(ctx, p.scopeId);
    const id = newId("conversation");
    const c = insertConversation(ctx, {
      projectId: p.projectId,
      kind: "ask",
      key: `ask:${id}`,
      scopeId: p.scopeId,
      title: p.title,
    });
    joinGroup(ctx, c.id, ctx.actor);
    return c;
  },
);

export const joinConversation = command(
  "joinConversation",
  z.object({ conversationId: idOf("conversation"), actorId }),
  (ctx, p): Conversation => {
    const c = requireConversation(ctx, p.conversationId);
    requireActor(ctx, p.actorId);
    if (c.kind === "dm") throw new KernelError("a DM has exactly two participants", "forbidden");
    joinGroup(ctx, c.id, p.actorId);
    return c;
  },
);

/** The caller posts; every other participant gets a pending delivery. */
export const postMessage = command(
  "postMessage",
  z.object({
    conversationId: idOf("conversation"),
    body: z.string().refine((s) => s.trim().length > 0, "empty message"),
  }),
  (ctx, p): { message: Message; deliveries: Delivery[] } => {
    const c = requireConversation(ctx, p.conversationId);
    if (!ctx.store.isParticipant(c.id, ctx.actor)) {
      throw new KernelError("sender is not in this conversation", "forbidden");
    }
    const id = newId("message");
    ctx.store.insert("messages", {
      id,
      conversation_id: c.id,
      from_actor_id: ctx.actor,
      body: p.body,
      created_at: ctx.now,
    });
    const recipients = ctx.store.participantsOf(c.id).filter((x) => x.actorId !== ctx.actor);
    for (const r of recipients) {
      ctx.store.insert("deliveries", {
        message_id: id,
        to_actor_id: r.actorId,
        status: "pending",
        detail: null,
        updated_at: ctx.now,
        read_at: null,
      });
    }
    ctx.emit("message.posted", {
      target: id,
      project: c.projectId,
      payload: { conversationId: c.id, to: recipients.map((r) => r.actorId) },
    });
    return { message: ctx.store.message(id) as Message, deliveries: ctx.store.deliveriesOf(id) };
  },
);

/** The runtime reports what happened to a delivery. Never downgrades `read`. */
export const setDelivery = command(
  "setDelivery",
  z.object({
    messageId: idOf("message"),
    toActorId: actorId,
    status: z.enum(DELIVERY_STATUSES),
    detail: z.string().nullable().default(null),
  }),
  (ctx, p): Delivery => {
    const d = ctx.store.delivery(p.messageId, p.toActorId);
    if (!d) throw new KernelError("no such delivery", "not_found");
    if (d.status === "read") return d;
    const m = ctx.store.message(p.messageId) as Message;
    const c = requireConversation(ctx, m.conversationId);
    ctx.store.update(
      "deliveries",
      { message_id: p.messageId, to_actor_id: p.toActorId },
      {
        status: p.status,
        detail: p.detail,
        updated_at: ctx.now,
        read_at: p.status === "read" ? ctx.now : null,
      },
    );
    ctx.emit("delivery.updated", {
      target: p.messageId,
      project: c.projectId,
      payload: { toActorId: p.toActorId, status: p.status, conversationId: c.id },
    });
    return ctx.store.delivery(p.messageId, p.toActorId) as Delivery;
  },
);

/** Everything unread for an actor in a conversation becomes read. Returns how many. */
export const markRead = command(
  "markRead",
  z.object({ conversationId: idOf("conversation"), actorId: actorId.optional() }),
  (ctx, p): number => {
    const c = requireConversation(ctx, p.conversationId);
    const who = p.actorId ?? ctx.actor;
    const n = ctx.store.db.run(
      `UPDATE deliveries SET status = 'read', read_at = ?, updated_at = ?
       WHERE to_actor_id = ? AND read_at IS NULL
         AND message_id IN (SELECT id FROM messages WHERE conversation_id = ?)`,
      [ctx.now, ctx.now, who, c.id],
    ).changes;
    if (n > 0)
      ctx.emit("conversation.read", {
        target: c.id,
        project: c.projectId,
        payload: { actorId: who, count: n },
      });
    return n;
  },
);
