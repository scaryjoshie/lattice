import type { ActorId, ActorKind, Id, ScopeId } from "./ids.ts";

/** Scopes: where. The one containment tree. */

export interface Project {
  id: Id<"project">;
  name: string;
  goals: string;
  createdBy: ActorId;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export type RepositoryMode = "managed" | "adopted";

export interface Repository {
  id: Id<"repository">;
  projectId: Id<"project">;
  name: string;
  mode: RepositoryMode;
  /** The repository's common git dir (`.git` of the main checkout, or the bare backing repo). */
  gitDir: string;
  defaultBranch: string;
  remoteUrl: string | null;
  createdBy: ActorId;
  createdAt: number;
}

export const WORKTREE_STATUSES = ["working", "idle", "merge_ready", "merged", "abandoned"] as const;
export type WorktreeStatus = (typeof WORKTREE_STATUSES)[number];

export interface Worktree {
  id: Id<"worktree">;
  projectId: Id<"project">;
  repositoryId: Id<"repository">;
  /** The integration target. Null only for the main worktree. */
  parentWorktreeId: Id<"worktree"> | null;
  isMain: boolean;
  name: string;
  branch: string;
  path: string;
  objective: string;
  status: WorktreeStatus;
  createdBy: ActorId;
  createdAt: number;
  updatedAt: number;
}

/** Actors: who. */

export interface Actor {
  id: ActorId;
  kind: ActorKind;
  name: string;
  createdAt: number;
}

export const AGENT_LIFECYCLES = ["online", "offline", "suspended", "archived"] as const;
export type AgentLifecycle = (typeof AGENT_LIFECYCLES)[number];

export interface Agent {
  id: Id<"agent">;
  projectId: Id<"project">;
  name: string;
  /** Which backend runs it: `claude-code`, `codex`, ... */
  provider: string;
  model: string | null;
  /** The backend's own id for the agent's session; opaque to the kernel. */
  sessionKey: string | null;
  lifecycle: AgentLifecycle;
  forkedFromId: Id<"agent"> | null;
  createdBy: ActorId;
  createdAt: number;
  updatedAt: number;
}

/** Items: what and why. */

interface ItemBase {
  projectId: Id<"project">;
  /** Owning scope; changes on escalation. */
  scopeId: ScopeId;
  /** Where it was created or discovered; never changes. */
  originScopeId: ScopeId;
  title: string;
  description: string;
  createdBy: ActorId;
  createdAt: number;
  updatedAt: number;
}

export const TASK_STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task extends ItemBase {
  id: Id<"task">;
  status: TaskStatus;
}

export const PROBLEM_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

export interface Problem extends ItemBase {
  id: Id<"problem">;
  status: ProblemStatus;
  resolution: string | null;
}

export const QUESTION_STATUSES = ["open", "answered"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export interface Question extends ItemBase {
  id: Id<"question">;
  status: QuestionStatus;
  answer: string | null;
}

export interface Decision extends Omit<ItemBase, "description"> {
  id: Id<"decision">;
  rationale: string;
  alternatives: string[];
}

export const ATTENTION_KINDS = [
  "decision",
  "approval",
  "review",
  "input",
  "manual_action",
  "unblock",
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];
export const ATTENTION_STATUSES = ["open", "resolved", "dismissed"] as const;
export type AttentionStatus = (typeof ATTENTION_STATUSES)[number];

export interface AttentionRequest extends ItemBase {
  id: Id<"attention">;
  kind: AttentionKind;
  blocking: boolean;
  status: AttentionStatus;
  resolution: string | null;
  resolvedAt: number | null;
}

/** Evidence: proof. */

export interface Commit {
  id: Id<"commit">;
  projectId: Id<"project">;
  repositoryId: Id<"repository">;
  sha: string;
  message: string;
  authorName: string;
  authoredAt: number;
  insertions: number;
  deletions: number;
  filesChanged: number;
  /** Derived by a model; labeled as such wherever shown. */
  explanation: string | null;
  recordedBy: ActorId;
  recordedAt: number;
}

export const CONVERSATION_KINDS = ["dm", "group", "ask"] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export interface Conversation {
  id: Id<"conversation">;
  projectId: Id<"project">;
  kind: ConversationKind;
  /** `dm:<sorted actor ids>`, `group:<scope id>`, `ask:<conversation id>`. Unique. */
  key: string;
  scopeId: ScopeId | null;
  title: string | null;
  createdBy: ActorId;
  createdAt: number;
}

export interface Participant {
  conversationId: Id<"conversation">;
  actorId: ActorId;
  joinedAt: number;
}

export interface Message {
  seq: number;
  id: Id<"message">;
  conversationId: Id<"conversation">;
  fromActorId: ActorId;
  body: string;
  createdAt: number;
}

export const DELIVERY_STATUSES = ["pending", "delivered", "read", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface Delivery {
  messageId: Id<"message">;
  toActorId: ActorId;
  status: DeliveryStatus;
  detail: string | null;
  updatedAt: number;
  readAt: number | null;
}

/** History. */

export interface Event {
  seq: number;
  id: Id<"event">;
  projectId: Id<"project"> | null;
  kind: string;
  actorId: ActorId;
  at: number;
  targetId: string | null;
  causeId: string | null;
  payload: Record<string, unknown>;
}

/** Any object a ref can point at. */
export type AnyObject =
  | Project
  | Repository
  | Worktree
  | Actor
  | Agent
  | Task
  | Problem
  | Question
  | Decision
  | AttentionRequest
  | Commit
  | Conversation
  | Message
  | Event;
