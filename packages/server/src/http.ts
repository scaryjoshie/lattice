import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type Id, KernelError, type ProvenanceNode } from "@pane/kernel";
import type {
  AgentPresence,
  DirectoryListing,
  OpName,
  OpResponse,
  Provenance,
  ProviderStatus,
  WorktreeGit,
} from "@pane/protocol";
import { titleOf } from "./ask.ts";
import type { Ops } from "./operations.ts";
import { OperationError, type Services } from "./services.ts";
import { type Client, Hub } from "./ws.ts";

/** The HTTP and WebSocket surface, as listed in `@pane/protocol`. */

const PROVIDER_LABEL: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };

export function createHttp(s: Services, ops: Ops, hub: Hub) {
  const { kernel, git, runtime, config } = s;
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const fail = (e: unknown): Response => {
    if (e instanceof OperationError)
      return json({ ok: false, error: { code: e.code, message: e.message } }, 422);
    if (e instanceof KernelError)
      return json({ ok: false, error: { code: e.code, message: e.message } }, 422);
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: { code: "internal", message } }, 500);
  };

  const presence = (): AgentPresence[] => runtime.allPresence();

  async function providers(): Promise<ProviderStatus[]> {
    return Promise.all(
      runtime.providers().map(async (p) => {
        const st = await p.status().catch(() => ({
          installed: false,
          version: null,
          loggedIn: null,
          account: null,
          loginCommand: "",
        }));
        return { name: p.name, label: PROVIDER_LABEL[p.name] ?? p.label, ...st };
      }),
    );
  }

  async function worktreeGit(worktreeId: Id<"worktree">): Promise<WorktreeGit> {
    const w = kernel.store.worktree(worktreeId);
    if (!w) throw new OperationError(`worktree ${worktreeId} not found`, "not_found");
    const parent = w.parentWorktreeId ? kernel.store.worktree(w.parentWorktreeId) : undefined;
    const [status, ab, last] = await Promise.all([
      git.status(w.path),
      parent
        ? git.aheadBehind(w.path, parent.branch, w.branch)
        : Promise.resolve({ ahead: 0, behind: 0 }),
      git.log(w.path, { limit: 1 }),
    ]);
    void ops.syncCommits(w).catch(() => undefined);
    const c = last[0];
    return {
      worktreeId: w.id,
      branch: status.branch,
      ahead: ab.ahead,
      behind: ab.behind,
      dirtyFiles: status.dirtyFiles,
      insertions: status.insertions,
      deletions: status.deletions,
      lastCommit: c
        ? { sha: c.sha, message: c.message.split("\n")[0] ?? "", authoredAt: c.authoredAt }
        : null,
    };
  }

  /** Directories one level down, hidden ones skipped; a `.git` marks a repository. */
  function listDirectory(raw: string | null): DirectoryListing {
    const path = resolve(raw || homedir());
    const isRepo = (p: string) => existsSync(join(p, ".git"));
    let names: string[] = [];
    try {
      names = readdirSync(path);
    } catch {
      throw new OperationError(`cannot read ${path}`, "not_found");
    }
    const entries = names
      .filter((n) => !n.startsWith("."))
      .map((n) => join(path, n))
      .filter((p) => {
        try {
          return statSync(p).isDirectory();
        } catch {
          return false;
        }
      })
      .map((p) => ({ name: p.slice(path.length + 1), path: p, isRepository: isRepo(p) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const parent = dirname(path);
    return { path, parent: parent === path ? null : parent, isRepository: isRepo(path), entries };
  }

  const toProvenance = (n: ProvenanceNode): Provenance => ({
    object: { id: n.object.id, kind: n.object.id.split("_")[0] ?? "", title: titleOf(n.object) },
    created: n.created,
    edges: n.edges.map((e) => ({ type: e.relation.type, node: toProvenance(e.node) })),
  });

  async function route(req: Request, url: URL): Promise<Response> {
    const path = url.pathname;
    const seg = path.split("/").filter(Boolean);
    if (req.method === "POST" && path === "/api/op") {
      const body = (await req.json()) as { name?: string; params?: unknown };
      if (typeof body.name !== "string")
        return json({ ok: false, error: { code: "invalid", message: "name required" } }, 400);
      const result = await ops.run(body.name as OpName, body.params ?? {});
      return json({ ok: true, result } satisfies OpResponse);
    }
    if (req.method !== "GET") return json({ error: "not found" }, 404);
    if (path === "/api/projects") return json(kernel.query.listProjects(kernel.store));
    if (seg[1] === "projects" && seg[3] === "snapshot" && seg[2]) {
      const snap = kernel.query.projectSnapshot(kernel.store, seg[2] as Id<"project">);
      return snap ? json(snap) : json({ error: "not found" }, 404);
    }
    if (seg[1] === "conversations" && seg[3] === "messages" && seg[2]) {
      const before = url.searchParams.get("before");
      const limit = url.searchParams.get("limit");
      return json(
        kernel.query.messages(kernel.store, seg[2] as Id<"conversation">, {
          beforeSeq: before ? Number(before) : undefined,
          limit: limit ? Number(limit) : undefined,
        }),
      );
    }
    if (path === "/api/needs-you") return json(kernel.query.needsYou(kernel.store));
    if (path === "/api/providers") return json(await providers());
    if (path === "/api/agents/presence") return json(presence());
    if (path === "/api/fs") return json(listDirectory(url.searchParams.get("path")));
    if (seg[1] === "why" && seg[2]) {
      const node = kernel.query.provenance(kernel.store, seg[2]);
      return node ? json(toProvenance(node)) : json({ error: "not found" }, 404);
    }
    if (seg[1] === "worktrees" && seg[3] === "git" && seg[2])
      return json(await worktreeGit(seg[2] as Id<"worktree">));
    if (seg[1] === "commits" && seg[3] === "diff" && seg[2]) {
      const c = kernel.store.commit(seg[2] as Id<"commit">);
      const main = c && kernel.store.worktreesOfRepository(c.repositoryId).find((w) => w.isMain);
      if (!c || !main) return json({ error: "not found" }, 404);
      return json({ diff: await git.diff(main.path, { sha: c.sha }) });
    }
    return json({ error: "not found" }, 404);
  }

  /** The built UI, when it exists; otherwise a one-line pointer to the dev server. */
  function staticFile(url: URL): Response {
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const candidate = join(config.uiDist, file);
    if (existsSync(candidate)) return new Response(Bun.file(candidate));
    const index = join(config.uiDist, "index.html");
    if (existsSync(index)) return new Response(Bun.file(index));
    return new Response("Pane daemon. Run the UI with `bun run ui`.\n", { status: 200 });
  }

  const server = Bun.serve<Client>({
    port: config.port,
    async fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        return server.upgrade(req, { data: Hub.data() })
          ? undefined
          : new Response("upgrade failed", { status: 400 });
      }
      if (url.pathname.startsWith("/api/")) {
        try {
          return await route(req, url);
        } catch (e) {
          return fail(e);
        }
      }
      return staticFile(url);
    },
    websocket: {
      open: (ws) => hub.open(ws),
      message: (ws, m) => hub.message(ws, m),
      close: (ws) => hub.close(ws),
    },
  });

  return { server, presence, providers };
}
