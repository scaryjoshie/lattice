import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGit } from "@pane/git";
import type { Id, Project, Repository, Worktree } from "@pane/kernel";
import type {
  AskAnswer,
  OpName,
  OpParams,
  OpResponse,
  OpResult,
  ProjectSnapshot,
} from "@pane/protocol";
import { configFromEnv } from "./config.ts";
import { startDaemon } from "./main.ts";

/** The daemon over its own HTTP surface, in a temp home, against a real temp git repo. */

const scratch = process.env.SCRATCH ?? tmpdir();
const home = mkdtempSync(join(scratch, "pane-home-"));
const repoDir = mkdtempSync(join(scratch, "pane-repo-"));
const git = createGit();

let daemon: Awaited<ReturnType<typeof startDaemon>>;
let base: string;

async function op<N extends OpName>(name: N, params: OpParams<N>): Promise<OpResult<N>> {
  const res = await fetch(`${base}/api/op`, {
    method: "POST",
    body: JSON.stringify({ name, params }),
    headers: { "content-type": "application/json" },
  });
  const body = (await res.json()) as OpResponse<N>;
  if (!body.ok) throw new Error(`${name}: ${body.error.message}`);
  return body.result;
}

const get = async <T>(path: string): Promise<T> =>
  (await fetch(`${base}${path}`)).json() as Promise<T>;

beforeAll(async () => {
  await git.init(repoDir, "main");
  writeFileSync(join(repoDir, "README.md"), "# demo\n");
  await git.commit(repoDir, { message: "readme" });
  const config = configFromEnv({
    PANE_HOME: home,
    PANE_PROJECTS: join(home, "projects"),
    PANE_PORT: "0",
    PANE_SUMMARIES: "0",
  });
  daemon = await startDaemon(config);
  base = `http://localhost:${daemon.http.server.port}`;
});

afterAll(async () => {
  await daemon.stop();
});

describe("daemon", () => {
  let project: Project;
  let repository: Repository;
  let main: Worktree;
  let feature: Worktree;

  test("a project with an adopted repository", async () => {
    project = await op("createProject", { name: "Demo", goals: "Prove the loop" });
    const added = await op("addRepository", { projectId: project.id, path: repoDir });
    repository = added.repository;
    main = added.main;
    expect(repository.mode).toBe("adopted");
    expect(main.isMain).toBe(true);
    expect(main.path).toBe(repoDir);
    expect((await get<Project[]>("/api/projects")).map((p) => p.id)).toEqual([project.id]);
  });

  test("creating a worktree makes a real checkout on a new branch under the projects dir", async () => {
    feature = await op("createWorktree", {
      repositoryId: repository.id,
      name: "Auth Flow",
      objective: "Sessions",
    });
    expect(feature.name).toBe("auth-flow");
    expect(feature.branch).toBe("auth-flow");
    expect(feature.path).toBe(
      join(home, "projects", "demo", "pane-repo", "auth-flow").replace(
        "pane-repo",
        repository.name,
      ),
    );
    expect(feature.parentWorktreeId).toBe(main.id);
    const listed = await git.listWorktrees(repoDir);
    expect(listed.some((w) => w.path === feature.path && w.branch === "auth-flow")).toBe(true);
  });

  test("commits in the worktree are recorded and merge lands them in main", async () => {
    writeFileSync(join(feature.path, "auth.ts"), "export const auth = 1;\n");
    await git.commit(feature.path, {
      message: "Add auth",
      trailers: { "Pane-Agent": "agent_nobody" },
    });
    const gitView = await get<{ ahead: number; behind: number; branch: string }>(
      `/api/worktrees/${feature.id}/git`,
    );
    expect(gitView.branch).toBe("auth-flow");
    expect(gitView.ahead).toBe(1);
    expect((await op("syncCommits", { worktreeId: feature.id })).recorded).toBeLessThanOrEqual(1);
    const snap = await get<ProjectSnapshot>(`/api/projects/${project.id}/snapshot`);
    expect(snap.commits.some((c) => c.message.startsWith("Add auth"))).toBe(true);

    const merged = await op("mergeWorktree", { worktreeId: feature.id });
    expect(merged.merged).toBe(true);
    expect(merged.worktree.status).toBe("merged");
    expect((await git.log(repoDir, { limit: 1 }))[0]?.message.startsWith("Merge auth-flow")).toBe(
      true,
    );
  });

  test("the human can post into a worktree room and it shows in the snapshot", async () => {
    const snap = await get<ProjectSnapshot>(`/api/projects/${project.id}/snapshot`);
    const room = snap.conversations.find((c) => c.kind === "group" && c.scopeId === main.id);
    if (!room) throw new Error("no room");
    const m = await op("sendMessage", {
      conversationId: room.id,
      body: "Start with the protocol.",
    });
    expect(m.body).toBe("Start with the protocol.");
    const messages = await get<Array<{ id: string }>>(`/api/conversations/${room.id}/messages`);
    expect(messages.map((x) => x.id)).toEqual([m.id]);
  });

  test("ask answers 'why' from recorded provenance without a model", async () => {
    const problem = await op("raiseProblem", {
      scopeId: main.id,
      title: "Reconnect duplicates delivery",
    });
    const task = await op("createTask", {
      scopeId: main.id,
      title: "Fix queue epoch",
      derivedFrom: [problem.id],
    });
    const answer: AskAnswer = await op("ask", {
      projectId: project.id,
      refs: [task.id],
      text: "why does this exist?",
    });
    expect(answer.level).toBe("recorded");
    expect(answer.text).toContain("Reconnect duplicates delivery");
    expect(answer.sources.map((s) => s.id)).toContain(problem.id);
    const why = await get<{ edges: Array<{ type: string }> }>(`/api/why/${task.id}`);
    expect(why.edges[0]?.type).toBe("derived_from");
  });

  test("needs you lists blocking requests first and resolving records a decision", async () => {
    await op("requestAttention", { scopeId: main.id, kind: "input", title: "Name?" });
    const blocking = await op("requestAttention", {
      scopeId: main.id,
      kind: "decision",
      title: "Survive restart?",
      blocking: true,
    });
    const list = await get<Array<{ id: string }>>("/api/needs-you");
    expect(list[0]?.id).toBe(blocking.id);
    const r = await op("resolveAttention", {
      attentionId: blocking.id,
      resolution: "yes",
      decision: { title: "Sessions survive restarts", rationale: "tokens are durable" },
    });
    expect(r.decision?.title).toBe("Sessions survive restarts");
  });

  test("the agent socket rejects unknown identities and bad operations report cleanly", async () => {
    const res = await fetch("http://pane/rpc", {
      method: "POST",
      unix: daemon.rpc.path,
      body: JSON.stringify({
        method: "tool",
        params: { name: "context" },
        identity: { agentId: "agent_x", token: "nope" },
      }),
    });
    expect(res.status).toBe(422);
    const bad = await fetch(`${base}/api/op`, {
      method: "POST",
      body: JSON.stringify({ name: "createWorktree", params: {} }),
    });
    const body = (await bad.json()) as OpResponse;
    expect(bad.status).toBe(422);
    expect(body.ok).toBe(false);
    expect(await op("archiveProject", { projectId: project.id })).toMatchObject({ id: project.id });
    expect(await get<Project[]>("/api/projects")).toEqual([]);
  });

  test("ids are typed end to end", () => {
    const id: Id<"worktree"> = feature.id;
    expect(id.startsWith("wt_")).toBe(true);
  });
});
