import type {
  ActorId,
  Agent,
  AgentLifecycle,
  AttentionKind,
  AttentionRequest,
  Conversation,
  Decision,
  Event,
  Id,
  Message,
  Problem,
  Project,
  ProjectSnapshot,
  Question,
  Relation,
  RelationType,
  Repository,
  Task,
  TaskStatus,
  Worktree,
  WorktreeStatus,
} from "@pane/kernel/model";

/**
 * The wire between the server and its surfaces. Types only; the server validates.
 *
 *   POST /api/op                  { name, params }            -> OpResult
 *   GET  /api/projects                                        -> Project[]
 *   GET  /api/projects/:id/snapshot                           -> ProjectSnapshot
 *   GET  /api/conversations/:id/messages?before=&limit=       -> Message[]
 *   GET  /api/needs-you                                       -> AttentionRequest[]
 *   GET  /api/providers                                       -> ProviderStatus[]
 *   GET  /api/why/:id                                         -> Provenance
 *   GET  /api/worktrees/:id/git                               -> WorktreeGit
 *   GET  /api/commits/:id/diff                                -> { diff: string }
 *   GET  /api/agents/presence                                 -> AgentPresence[]
 *   WS   /ws                                                  <- ServerFrame, -> ClientFrame
 */

export type {
  ActorId,
  Agent,
  AttentionRequest,
  Conversation,
  Decision,
  Event,
  Id,
  Message,
  Problem,
  Project,
  ProjectSnapshot,
  Question,
  Relation,
  Repository,
  Task,
  Worktree,
};

// ---- operations ------------------------------------------------------------------

/** Everything a surface can do. Kernel commands pass through; the rest touch the world. */
export interface Operations {
  // projects
  createProject: { params: { name: string; goals?: string }; result: Project };
  updateProject: {
    params: { projectId: Id<"project">; name?: string; goals?: string };
    result: Project;
  };
  archiveProject: { params: { projectId: Id<"project"> }; result: Project };

  // repositories and worktrees (git + kernel)
  addRepository: {
    params: { projectId: Id<"project">; path: string; name?: string };
    result: { repository: Repository; main: Worktree };
  };
  cloneRepository: {
    params: { projectId: Id<"project">; url: string; name?: string };
    result: { repository: Repository; main: Worktree };
  };
  createWorktree: {
    params: {
      repositoryId: Id<"repository">;
      name: string;
      objective?: string;
      /** Defaults to the name. */
      branch?: string;
      parentWorktreeId?: Id<"worktree">;
    };
    result: Worktree;
  };
  updateWorktree: {
    params: { worktreeId: Id<"worktree">; objective?: string; name?: string };
    result: Worktree;
  };
  setWorktreeStatus: {
    params: { worktreeId: Id<"worktree">; status: WorktreeStatus };
    result: Worktree;
  };
  /** Removes the checkout and marks the worktree abandoned. Agents in it are stopped. */
  removeWorktree: { params: { worktreeId: Id<"worktree"> }; result: Worktree };
  /** Merges the worktree's branch into its parent's checkout. */
  mergeWorktree: {
    params: { worktreeId: Id<"worktree">; message?: string };
    result: { worktree: Worktree; merged: boolean; conflicts: string[] };
  };
  /** Records commits git knows about that the kernel does not yet. */
  syncCommits: { params: { worktreeId: Id<"worktree"> }; result: { recorded: number } };

  // agents (kernel + runtime)
  spawnAgent: {
    params: { worktreeId: Id<"worktree">; provider: string; name?: string; model?: string | null };
    result: Agent;
  };
  startAgent: { params: { agentId: Id<"agent"> }; result: Agent };
  stopAgent: { params: { agentId: Id<"agent"> }; result: Agent };
  interruptAgent: { params: { agentId: Id<"agent"> }; result: Agent };
  forkAgent: { params: { agentId: Id<"agent">; name?: string }; result: Agent };
  archiveAgent: { params: { agentId: Id<"agent"> }; result: Agent };
  assignAgent: { params: { agentId: Id<"agent">; worktreeId: Id<"worktree"> }; result: Agent };
  updateAgent: {
    params: { agentId: Id<"agent">; name?: string; model?: string | null };
    result: Agent;
  };

  // items
  createTask: {
    params: {
      scopeId: Id<"project" | "repository" | "worktree">;
      title: string;
      description?: string;
      status?: TaskStatus;
      dependsOn?: Id<"task">[];
      addresses?: string[];
      derivedFrom?: string[];
    };
    result: Task;
  };
  updateTask: {
    params: { taskId: Id<"task">; title?: string; description?: string };
    result: Task;
  };
  setTaskStatus: { params: { taskId: Id<"task">; status: TaskStatus }; result: Task };
  raiseProblem: {
    params: {
      scopeId: Id<"project" | "repository" | "worktree">;
      title: string;
      description?: string;
      discoveredDuring?: string;
      causedBy?: string[];
      derivedFrom?: string[];
      blocks?: string[];
    };
    result: Problem;
  };
  updateProblem: {
    params: { problemId: Id<"problem">; title?: string; description?: string };
    result: Problem;
  };
  resolveProblem: {
    params: { problemId: Id<"problem">; resolution: string; resolvedBy?: string };
    result: Problem;
  };
  dismissProblem: { params: { problemId: Id<"problem">; reason: string }; result: Problem };
  raiseQuestion: {
    params: {
      scopeId: Id<"project" | "repository" | "worktree">;
      title: string;
      description?: string;
      derivedFrom?: string[];
    };
    result: Question;
  };
  answerQuestion: { params: { questionId: Id<"question">; answer: string }; result: Question };
  recordDecision: {
    params: {
      scopeId: Id<"project" | "repository" | "worktree">;
      title: string;
      rationale?: string;
      alternatives?: string[];
      derivedFrom?: string[];
      resolves?: string[];
    };
    result: Decision;
  };
  requestAttention: {
    params: {
      scopeId: Id<"project" | "repository" | "worktree">;
      kind: AttentionKind;
      title: string;
      description?: string;
      blocking?: boolean;
      refs?: string[];
    };
    result: AttentionRequest;
  };
  resolveAttention: {
    params: {
      attentionId: Id<"attention">;
      resolution: string;
      decision?: { title: string; rationale?: string; alternatives?: string[] };
    };
    result: { attention: AttentionRequest; decision: Decision | null };
  };
  dismissAttention: { params: { attentionId: Id<"attention"> }; result: AttentionRequest };
  escalateItem: {
    params: { itemId: string; scopeId: Id<"project" | "repository" | "worktree"> };
    result: Task | Problem | Question | Decision | AttentionRequest;
  };
  assignOwner: {
    params: { itemId: string; actorId: ActorId };
    result: Task | Problem | Question | Decision | AttentionRequest;
  };
  link: { params: { sourceId: string; type: RelationType; targetId: string }; result: Relation };
  unlink: { params: { sourceId: string; type: RelationType; targetId: string }; result: boolean };

  // conversations
  openDm: { params: { projectId: Id<"project">; a: ActorId; b: ActorId }; result: Conversation };
  /** The human posts. Joins the conversation first if not yet in it. */
  sendMessage: { params: { conversationId: Id<"conversation">; body: string }; result: Message };
  markRead: { params: { conversationId: Id<"conversation"> }; result: number };

  // ask mode
  ask: { params: AskRequest; result: AskAnswer };
  /** Run the ops an answer proposed. */
  applyProposal: { params: { ops: ProposedOp[] }; result: unknown[] };
}

export type OpName = keyof Operations;
export type OpParams<N extends OpName> = Operations[N]["params"];
export type OpResult<N extends OpName> = Operations[N]["result"];

export type OpResponse<N extends OpName = OpName> =
  | { ok: true; result: OpResult<N> }
  | { ok: false; error: { code: string; message: string } };

// ---- ask -----------------------------------------------------------------------

export interface AskRequest {
  projectId: Id<"project">;
  /** Selected objects; the subject of the question. */
  refs: string[];
  text: string;
  /** Continue an earlier ask thread. */
  conversationId?: Id<"conversation">;
}

export type AnswerLevel = "recorded" | "actor" | "reconstructed" | "none";

export interface ProposedOp {
  name: OpName;
  params: Record<string, unknown>;
  summary: string;
}

export interface AskAnswer {
  conversationId: Id<"conversation">;
  level: AnswerLevel;
  text: string;
  /** Objects the answer rests on. */
  sources: Array<{ id: string; kind: string; title: string }>;
  /** Each respondent's own words, when actors were asked. */
  respondents: Array<{ actorId: ActorId; name: string; text: string }>;
  /** Imperative asks come back as a proposal to confirm. */
  proposal: ProposedOp[] | null;
}

// ---- reads ----------------------------------------------------------------------

export interface ProviderStatus {
  name: string;
  label: string;
  installed: boolean;
  version: string | null;
  /** Null when the provider cannot say. */
  loggedIn: boolean | null;
  account: string | null;
  /** How to log in, when not logged in. */
  loginCommand: string;
}

export interface AgentPresence {
  agentId: Id<"agent">;
  lifecycle: AgentLifecycle;
  /** A process is attached right now. */
  running: boolean;
  pid: number | null;
  /** The host's own word for what it is doing: `busy`, `idle`, ... */
  status: string | null;
  cwd: string | null;
  activeAt: number | null;
}

export interface WorktreeGit {
  worktreeId: Id<"worktree">;
  branch: string;
  /** Against the parent worktree's branch; both 0 for the main worktree. */
  ahead: number;
  behind: number;
  dirtyFiles: number;
  insertions: number;
  deletions: number;
  lastCommit: { sha: string; message: string; authoredAt: number } | null;
}

export interface Provenance {
  object: { id: string; kind: string; title: string };
  created: Event | null;
  edges: Array<{ type: RelationType; node: Provenance }>;
}

// ---- websocket ------------------------------------------------------------------

export type ServerFrame =
  | { type: "event"; event: Event }
  | { type: "presence"; agents: AgentPresence[] }
  | { type: "terminal"; agentId: Id<"agent">; data: string }
  | { type: "terminal.exit"; agentId: Id<"agent">; code: number | null };

export type ClientFrame =
  | { type: "terminal.open"; agentId: Id<"agent">; cols: number; rows: number }
  | { type: "terminal.input"; agentId: Id<"agent">; data: string }
  | { type: "terminal.resize"; agentId: Id<"agent">; cols: number; rows: number }
  | { type: "terminal.close"; agentId: Id<"agent"> };
