import { type Id, kindOf, type ProjectSnapshot } from "@pane/kernel/model";

/** Human-readable label for any id in a snapshot. */
export function titleOf(s: ProjectSnapshot | null, id: string): string {
  if (!s) return id;
  switch (kindOf(id)) {
    case "project":
      return s.project.name;
    case "repository":
      return s.repositories.find((r) => r.id === id)?.name ?? id;
    case "worktree":
      return s.worktrees.find((w) => w.id === id)?.name ?? id;
    case "agent":
    case "human":
    case "system":
      return s.actors.find((a) => a.id === id)?.name ?? id;
    case "task":
      return s.tasks.find((t) => t.id === id)?.title ?? id;
    case "problem":
      return s.problems.find((p) => p.id === id)?.title ?? id;
    case "question":
      return s.questions.find((q) => q.id === id)?.title ?? id;
    case "decision":
      return s.decisions.find((d) => d.id === id)?.title ?? id;
    case "attention":
      return s.attention.find((a) => a.id === id)?.title ?? id;
    case "commit":
      return s.commits.find((c) => c.id === id)?.message.split("\n")[0] ?? id;
    case "conversation": {
      const c = s.conversations.find((x) => x.id === id);
      if (!c) return id;
      if (c.kind === "group" && c.scopeId) return titleOf(s, c.scopeId);
      return c.participantIds.map((p) => titleOf(s, p)).join(" · ");
    }
    default:
      return id;
  }
}

export function scopeName(s: ProjectSnapshot | null, scopeId: string): string {
  return titleOf(s, scopeId);
}

export function agentHome(s: ProjectSnapshot | null, agentId: Id<"agent">): Id<"worktree"> | null {
  return (
    (s?.relations.find((r) => r.sourceId === agentId && r.type === "assigned_to")?.targetId as
      | Id<"worktree">
      | undefined) ?? null
  );
}

export function agentLocation(
  s: ProjectSnapshot | null,
  agentId: Id<"agent">,
): Id<"worktree"> | null {
  return (
    (s?.relations.find((r) => r.sourceId === agentId && r.type === "located_in")?.targetId as
      | Id<"worktree">
      | undefined) ?? null
  );
}

export function timeAgo(t: number): string {
  const d = Math.max(0, Date.now() - t);
  if (d < 60_000) return "now";
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}h`;
  return `${Math.floor(d / 86400_000)}d`;
}
