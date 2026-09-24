import { Database, type SQLQueryBindings } from "bun:sqlite";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type ActorId,
  type AnyObject,
  type Id,
  kindOf,
  type ObjectKind,
  type RelationType,
  type ScopeId,
  SYSTEM_ACTOR_ID,
} from "../model/index.ts";
import {
  type ActorRow,
  type AgentRow,
  type AttentionRow,
  type CommitRow,
  type ConversationRow,
  type DecisionRow,
  type DeliveryRow,
  type EventRow,
  type MessageRow,
  type ParticipantRow,
  type ProblemRow,
  type ProjectRow,
  type QuestionRow,
  type RelationRow,
  type RepositoryRow,
  type TaskRow,
  toActor,
  toAgent,
  toAttention,
  toCommit,
  toConversation,
  toDecision,
  toDelivery,
  toEvent,
  toMessage,
  toParticipant,
  toProblem,
  toProject,
  toQuestion,
  toRelation,
  toRepository,
  toTask,
  toWorktree,
  type WorktreeRow,
} from "./rows.ts";

/**
 * The store: the only module that writes SQL. Reads are typed per table; writes go
 * through `insert` and `update` with explicit column names. Commands compose these
 * inside one transaction.
 */

const SCHEMA_VERSION = 1;
const SCHEMA_PATH = join(import.meta.dir, "schema.sql");

export type SqlValue = string | number | null;
type Row = Record<string, SqlValue>;

export class Store {
  readonly db: Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path, { create: true });
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
    this.applySchema();
  }

  private applySchema(): void {
    const version =
      this.db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;
    if (version >= SCHEMA_VERSION) return;
    this.db.transaction(() => {
      this.db.exec(readFileSync(SCHEMA_PATH, "utf8"));
      this.db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      this.db.run(
        "INSERT OR IGNORE INTO actors (id, kind, name, created_at) VALUES (?, 'system', 'Pane', ?)",
        [SYSTEM_ACTOR_ID, Date.now()],
      );
    })();
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ---- generic ---------------------------------------------------------------

  insert(table: string, row: Row): void {
    const cols = Object.keys(row);
    this.db.run(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      cols.map((c) => row[c] ?? null),
    );
  }

  update(table: string, where: Row, patch: Row): number {
    const set = Object.keys(patch);
    if (!set.length) return 0;
    const cond = Object.keys(where);
    const r = this.db.run(
      `UPDATE ${table} SET ${set.map((c) => `${c} = ?`).join(", ")} WHERE ${cond
        .map((c) => `${c} = ?`)
        .join(" AND ")}`,
      [...set.map((c) => patch[c] ?? null), ...cond.map((c) => where[c] ?? null)],
    );
    return r.changes;
  }

  delete(table: string, where: Row): number {
    const cond = Object.keys(where);
    return this.db.run(
      `DELETE FROM ${table} WHERE ${cond.map((c) => `${c} = ?`).join(" AND ")}`,
      cond.map((c) => where[c] ?? null),
    ).changes;
  }

  get<T>(sql: string, ...params: SQLQueryBindings[]): T | undefined {
    return this.db.query<T, SQLQueryBindings[]>(sql).get(...params) ?? undefined;
  }

  all<T>(sql: string, ...params: SQLQueryBindings[]): T[] {
    return this.db.query<T, SQLQueryBindings[]>(sql).all(...params);
  }

  // ---- scopes ----------------------------------------------------------------

  project(id: Id<"project">) {
    const r = this.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", id);
    return r && toProject(r);
  }
  projects() {
    return this.all<ProjectRow>("SELECT * FROM projects ORDER BY created_at").map(toProject);
  }
  repository(id: Id<"repository">) {
    const r = this.get<RepositoryRow>("SELECT * FROM repositories WHERE id = ?", id);
    return r && toRepository(r);
  }
  repositoriesOf(projectId: Id<"project">) {
    return this.all<RepositoryRow>(
      "SELECT * FROM repositories WHERE project_id = ? ORDER BY created_at",
      projectId,
    ).map(toRepository);
  }
  worktree(id: Id<"worktree">) {
    const r = this.get<WorktreeRow>("SELECT * FROM worktrees WHERE id = ?", id);
    return r && toWorktree(r);
  }
  worktreeByPath(path: string) {
    const r = this.get<WorktreeRow>("SELECT * FROM worktrees WHERE path = ?", path);
    return r && toWorktree(r);
  }
  worktreesOf(projectId: Id<"project">) {
    return this.all<WorktreeRow>(
      "SELECT * FROM worktrees WHERE project_id = ? ORDER BY is_main DESC, created_at",
      projectId,
    ).map(toWorktree);
  }
  worktreesOfRepository(repositoryId: Id<"repository">) {
    return this.all<WorktreeRow>(
      "SELECT * FROM worktrees WHERE repository_id = ? ORDER BY is_main DESC, created_at",
      repositoryId,
    ).map(toWorktree);
  }

  /** The project a scope belongs to, or undefined for an unknown scope. */
  projectOfScope(scopeId: ScopeId): Id<"project"> | undefined {
    switch (kindOf(scopeId)) {
      case "project":
        return this.project(scopeId as Id<"project">)?.id;
      case "repository":
        return this.repository(scopeId as Id<"repository">)?.projectId;
      case "worktree":
        return this.worktree(scopeId as Id<"worktree">)?.projectId;
      default:
        return undefined;
    }
  }

  // ---- actors ----------------------------------------------------------------

  actor(id: ActorId) {
    const r = this.get<ActorRow>("SELECT * FROM actors WHERE id = ?", id);
    return r && toActor(r);
  }
  actors() {
    return this.all<ActorRow>("SELECT * FROM actors ORDER BY created_at").map(toActor);
  }
  humans() {
    return this.all<ActorRow>("SELECT * FROM actors WHERE kind = 'human' ORDER BY created_at").map(
      toActor,
    );
  }
  private static readonly AGENT_SELECT =
    "SELECT g.*, a.name AS name FROM agents g JOIN actors a ON a.id = g.id";
  agent(id: Id<"agent">) {
    const r = this.get<AgentRow>(`${Store.AGENT_SELECT} WHERE g.id = ?`, id);
    return r && toAgent(r);
  }
  agentsOf(projectId: Id<"project">) {
    return this.all<AgentRow>(
      `${Store.AGENT_SELECT} WHERE g.project_id = ? ORDER BY g.created_at`,
      projectId,
    ).map(toAgent);
  }
  agents() {
    return this.all<AgentRow>(`${Store.AGENT_SELECT} ORDER BY g.created_at`).map(toAgent);
  }

  // ---- items -----------------------------------------------------------------

  task(id: Id<"task">) {
    const r = this.get<TaskRow>("SELECT * FROM tasks WHERE id = ?", id);
    return r && toTask(r);
  }
  tasksOf(projectId: Id<"project">) {
    return this.all<TaskRow>(
      "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at",
      projectId,
    ).map(toTask);
  }
  problem(id: Id<"problem">) {
    const r = this.get<ProblemRow>("SELECT * FROM problems WHERE id = ?", id);
    return r && toProblem(r);
  }
  problemsOf(projectId: Id<"project">) {
    return this.all<ProblemRow>(
      "SELECT * FROM problems WHERE project_id = ? ORDER BY created_at",
      projectId,
    ).map(toProblem);
  }
  question(id: Id<"question">) {
    const r = this.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", id);
    return r && toQuestion(r);
  }
  questionsOf(projectId: Id<"project">) {
    return this.all<QuestionRow>(
      "SELECT * FROM questions WHERE project_id = ? ORDER BY created_at",
      projectId,
    ).map(toQuestion);
  }
  decision(id: Id<"decision">) {
    const r = this.get<DecisionRow>("SELECT * FROM decisions WHERE id = ?", id);
    return r && toDecision(r);
  }
  decisionsOf(projectId: Id<"project">) {
    return this.all<DecisionRow>(
      "SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at",
      projectId,
    ).map(toDecision);
  }
  attention(id: Id<"attention">) {
    const r = this.get<AttentionRow>("SELECT * FROM attention_requests WHERE id = ?", id);
    return r && toAttention(r);
  }
  attentionOf(projectId: Id<"project">) {
    return this.all<AttentionRow>(
      "SELECT * FROM attention_requests WHERE project_id = ? ORDER BY created_at",
      projectId,
    ).map(toAttention);
  }

  // ---- evidence --------------------------------------------------------------

  commit(id: Id<"commit">) {
    const r = this.get<CommitRow>("SELECT * FROM commits WHERE id = ?", id);
    return r && toCommit(r);
  }
  commitBySha(repositoryId: Id<"repository">, sha: string) {
    const r = this.get<CommitRow>(
      "SELECT * FROM commits WHERE repository_id = ? AND sha = ?",
      repositoryId,
      sha,
    );
    return r && toCommit(r);
  }
  commitsOf(projectId: Id<"project">) {
    return this.all<CommitRow>(
      "SELECT * FROM commits WHERE project_id = ? ORDER BY authored_at DESC",
      projectId,
    ).map(toCommit);
  }
  conversation(id: Id<"conversation">) {
    const r = this.get<ConversationRow>("SELECT * FROM conversations WHERE id = ?", id);
    return r && toConversation(r);
  }
  conversationByKey(key: string) {
    const r = this.get<ConversationRow>("SELECT * FROM conversations WHERE key = ?", key);
    return r && toConversation(r);
  }
  conversationsOf(projectId: Id<"project">) {
    return this.all<ConversationRow>(
      "SELECT * FROM conversations WHERE project_id = ? ORDER BY created_at",
      projectId,
    ).map(toConversation);
  }
  participantsOf(conversationId: Id<"conversation">) {
    return this.all<ParticipantRow>(
      "SELECT * FROM participants WHERE conversation_id = ? ORDER BY joined_at",
      conversationId,
    ).map(toParticipant);
  }
  isParticipant(conversationId: Id<"conversation">, actorId: ActorId): boolean {
    return (
      (this.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM participants WHERE conversation_id = ? AND actor_id = ?",
        conversationId,
        actorId,
      )?.n ?? 0) > 0
    );
  }
  message(id: Id<"message">) {
    const r = this.get<MessageRow>("SELECT * FROM messages WHERE id = ?", id);
    return r && toMessage(r);
  }
  /** Newest-last page of one conversation, ending before `beforeSeq` when given. */
  messagesOf(conversationId: Id<"conversation">, opts: { beforeSeq?: number; limit: number }) {
    const rows =
      opts.beforeSeq === undefined
        ? this.all<MessageRow>(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?",
            conversationId,
            opts.limit,
          )
        : this.all<MessageRow>(
            "SELECT * FROM messages WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
            conversationId,
            opts.beforeSeq,
            opts.limit,
          );
    return rows.reverse().map(toMessage);
  }
  delivery(messageId: Id<"message">, toActorId: ActorId) {
    const r = this.get<DeliveryRow>(
      "SELECT * FROM deliveries WHERE message_id = ? AND to_actor_id = ?",
      messageId,
      toActorId,
    );
    return r && toDelivery(r);
  }
  deliveriesOf(messageId: Id<"message">) {
    return this.all<DeliveryRow>("SELECT * FROM deliveries WHERE message_id = ?", messageId).map(
      toDelivery,
    );
  }
  /** Messages waiting for an actor in the given states, oldest first. */
  pendingFor(actorId: ActorId, statuses: readonly string[]) {
    const marks = statuses.map(() => "?").join(", ");
    return this.all<MessageRow>(
      `SELECT m.* FROM deliveries d JOIN messages m ON m.id = d.message_id
       WHERE d.to_actor_id = ? AND d.status IN (${marks}) ORDER BY m.seq`,
      actorId,
      ...statuses,
    ).map(toMessage);
  }
  unreadCount(actorId: ActorId, conversationId?: Id<"conversation">): number {
    return conversationId
      ? (this.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM deliveries d JOIN messages m ON m.id = d.message_id
           WHERE d.to_actor_id = ? AND d.read_at IS NULL AND m.conversation_id = ?`,
          actorId,
          conversationId,
        )?.n ?? 0)
      : (this.get<{ n: number }>(
          "SELECT COUNT(*) AS n FROM deliveries WHERE to_actor_id = ? AND read_at IS NULL",
          actorId,
        )?.n ?? 0);
  }

  // ---- graph -----------------------------------------------------------------

  relation(sourceId: string, type: RelationType, targetId: string) {
    const r = this.get<RelationRow>(
      "SELECT * FROM relations WHERE source_id = ? AND type = ? AND target_id = ?",
      sourceId,
      type,
      targetId,
    );
    return r && toRelation(r);
  }
  relationsFrom(sourceId: string, type?: RelationType) {
    return (
      type
        ? this.all<RelationRow>(
            "SELECT * FROM relations WHERE source_id = ? AND type = ? ORDER BY created_at",
            sourceId,
            type,
          )
        : this.all<RelationRow>(
            "SELECT * FROM relations WHERE source_id = ? ORDER BY created_at",
            sourceId,
          )
    ).map(toRelation);
  }
  relationsTo(targetId: string, type?: RelationType) {
    return (
      type
        ? this.all<RelationRow>(
            "SELECT * FROM relations WHERE target_id = ? AND type = ? ORDER BY created_at",
            targetId,
            type,
          )
        : this.all<RelationRow>(
            "SELECT * FROM relations WHERE target_id = ? ORDER BY created_at",
            targetId,
          )
    ).map(toRelation);
  }
  /** Every edge whose source or target lives in the project. */
  relationsOf(projectId: Id<"project">) {
    return this.all<RelationRow>(
      `SELECT r.* FROM relations r WHERE r.source_id IN (${Store.PROJECT_IDS}) OR r.target_id IN (${Store.PROJECT_IDS})
       ORDER BY r.created_at`,
      projectId,
    ).map(toRelation);
  }
  private static readonly PROJECT_IDS = `
    SELECT id FROM worktrees WHERE project_id = ?1 UNION SELECT id FROM repositories WHERE project_id = ?1
    UNION SELECT ?1 UNION SELECT id FROM agents WHERE project_id = ?1
    UNION SELECT id FROM tasks WHERE project_id = ?1 UNION SELECT id FROM problems WHERE project_id = ?1
    UNION SELECT id FROM questions WHERE project_id = ?1 UNION SELECT id FROM decisions WHERE project_id = ?1
    UNION SELECT id FROM attention_requests WHERE project_id = ?1 UNION SELECT id FROM commits WHERE project_id = ?1
    UNION SELECT id FROM conversations WHERE project_id = ?1`;

  // ---- events ----------------------------------------------------------------

  eventsSince(seq: number, projectId?: Id<"project">, limit = 500) {
    return (
      projectId
        ? this.all<EventRow>(
            "SELECT * FROM events WHERE seq > ? AND (project_id = ? OR project_id IS NULL) ORDER BY seq LIMIT ?",
            seq,
            projectId,
            limit,
          )
        : this.all<EventRow>("SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?", seq, limit)
    ).map(toEvent);
  }
  eventsFor(targetId: string) {
    return this.all<EventRow>(
      "SELECT * FROM events WHERE target_id = ? ORDER BY seq",
      targetId,
    ).map(toEvent);
  }
  lastEventSeq(): number {
    return this.get<{ s: number | null }>("SELECT MAX(seq) AS s FROM events")?.s ?? 0;
  }

  // ---- any object ------------------------------------------------------------

  objectKind(id: string): ObjectKind | undefined {
    return kindOf(id);
  }

  object(id: string): AnyObject | undefined {
    switch (kindOf(id)) {
      case "project":
        return this.project(id as Id<"project">);
      case "repository":
        return this.repository(id as Id<"repository">);
      case "worktree":
        return this.worktree(id as Id<"worktree">);
      case "human":
      case "system":
        return this.actor(id as ActorId);
      case "agent":
        return this.agent(id as Id<"agent">);
      case "task":
        return this.task(id as Id<"task">);
      case "problem":
        return this.problem(id as Id<"problem">);
      case "question":
        return this.question(id as Id<"question">);
      case "decision":
        return this.decision(id as Id<"decision">);
      case "attention":
        return this.attention(id as Id<"attention">);
      case "commit":
        return this.commit(id as Id<"commit">);
      case "conversation":
        return this.conversation(id as Id<"conversation">);
      case "message":
        return this.message(id as Id<"message">);
      case "event": {
        const r = this.get<EventRow>("SELECT * FROM events WHERE id = ?", id);
        return r && toEvent(r);
      }
      default:
        return undefined;
    }
  }

  /** The project an object belongs to, when it belongs to one. */
  projectOf(id: string): Id<"project"> | undefined {
    const o = this.object(id);
    if (!o) return undefined;
    if ("projectId" in o && o.projectId) return o.projectId;
    if (kindOf(id) === "project") return id as Id<"project">;
    if (kindOf(id) === "message")
      return this.conversation((o as { conversationId: Id<"conversation"> }).conversationId)
        ?.projectId;
    return undefined;
  }
}
