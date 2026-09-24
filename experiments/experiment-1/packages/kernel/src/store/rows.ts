import type {
  Actor,
  ActorId,
  ActorKind,
  Agent,
  AgentLifecycle,
  AttentionKind,
  AttentionRequest,
  AttentionStatus,
  Commit,
  Conversation,
  ConversationKind,
  Decision,
  Delivery,
  DeliveryStatus,
  Event,
  Id,
  Message,
  Participant,
  Problem,
  ProblemStatus,
  Project,
  Question,
  QuestionStatus,
  Relation,
  RelationType,
  Repository,
  RepositoryMode,
  ScopeId,
  Task,
  TaskStatus,
  Worktree,
  WorktreeStatus,
} from "../model/index.ts";

/** Rows as SQLite returns them (snake_case, 0/1 booleans, JSON text), and their mappers. */

export interface ActorRow {
  id: ActorId;
  kind: ActorKind;
  name: string;
  created_at: number;
}
export const toActor = (r: ActorRow): Actor => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  createdAt: r.created_at,
});

export interface ProjectRow {
  id: Id<"project">;
  name: string;
  goals: string;
  created_by: ActorId;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
}
export const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  goals: r.goals,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  archivedAt: r.archived_at,
});

export interface RepositoryRow {
  id: Id<"repository">;
  project_id: Id<"project">;
  name: string;
  mode: RepositoryMode;
  git_dir: string;
  default_branch: string;
  remote_url: string | null;
  created_by: ActorId;
  created_at: number;
}
export const toRepository = (r: RepositoryRow): Repository => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  mode: r.mode,
  gitDir: r.git_dir,
  defaultBranch: r.default_branch,
  remoteUrl: r.remote_url,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export interface WorktreeRow {
  id: Id<"worktree">;
  project_id: Id<"project">;
  repository_id: Id<"repository">;
  parent_worktree_id: Id<"worktree"> | null;
  is_main: number;
  name: string;
  branch: string;
  path: string;
  objective: string;
  status: WorktreeStatus;
  created_by: ActorId;
  created_at: number;
  updated_at: number;
}
export const toWorktree = (r: WorktreeRow): Worktree => ({
  id: r.id,
  projectId: r.project_id,
  repositoryId: r.repository_id,
  parentWorktreeId: r.parent_worktree_id,
  isMain: r.is_main === 1,
  name: r.name,
  branch: r.branch,
  path: r.path,
  objective: r.objective,
  status: r.status,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** `agents` joined with `actors` for the name. */
export interface AgentRow {
  id: Id<"agent">;
  project_id: Id<"project">;
  name: string;
  provider: string;
  model: string | null;
  session_key: string | null;
  lifecycle: AgentLifecycle;
  forked_from_id: Id<"agent"> | null;
  created_by: ActorId;
  created_at: number;
  updated_at: number;
}
export const toAgent = (r: AgentRow): Agent => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  provider: r.provider,
  model: r.model,
  sessionKey: r.session_key,
  lifecycle: r.lifecycle,
  forkedFromId: r.forked_from_id,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

interface ItemRow {
  project_id: Id<"project">;
  scope_id: ScopeId;
  origin_scope_id: ScopeId;
  title: string;
  created_by: ActorId;
  created_at: number;
  updated_at: number;
}
const itemBase = (r: ItemRow) => ({
  projectId: r.project_id,
  scopeId: r.scope_id,
  originScopeId: r.origin_scope_id,
  title: r.title,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface TaskRow extends ItemRow {
  id: Id<"task">;
  description: string;
  status: TaskStatus;
}
export const toTask = (r: TaskRow): Task => ({
  id: r.id,
  ...itemBase(r),
  description: r.description,
  status: r.status,
});

export interface ProblemRow extends ItemRow {
  id: Id<"problem">;
  description: string;
  status: ProblemStatus;
  resolution: string | null;
}
export const toProblem = (r: ProblemRow): Problem => ({
  id: r.id,
  ...itemBase(r),
  description: r.description,
  status: r.status,
  resolution: r.resolution,
});

export interface QuestionRow extends ItemRow {
  id: Id<"question">;
  description: string;
  status: QuestionStatus;
  answer: string | null;
}
export const toQuestion = (r: QuestionRow): Question => ({
  id: r.id,
  ...itemBase(r),
  description: r.description,
  status: r.status,
  answer: r.answer,
});

export interface DecisionRow extends ItemRow {
  id: Id<"decision">;
  rationale: string;
  alternatives: string;
}
export const toDecision = (r: DecisionRow): Decision => ({
  id: r.id,
  ...itemBase(r),
  rationale: r.rationale,
  alternatives: JSON.parse(r.alternatives) as string[],
});

export interface AttentionRow extends ItemRow {
  id: Id<"attention">;
  kind: AttentionKind;
  description: string;
  blocking: number;
  status: AttentionStatus;
  resolution: string | null;
  resolved_at: number | null;
}
export const toAttention = (r: AttentionRow): AttentionRequest => ({
  id: r.id,
  ...itemBase(r),
  kind: r.kind,
  description: r.description,
  blocking: r.blocking === 1,
  status: r.status,
  resolution: r.resolution,
  resolvedAt: r.resolved_at,
});

export interface CommitRow {
  id: Id<"commit">;
  project_id: Id<"project">;
  repository_id: Id<"repository">;
  sha: string;
  message: string;
  author_name: string;
  authored_at: number;
  insertions: number;
  deletions: number;
  files_changed: number;
  explanation: string | null;
  recorded_by: ActorId;
  recorded_at: number;
}
export const toCommit = (r: CommitRow): Commit => ({
  id: r.id,
  projectId: r.project_id,
  repositoryId: r.repository_id,
  sha: r.sha,
  message: r.message,
  authorName: r.author_name,
  authoredAt: r.authored_at,
  insertions: r.insertions,
  deletions: r.deletions,
  filesChanged: r.files_changed,
  explanation: r.explanation,
  recordedBy: r.recorded_by,
  recordedAt: r.recorded_at,
});

export interface ConversationRow {
  id: Id<"conversation">;
  project_id: Id<"project">;
  kind: ConversationKind;
  key: string;
  scope_id: ScopeId | null;
  title: string | null;
  created_by: ActorId;
  created_at: number;
}
export const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  projectId: r.project_id,
  kind: r.kind,
  key: r.key,
  scopeId: r.scope_id,
  title: r.title,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export interface ParticipantRow {
  conversation_id: Id<"conversation">;
  actor_id: ActorId;
  joined_at: number;
}
export const toParticipant = (r: ParticipantRow): Participant => ({
  conversationId: r.conversation_id,
  actorId: r.actor_id,
  joinedAt: r.joined_at,
});

export interface MessageRow {
  seq: number;
  id: Id<"message">;
  conversation_id: Id<"conversation">;
  from_actor_id: ActorId;
  body: string;
  created_at: number;
}
export const toMessage = (r: MessageRow): Message => ({
  seq: r.seq,
  id: r.id,
  conversationId: r.conversation_id,
  fromActorId: r.from_actor_id,
  body: r.body,
  createdAt: r.created_at,
});

export interface DeliveryRow {
  message_id: Id<"message">;
  to_actor_id: ActorId;
  status: DeliveryStatus;
  detail: string | null;
  updated_at: number;
  read_at: number | null;
}
export const toDelivery = (r: DeliveryRow): Delivery => ({
  messageId: r.message_id,
  toActorId: r.to_actor_id,
  status: r.status,
  detail: r.detail,
  updatedAt: r.updated_at,
  readAt: r.read_at,
});

export interface RelationRow {
  source_id: string;
  type: RelationType;
  target_id: string;
  created_by: ActorId;
  created_at: number;
}
export const toRelation = (r: RelationRow): Relation => ({
  sourceId: r.source_id,
  type: r.type,
  targetId: r.target_id,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export interface EventRow {
  seq: number;
  id: Id<"event">;
  project_id: Id<"project"> | null;
  kind: string;
  actor_id: ActorId;
  at: number;
  target_id: string | null;
  cause_id: string | null;
  payload: string;
}
export const toEvent = (r: EventRow): Event => ({
  seq: r.seq,
  id: r.id,
  projectId: r.project_id,
  kind: r.kind,
  actorId: r.actor_id,
  at: r.at,
  targetId: r.target_id,
  causeId: r.cause_id,
  payload: JSON.parse(r.payload) as Record<string, unknown>,
});
