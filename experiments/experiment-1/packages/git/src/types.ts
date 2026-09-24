/**
 * The git adapter: what Pane needs from git, nothing more. Every function runs the
 * `git` CLI and returns typed facts. Paths are absolute. Nothing here knows about
 * the kernel beyond its model types.
 */

export interface RepositoryInfo {
  /** Top-level directory of the checkout that was given. */
  root: string;
  /** The common git dir shared by all worktrees of this repository. */
  gitDir: string;
  /** Branch checked out at `root`. */
  branch: string;
  /** `origin/HEAD`'s branch when known, else the current branch. */
  defaultBranch: string;
  remoteUrl: string | null;
}

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
}

export interface CommitInfo {
  sha: string;
  message: string;
  authorName: string;
  authoredAt: number;
  insertions: number;
  deletions: number;
  filesChanged: number;
}

export interface StatusInfo {
  branch: string;
  dirtyFiles: number;
  insertions: number;
  deletions: number;
  head: string | null;
}

export interface MergeResult {
  merged: boolean;
  /** Paths left in conflict; empty when merged. The merge is aborted on conflict. */
  conflicts: string[];
  sha: string | null;
}

export class GitError extends Error {
  constructor(
    message: string,
    readonly command: string[],
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

export interface Git {
  /** Facts about the repository containing `path`, or null when it is not in one. */
  detect(path: string): Promise<RepositoryInfo | null>;
  /** `git init` a fresh repository with one empty commit on `branch`. */
  init(path: string, branch: string): Promise<RepositoryInfo>;
  clone(url: string, dest: string): Promise<RepositoryInfo>;
  listWorktrees(root: string): Promise<WorktreeInfo[]>;
  /** New worktree at `path` on a new branch `branch` starting from `from`. */
  addWorktree(
    root: string,
    opts: { path: string; branch: string; from: string },
  ): Promise<WorktreeInfo>;
  removeWorktree(root: string, path: string, opts?: { force?: boolean }): Promise<void>;
  status(worktreePath: string): Promise<StatusInfo>;
  /** How far `branch` is ahead of and behind `base`, as seen from `worktreePath`. */
  aheadBehind(
    worktreePath: string,
    base: string,
    branch: string,
  ): Promise<{ ahead: number; behind: number }>;
  /** Commits reachable from HEAD but not from `since` (a ref), newest first; all of HEAD's when omitted. */
  log(worktreePath: string, opts?: { since?: string; limit?: number }): Promise<CommitInfo[]>;
  /** Unified diff: of one commit when `sha` is given, else the working tree against HEAD. */
  diff(worktreePath: string, opts?: { sha?: string }): Promise<string>;
  /** Stage everything and commit. Trailers become `Key: value` lines at the end. */
  commit(
    worktreePath: string,
    opts: { message: string; trailers?: Record<string, string> },
  ): Promise<CommitInfo>;
  /** Merge `branch` into the branch checked out at `worktreePath`. Aborts and reports on conflict. */
  merge(worktreePath: string, branch: string, opts?: { message?: string }): Promise<MergeResult>;
  /** `git config --get`, or null. */
  config(key: string, cwd?: string): Promise<string | null>;
}
