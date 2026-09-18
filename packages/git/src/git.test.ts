import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGit } from "./git.ts";
import { git } from "./run.ts";
import { GitError } from "./types.ts";

const SCRATCH =
  "/private/tmp/claude-501/-Users-joshua-dev-pane/5a8ed4f2-afb6-4d17-8733-d169419b5bfa/scratchpad";

process.env.GIT_AUTHOR_NAME = "Tester";
process.env.GIT_AUTHOR_EMAIL = "tester@local";
process.env.GIT_COMMITTER_NAME = "Tester";
process.env.GIT_COMMITTER_EMAIL = "tester@local";

const g = createGit();

/** A fresh repository with one file committed on `main`, plus a sibling dir for worktrees. */
async function repo() {
  const dir = mkdtempSync(join(SCRATCH, "git-"));
  const root = join(dir, "main");
  await g.init(root, "main");
  writeFileSync(join(root, "a.txt"), "one\n");
  const first = await g.commit(root, { message: "add a" });
  return { dir, root, first };
}

describe("repositories", () => {
  test("init and detect", async () => {
    const { root } = await repo();
    const info = await g.detect(root);
    expect(info?.root).toBe(root);
    expect(info?.branch).toBe("main");
    expect(info?.defaultBranch).toBe("main");
    expect(info?.gitDir).toBe(join(root, ".git"));
    expect(info?.remoteUrl).toBeNull();
    expect(await g.detect(SCRATCH)).toBeNull();
  });

  test("config reads a key or null", async () => {
    const { root } = await repo();
    await git(["config", "pane.test", "yes"], root);
    expect(await g.config("pane.test", root)).toBe("yes");
    expect(await g.config("pane.missing", root)).toBeNull();
  });
});

describe("worktrees and commits", () => {
  let dir: string;
  let root: string;
  let firstSha: string;
  beforeEach(async () => {
    ({
      dir,
      root,
      first: { sha: firstSha },
    } = await repo());
  });

  test("add a worktree on a new branch and commit with a trailer", async () => {
    const path = join(dir, "auth");
    const wt = await g.addWorktree(root, { path, branch: "auth", from: "main" });
    expect(wt.branch).toBe("auth");
    expect(wt.isMain).toBe(false);
    expect((await g.listWorktrees(root)).map((w) => [w.path, w.isMain])).toEqual([
      [root, true],
      [path, false],
    ]);

    writeFileSync(join(path, "b.txt"), "two\n");
    const c = await g.commit(path, { message: "add b", trailers: { "Pane-Agent": "agent_x" } });
    const body = (await git(["log", "-1", "--format=%B"], path)).stdout;
    expect(body).toContain("Pane-Agent: agent_x");
    expect(c.message.startsWith("add b")).toBe(true);
    expect(c.filesChanged).toBe(1);
    expect(c.insertions).toBe(1);
    expect(c.authorName).toBe("Tester");

    expect(await g.aheadBehind(path, "main", "auth")).toEqual({ ahead: 1, behind: 0 });
    const log = await g.log(path, { since: "main" });
    expect(log.map((x) => x.sha)).toEqual([c.sha]);
    expect((await g.log(path)).length).toBe(3);
    expect(await g.diff(path, { sha: c.sha })).toContain("+two");

    await g.removeWorktree(root, path);
    expect((await g.listWorktrees(root)).length).toBe(1);
  });

  test("status counts dirty files and line changes", async () => {
    writeFileSync(join(root, "a.txt"), "one\nmore\n");
    writeFileSync(join(root, "new.txt"), "x\n");
    const s = await g.status(root);
    expect(s.branch).toBe("main");
    expect(s.dirtyFiles).toBe(2);
    expect(s.insertions).toBe(1);
    expect(s.deletions).toBe(0);
    expect(s.head).toBe(firstSha);
    expect(await g.diff(root)).toContain("+more");
  });

  test("nothing to commit is an error", async () => {
    await expect(g.commit(root, { message: "empty" })).rejects.toThrow(GitError);
  });

  test("merge succeeds", async () => {
    const path = join(dir, "feat");
    await g.addWorktree(root, { path, branch: "feat", from: "main" });
    writeFileSync(join(path, "c.txt"), "three\n");
    await g.commit(path, { message: "add c" });
    const r = await g.merge(root, "feat", { message: "merge feat" });
    expect(r.merged).toBe(true);
    expect(r.conflicts).toEqual([]);
    expect(r.sha).not.toBeNull();
    expect((await g.status(root)).dirtyFiles).toBe(0);
    expect(await g.aheadBehind(root, "main", "feat")).toEqual({ ahead: 0, behind: 1 });
  });

  test("merge conflict is reported and aborted", async () => {
    const path = join(dir, "feat");
    await g.addWorktree(root, { path, branch: "feat", from: "main" });
    writeFileSync(join(path, "a.txt"), "theirs\n");
    await g.commit(path, { message: "theirs" });
    writeFileSync(join(root, "a.txt"), "ours\n");
    await g.commit(root, { message: "ours" });
    const r = await g.merge(root, "feat");
    expect(r.merged).toBe(false);
    expect(r.conflicts).toEqual(["a.txt"]);
    expect(r.sha).toBeNull();
    expect((await g.status(root)).dirtyFiles).toBe(0);
  });
});
