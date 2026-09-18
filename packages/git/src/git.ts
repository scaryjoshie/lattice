import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { git } from "./run.ts";
import {
  type CommitInfo,
  type Git,
  GitError,
  type MergeResult,
  type RepositoryInfo,
  type StatusInfo,
  type WorktreeInfo,
} from "./types.ts";

const LOG_LIMIT_MAX = 200;
/** Field separator for `git show --format`, chosen to never appear in text. */
const FIELD = "\x1f";

const trimmed = (o: { stdout: string }) => o.stdout.trim();

async function optional(args: string[], cwd: string): Promise<string | null> {
  const r = await git(args, cwd, { allowFail: true });
  return r.code === 0 ? trimmed(r) || null : null;
}

async function hasHead(cwd: string): Promise<boolean> {
  return (await git(["rev-parse", "--verify", "-q", "HEAD"], cwd, { allowFail: true })).code === 0;
}

/** `N files changed, I insertions(+), D deletions(-)` in any of its partial forms. */
function parseShortstat(text: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
} {
  const n = (re: RegExp) => Number(text.match(re)?.[1] ?? 0);
  return {
    filesChanged: n(/(\d+) files? changed/),
    insertions: n(/(\d+) insertions?\(\+\)/),
    deletions: n(/(\d+) deletions?\(-\)/),
  };
}

async function detect(path: string): Promise<RepositoryInfo | null> {
  const top = await git(["rev-parse", "--show-toplevel"], path, { allowFail: true });
  if (top.code !== 0) return null;
  const root = trimmed(top);
  const common = trimmed(await git(["rev-parse", "--git-common-dir"], root));
  const branch = trimmed(await git(["rev-parse", "--abbrev-ref", "HEAD"], root));
  const originHead = await optional(["symbolic-ref", "refs/remotes/origin/HEAD"], root);
  return {
    root,
    gitDir: resolve(root, common),
    branch,
    defaultBranch: originHead?.replace(/^refs\/remotes\/origin\//, "") ?? branch,
    remoteUrl: await optional(["remote", "get-url", "origin"], root),
  };
}

async function identityArgs(cwd: string): Promise<string[]> {
  const name = await optional(["config", "--get", "user.name"], cwd);
  const email = await optional(["config", "--get", "user.email"], cwd);
  return name && email ? [] : ["-c", "user.name=Pane", "-c", "user.email=pane@local"];
}

async function require(info: RepositoryInfo | null, path: string): Promise<RepositoryInfo> {
  if (!info) throw new GitError(`${path} is not a git repository`, ["rev-parse"], "");
  return info;
}

async function init(path: string, branch: string): Promise<RepositoryInfo> {
  mkdirSync(path, { recursive: true });
  await git(["init", "-q", "-b", branch, path], path);
  await git([...(await identityArgs(path)), "commit", "-q", "--allow-empty", "-m", "init"], path);
  return require(await detect(path), path);
}

async function clone(url: string, dest: string): Promise<RepositoryInfo> {
  mkdirSync(resolve(dest, ".."), { recursive: true });
  await git(["clone", "-q", url, dest], resolve(dest, ".."));
  return require(await detect(dest), dest);
}

function parseWorktrees(porcelain: string): WorktreeInfo[] {
  const out: WorktreeInfo[] = [];
  for (const block of porcelain.split("\n\n")) {
    const lines = block.split("\n").filter(Boolean);
    const path = lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length);
    if (!path) continue;
    const head = lines.find((l) => l.startsWith("HEAD "))?.slice("HEAD ".length) ?? "";
    const ref = lines.find((l) => l.startsWith("branch "))?.slice("branch ".length);
    out.push({
      path,
      head,
      branch: ref?.replace(/^refs\/heads\//, "") ?? null,
      isMain: out.length === 0,
    });
  }
  return out;
}

async function listWorktrees(root: string): Promise<WorktreeInfo[]> {
  return parseWorktrees((await git(["worktree", "list", "--porcelain"], root)).stdout);
}

async function addWorktree(
  root: string,
  opts: { path: string; branch: string; from: string },
): Promise<WorktreeInfo> {
  await git(["worktree", "add", "-q", "-b", opts.branch, opts.path, opts.from], root);
  const found = (await listWorktrees(root)).find((w) => w.path === resolve(opts.path));
  if (!found)
    throw new GitError(`worktree ${opts.path} not listed after add`, ["worktree", "add"], "");
  return found;
}

async function removeWorktree(
  root: string,
  path: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  await git(["worktree", "remove", ...(opts.force ? ["--force"] : []), path], root);
  await git(["worktree", "prune"], root);
}

async function status(worktreePath: string): Promise<StatusInfo> {
  const branch = trimmed(await git(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath));
  const porcelain = (await git(["status", "--porcelain"], worktreePath)).stdout;
  const dirtyFiles = porcelain.split("\n").filter(Boolean).length;
  const head = await optional(["rev-parse", "HEAD"], worktreePath);
  const stat = head
    ? parseShortstat((await git(["diff", "--shortstat", "HEAD"], worktreePath)).stdout)
    : null;
  return {
    branch,
    dirtyFiles,
    insertions: stat?.insertions ?? 0,
    deletions: stat?.deletions ?? 0,
    head,
  };
}

async function aheadBehind(
  worktreePath: string,
  base: string,
  branch: string,
): Promise<{ ahead: number; behind: number }> {
  const out = trimmed(
    await git(["rev-list", "--left-right", "--count", `${base}...${branch}`], worktreePath),
  );
  const [left, right] = out.split(/\s+/);
  return { behind: Number(left ?? 0), ahead: Number(right ?? 0) };
}

async function commitInfo(worktreePath: string, sha: string): Promise<CommitInfo> {
  const meta = (
    await git(["show", "-s", `--format=%H${FIELD}%an${FIELD}%at${FIELD}%B`, sha], worktreePath)
  ).stdout;
  const [fullSha = "", authorName = "", at = "0", message = ""] = meta.split(FIELD);
  const stat = parseShortstat(
    (await git(["show", "--shortstat", "--format=", sha], worktreePath)).stdout,
  );
  return {
    sha: fullSha.trim(),
    authorName,
    authoredAt: Number(at) * 1000,
    message: message.trimEnd(),
    ...stat,
  };
}

async function log(
  worktreePath: string,
  opts: { since?: string; limit?: number } = {},
): Promise<CommitInfo[]> {
  if (!(await hasHead(worktreePath))) return [];
  const limit = Math.min(opts.limit ?? LOG_LIMIT_MAX, LOG_LIMIT_MAX);
  const range = opts.since ? `${opts.since}..HEAD` : "HEAD";
  const out = (await git(["log", `--max-count=${limit}`, "--format=%H", range], worktreePath))
    .stdout;
  const shas = out.split("\n").filter(Boolean);
  const commits: CommitInfo[] = [];
  for (const sha of shas) commits.push(await commitInfo(worktreePath, sha));
  return commits;
}

async function diff(worktreePath: string, opts: { sha?: string } = {}): Promise<string> {
  if (opts.sha) return (await git(["show", "--format=", opts.sha], worktreePath)).stdout;
  const against = (await hasHead(worktreePath)) ? ["diff", "HEAD"] : ["diff"];
  return (await git(against, worktreePath)).stdout;
}

function withTrailers(message: string, trailers: Record<string, string> = {}): string {
  const lines = Object.entries(trailers).map(([k, v]) => `${k}: ${v}`);
  return lines.length ? `${message.trimEnd()}\n\n${lines.join("\n")}\n` : message;
}

async function commit(
  worktreePath: string,
  opts: { message: string; trailers?: Record<string, string> },
): Promise<CommitInfo> {
  await git(["add", "-A"], worktreePath);
  const staged = (await git(["status", "--porcelain"], worktreePath)).stdout.trim();
  if (!staged) throw new GitError("nothing to commit", ["commit"], "");
  const identity = await identityArgs(worktreePath);
  await git(
    [...identity, "commit", "-q", "-m", withTrailers(opts.message, opts.trailers)],
    worktreePath,
  );
  return commitInfo(worktreePath, "HEAD");
}

async function merge(
  worktreePath: string,
  branch: string,
  opts: { message?: string } = {},
): Promise<MergeResult> {
  const identity = await identityArgs(worktreePath);
  const msg = opts.message ? ["-m", opts.message] : [];
  const r = await git([...identity, "merge", "--no-ff", ...msg, branch], worktreePath, {
    allowFail: true,
  });
  if (r.code === 0)
    return {
      merged: true,
      conflicts: [],
      sha: await optional(["rev-parse", "HEAD"], worktreePath),
    };
  const conflicts = (await git(["diff", "--name-only", "--diff-filter=U"], worktreePath)).stdout
    .split("\n")
    .filter(Boolean);
  await git(["merge", "--abort"], worktreePath, { allowFail: true });
  if (!conflicts.length)
    throw new GitError(
      `merge failed: ${r.stderr.trim().split("\n")[0] ?? ""}`,
      ["merge"],
      r.stderr,
    );
  return { merged: false, conflicts, sha: null };
}

async function config(key: string, cwd = process.cwd()): Promise<string | null> {
  return optional(["config", "--get", key], cwd);
}

export function createGit(): Git {
  return {
    detect,
    init,
    clone,
    listWorktrees,
    addWorktree,
    removeWorktree,
    status,
    aheadBehind,
    log,
    diff,
    commit,
    merge,
    config,
  };
}
