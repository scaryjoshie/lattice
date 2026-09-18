import type { ActorId, ObjectKind } from "./ids.ts";

/**
 * The graph: typed edges between objects. Each type says which kinds may sit at
 * either end, and whether a source may have only one edge of that type.
 */

export const RELATION_TYPES = [
  "assigned_to",
  "located_in",
  "owned_by",
  "depends_on",
  "blocks",
  "addresses",
  "resolves",
  "discovered_during",
  "caused_by",
  "derived_from",
  "references",
  "forked_from",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export interface Relation {
  sourceId: string;
  type: RelationType;
  targetId: string;
  createdBy: ActorId;
  createdAt: number;
}

export interface RelationRule {
  source: readonly ObjectKind[];
  target: readonly ObjectKind[];
  /** At most one edge of this type per source. Adding another replaces it. */
  exclusive?: boolean;
  /** Source and target must both be tasks and the graph must stay acyclic. */
  acyclic?: boolean;
}

const ITEMS: readonly ObjectKind[] = ["task", "problem", "question", "decision", "attention"];
const EVIDENCE: readonly ObjectKind[] = ["commit", "conversation", "message"];
const ANY: readonly ObjectKind[] = [
  "project",
  "repository",
  "worktree",
  "human",
  "agent",
  "task",
  "problem",
  "question",
  "decision",
  "attention",
  "commit",
  "conversation",
  "message",
];

export const RELATION_RULES: Record<RelationType, RelationRule> = {
  /** An agent's organizational home. */
  assigned_to: { source: ["agent"], target: ["worktree"], exclusive: true },
  /** Where an agent's process was last observed. */
  located_in: { source: ["agent"], target: ["worktree"], exclusive: true },
  /** Who is responsible for an item. */
  owned_by: {
    source: ["task", "problem", "question"],
    target: ["agent", "human"],
    exclusive: true,
  },
  depends_on: { source: ["task"], target: ["task"], acyclic: true },
  blocks: { source: ["problem", "task", "question"], target: ["task", "worktree"] },
  addresses: { source: ["task", "commit"], target: ["problem", "question"] },
  resolves: { source: ["task", "commit", "decision"], target: ["problem", "question"] },
  discovered_during: { source: ["problem", "question"], target: ["task", "worktree"] },
  caused_by: { source: [...ITEMS, "worktree"], target: [...ITEMS, ...EVIDENCE] },
  derived_from: { source: ITEMS, target: [...ITEMS, ...EVIDENCE, "attention"] },
  references: { source: ANY, target: ANY },
  forked_from: { source: ["agent"], target: ["agent"], exclusive: true },
};

/** Edge types that answer "why does this exist?", walked from an object backward. */
export const PROVENANCE_TYPES: readonly RelationType[] = [
  "derived_from",
  "caused_by",
  "discovered_during",
  "forked_from",
];
