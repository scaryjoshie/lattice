import type {
  Actor,
  Agent,
  AttentionRequest,
  Commit,
  Conversation,
  Decision,
  Participant,
  Problem,
  Project,
  Question,
  Repository,
  Task,
  Worktree,
} from "./objects.ts";
import type { Relation } from "./relations.ts";

/** A conversation as the canvas needs it: who is in it and how alive it is. */
export interface ConversationSummary extends Conversation {
  participantIds: Participant["actorId"][];
  messageCount: number;
  lastMessageAt: number | null;
  /** Deliveries to the local human not yet read. */
  unreadForHuman: number;
}

/**
 * Everything in one project. Small enough to hold whole in a surface and refresh on
 * events. Messages are fetched per conversation.
 */
export interface ProjectSnapshot {
  project: Project;
  repositories: Repository[];
  worktrees: Worktree[];
  actors: Actor[];
  agents: Agent[];
  tasks: Task[];
  problems: Problem[];
  questions: Question[];
  decisions: Decision[];
  attention: AttentionRequest[];
  commits: Commit[];
  conversations: ConversationSummary[];
  relations: Relation[];
  /** The newest event seq covered by this snapshot. */
  eventSeq: number;
}
