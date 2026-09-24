import type { Id, Message, ProjectSnapshot } from "@pane/kernel/model";
import type {
  AgentPresence,
  AttentionRequest,
  ClientFrame,
  DirectoryListing,
  OpName,
  OpParams,
  OpResult,
  Project,
  Provenance,
  ProviderStatus,
  ServerFrame,
  WorktreeGit,
} from "@pane/protocol";

export interface Connection {
  send(frame: ClientFrame): void;
  close(): void;
}

/** What the UI can ask of the server. `http.ts` and `mock.ts` implement it. */
export interface Api {
  op<N extends OpName>(name: N, params: OpParams<N>): Promise<OpResult<N>>;
  projects(): Promise<Project[]>;
  snapshot(projectId: Id<"project">): Promise<ProjectSnapshot>;
  messages(
    conversationId: Id<"conversation">,
    opts?: { before?: number; limit?: number },
  ): Promise<Message[]>;
  needsYou(): Promise<AttentionRequest[]>;
  providers(): Promise<ProviderStatus[]>;
  presence(): Promise<AgentPresence[]>;
  why(id: string): Promise<Provenance>;
  worktreeGit(worktreeId: Id<"worktree">): Promise<WorktreeGit>;
  commitDiff(commitId: Id<"commit">): Promise<{ diff: string }>;
  /** Subdirectories of a path (home when omitted), marking git checkouts. */
  fs(path?: string): Promise<DirectoryListing>;
  connect(onFrame: (frame: ServerFrame) => void): Connection;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
