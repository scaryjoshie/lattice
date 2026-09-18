import type { Agent, Id, ProjectSnapshot, Worktree } from "@pane/kernel/model";
import type { AgentPresence } from "@pane/protocol";
import type { Edge, Node } from "@xyflow/react";
import type { View } from "../store.ts";

/** Geometry. Panes are uniform; the main pane spans the row beneath it. */
export const PANE_W = 240;
export const PANE_H = 150;
export const GAP = 40;
export const REPO_PAD = 16;
export const REPO_HEADER = 36;
export const REPO_GAP = 48;
export const AGENT_W = 56;
export const AGENT_H = 54;
const RECENT_MS = 60_000;

export interface PaneStats {
  tasksDone: number;
  tasksTotal: number;
  problems: number;
  attention: number;
}

export interface PaneData extends Record<string, unknown> {
  worktree: Worktree;
  stats: PaneStats;
  selected: boolean;
  askTarget: boolean;
}

export interface AgentData extends Record<string, unknown> {
  agent: Agent;
  presence: AgentPresence | null;
  /** Observed somewhere other than its home. */
  astray: boolean;
  selected: boolean;
  askTarget: boolean;
}

export interface RepositoryData extends Record<string, unknown> {
  name: string;
  branch: string;
  askTarget: boolean;
}

export interface WireData extends Record<string, unknown> {
  conversationId: Id<"conversation">;
  recent: boolean;
}

export type PaneNode = Node<PaneData, "pane">;
export type AgentNode = Node<AgentData, "agent">;
export type RepositoryNode = Node<RepositoryData, "repository">;
export type CanvasNode = PaneNode | AgentNode | RepositoryNode;

export interface Layout {
  nodes: CanvasNode[];
  edges: Edge[];
}

const live = (w: Worktree) => w.status !== "merged" && w.status !== "abandoned";

export function layout(
  s: ProjectSnapshot | null,
  presence: Record<string, AgentPresence>,
  view: View,
  selection: string[],
  askMode: boolean,
): Layout {
  const nodes: CanvasNode[] = [];
  const edges: Edge[] = [];
  if (!s) return { nodes, edges };
  const selected = new Set(selection);
  const isTarget = (id: string) => askMode && selected.has(id);

  const homeOf = new Map<string, Id<"worktree">>();
  const locationOf = new Map<string, Id<"worktree">>();
  for (const r of s.relations) {
    if (r.type === "assigned_to") homeOf.set(r.sourceId, r.targetId as Id<"worktree">);
    if (r.type === "located_in") locationOf.set(r.sourceId, r.targetId as Id<"worktree">);
  }
  const agentsIn = (w: Worktree) =>
    s.agents.filter((a) => a.lifecycle !== "archived" && homeOf.get(a.id) === w.id);

  const stats = (w: Worktree): PaneStats => {
    const tasks = s.tasks.filter((t) => t.scopeId === w.id && t.status !== "cancelled");
    return {
      tasksDone: tasks.filter((t) => t.status === "done").length,
      tasksTotal: tasks.length,
      problems: s.problems.filter((p) => p.scopeId === w.id && p.status === "open").length,
      attention: s.attention.filter((a) => a.scopeId === w.id && a.status === "open").length,
    };
  };

  const pane = (w: Worktree, parent: string, x: number, y: number, width: number): void => {
    nodes.push({
      id: w.id,
      type: "pane",
      parentId: parent,
      position: { x, y },
      width,
      height: PANE_H,
      draggable: false,
      data: {
        worktree: w,
        stats: stats(w),
        selected: selected.has(w.id),
        askTarget: isTarget(w.id),
      },
    });
    agentsIn(w).forEach((a, i) => {
      const loc = locationOf.get(a.id);
      nodes.push({
        id: a.id,
        type: "agent",
        parentId: w.id,
        extent: "parent",
        position: { x: 8 + i * (AGENT_W + 4), y: PANE_H - AGENT_H - 8 },
        width: AGENT_W,
        height: AGENT_H,
        draggable: false,
        data: {
          agent: a,
          presence: presence[a.id] ?? null,
          astray: loc !== undefined && loc !== w.id,
          selected: selected.has(a.id),
          askTarget: isTarget(a.id),
        },
      });
    });
  };

  let x = 0;
  for (const repo of s.repositories) {
    const all = s.worktrees.filter((w) => w.repositoryId === repo.id);
    const main = all.find((w) => w.isMain);
    if (!main) continue;
    const features = all.filter((w) => !w.isMain && live(w));
    const n = features.length;
    const rowW = Math.max(1, n) * PANE_W + Math.max(0, n - 1) * GAP;
    const width = rowW + 2 * REPO_PAD;
    const height = REPO_HEADER + REPO_PAD + PANE_H + (n ? GAP + PANE_H : 0) + REPO_PAD;
    const dimmed = view.level === "repository" && view.id !== repo.id;
    nodes.push({
      id: repo.id,
      type: "repository",
      position: { x, y: 0 },
      width,
      height,
      draggable: false,
      selectable: false,
      className: dimmed ? "dimmed" : undefined,
      data: { name: repo.name, branch: main.branch, askTarget: isTarget(repo.id) },
    });
    pane(main, repo.id, REPO_PAD, REPO_HEADER + REPO_PAD, rowW);
    features.forEach((w, i) => {
      pane(
        w,
        repo.id,
        REPO_PAD + i * (PANE_W + GAP),
        REPO_HEADER + REPO_PAD + PANE_H + GAP,
        PANE_W,
      );
      edges.push({
        id: `tree:${w.id}`,
        source: main.id,
        target: w.id,
        type: "default",
        selectable: false,
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
        className: dimmed ? "dimmed" : undefined,
      });
    });
    x += width + REPO_GAP;
  }

  const shown = new Set(nodes.filter((n) => n.type === "agent").map((n) => n.id));
  for (const c of s.conversations) {
    if (c.kind !== "dm") continue;
    const [a, b] = c.participantIds;
    if (!a || !b || !shown.has(a) || !shown.has(b)) continue;
    const recent = c.lastMessageAt !== null && Date.now() - c.lastMessageAt < RECENT_MS;
    edges.push({
      id: `wire:${c.id}`,
      source: a,
      target: b,
      type: "wire",
      animated: recent,
      data: { conversationId: c.id, recent } satisfies WireData,
    });
  }
  return { nodes, edges };
}
