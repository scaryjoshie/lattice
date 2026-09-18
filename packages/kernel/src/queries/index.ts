import {
  type ActorId,
  type AnyObject,
  type AttentionRequest,
  type ConversationSummary,
  type Event,
  type Id,
  kindOf,
  PROVENANCE_TYPES,
  type Project,
  type ProjectSnapshot,
  type Relation,
  type Repository,
  type ScopeId,
  type Worktree,
} from "../model/index.ts";
import type { Store } from "../store/store.ts";

/** Reads. Plain functions over the store; surfaces and services compose them. */

export function listProjects(store: Store): Project[] {
  return store.projects().filter((p) => p.archivedAt === null);
}

export function projectSnapshot(
  store: Store,
  projectId: Id<"project">,
): ProjectSnapshot | undefined {
  const project = store.project(projectId);
  if (!project) return undefined;
  const humans = store.humans().map((h) => h.id);
  const conversations: ConversationSummary[] = store.conversationsOf(projectId).map((c) => {
    const stats = store.get<{ n: number; last: number | null }>(
      "SELECT COUNT(*) AS n, MAX(created_at) AS last FROM messages WHERE conversation_id = ?",
      c.id,
    );
    const unreadForHuman = humans.reduce((n, h) => n + store.unreadCount(h, c.id), 0);
    return {
      ...c,
      participantIds: store.participantsOf(c.id).map((p) => p.actorId),
      messageCount: stats?.n ?? 0,
      lastMessageAt: stats?.last ?? null,
      unreadForHuman,
    };
  });
  return {
    project,
    repositories: store.repositoriesOf(projectId),
    worktrees: store.worktreesOf(projectId),
    actors: store.actors(),
    agents: store.agentsOf(projectId),
    tasks: store.tasksOf(projectId),
    problems: store.problemsOf(projectId),
    questions: store.questionsOf(projectId),
    decisions: store.decisionsOf(projectId),
    attention: store.attentionOf(projectId),
    commits: store.commitsOf(projectId),
    conversations,
    relations: store.relationsOf(projectId),
    eventSeq: store.lastEventSeq(),
  };
}

/** Open attention requests, blocking first, oldest first within each. */
export function needsYou(store: Store, projectId?: Id<"project">): AttentionRequest[] {
  const all = projectId
    ? store.attentionOf(projectId)
    : store.projects().flatMap((p) => store.attentionOf(p.id));
  return all
    .filter((a) => a.status === "open")
    .sort((x, y) => Number(y.blocking) - Number(x.blocking) || x.createdAt - y.createdAt);
}

/** Project → repository → worktree, outermost first. */
export function scopePath(store: Store, scopeId: ScopeId): Array<Project | Repository | Worktree> {
  switch (kindOf(scopeId)) {
    case "project": {
      const p = store.project(scopeId as Id<"project">);
      return p ? [p] : [];
    }
    case "repository": {
      const r = store.repository(scopeId as Id<"repository">);
      return r ? [...scopePath(store, r.projectId), r] : [];
    }
    case "worktree": {
      const w = store.worktree(scopeId as Id<"worktree">);
      return w ? [...scopePath(store, w.repositoryId), w] : [];
    }
    default:
      return [];
  }
}

export interface ProvenanceNode {
  object: AnyObject;
  /** The event that created it, if recorded. */
  created: Event | null;
  edges: Array<{ relation: Relation; node: ProvenanceNode }>;
}

/** Why does this exist? Walk provenance edges backward, bounded by depth. */
export function provenance(
  store: Store,
  id: string,
  depth = 4,
  seen = new Set<string>(),
): ProvenanceNode | undefined {
  const object = store.object(id);
  if (!object) return undefined;
  seen.add(id);
  const created = store.eventsFor(id)[0] ?? null;
  const edges: ProvenanceNode["edges"] = [];
  if (depth > 0) {
    for (const relation of store.relationsFrom(id)) {
      if (!PROVENANCE_TYPES.includes(relation.type)) continue;
      if (seen.has(relation.targetId)) continue;
      const node = provenance(store, relation.targetId, depth - 1, seen);
      if (node) edges.push({ relation, node });
    }
  }
  return { object, created, edges };
}

export interface WorktreeSummary {
  worktree: Worktree;
  tasks: { total: number; done: number; inProgress: number; blocked: number };
  problemsOpen: number;
  questionsOpen: number;
  attentionOpen: number;
  agentIds: Id<"agent">[];
  commits: number;
}

export function worktreeSummary(
  store: Store,
  worktreeId: Id<"worktree">,
): WorktreeSummary | undefined {
  const worktree = store.worktree(worktreeId);
  if (!worktree) return undefined;
  const tasks = store.tasksOf(worktree.projectId).filter((t) => t.scopeId === worktree.id);
  const count = (s: string) => tasks.filter((t) => t.status === s).length;
  return {
    worktree,
    tasks: {
      total: tasks.length,
      done: count("done"),
      inProgress: count("in_progress"),
      blocked: count("blocked"),
    },
    problemsOpen: store
      .problemsOf(worktree.projectId)
      .filter((p) => p.scopeId === worktree.id && p.status === "open").length,
    questionsOpen: store
      .questionsOf(worktree.projectId)
      .filter((q) => q.scopeId === worktree.id && q.status === "open").length,
    attentionOpen: store
      .attentionOf(worktree.projectId)
      .filter((a) => a.scopeId === worktree.id && a.status === "open").length,
    agentIds: store.relationsTo(worktree.id, "assigned_to").map((r) => r.sourceId as Id<"agent">),
    commits: store
      .relationsTo(worktree.id, "references")
      .filter((r) => kindOf(r.sourceId) === "commit").length,
  };
}

/** Agents whose organizational home is this worktree. */
export function agentsIn(store: Store, worktreeId: Id<"worktree">) {
  return store
    .relationsTo(worktreeId, "assigned_to")
    .map((r) => store.agent(r.sourceId as Id<"agent">))
    .filter((a) => a !== undefined);
}

/** The worktree an agent is assigned to, and the one it was last seen in. */
export function agentPlacement(store: Store, agentId: Id<"agent">) {
  const assigned = store.relationsFrom(agentId, "assigned_to")[0]?.targetId as
    | Id<"worktree">
    | undefined;
  const located = store.relationsFrom(agentId, "located_in")[0]?.targetId as
    | Id<"worktree">
    | undefined;
  return { assignedTo: assigned ?? null, locatedIn: located ?? null };
}

export function messages(
  store: Store,
  conversationId: Id<"conversation">,
  opts: { beforeSeq?: number; limit?: number } = {},
) {
  return store.messagesOf(conversationId, {
    beforeSeq: opts.beforeSeq,
    limit: Math.min(opts.limit ?? 100, 500),
  });
}

/** Messages waiting to be pushed to an actor, oldest first. */
export function undelivered(store: Store, actorId: ActorId) {
  return store.pendingFor(actorId, ["pending", "failed"]);
}

export function eventsSince(store: Store, seq: number, projectId?: Id<"project">) {
  return store.eventsSince(seq, projectId);
}
