import { basename, join } from "node:path";
import { GitError } from "@pane/git";
import { type Agent, commands, type Id, idOf, SYSTEM_ACTOR_ID, type Worktree } from "@pane/kernel";
import type { Operations, OpName, OpParams, OpResult } from "@pane/protocol";
import { z } from "zod";
import type { Ask } from "./ask.ts";
import { OperationError, type Services, slug } from "./services.ts";

/**
 * Operations: what surfaces call. Kernel commands pass straight through as the
 * local human. Operations that touch git or processes do the outside work first and
 * record the kernel fact after, so the kernel never describes something that failed.
 */

type Handler<N extends OpName> = {
  params: z.ZodType;
  run(params: OpParams<N>): Promise<OpResult<N>>;
};

type Handlers = { [N in OpName]: Handler<N> };

const PROVIDER_LABEL: Record<string, string> = { "claude-code": "Claude", codex: "Codex" };

export function createOperations(s: Services, ask: Ask) {
  const { kernel, git, runtime, config } = s;
  const asHuman = <K extends keyof typeof commands>(name: K) => ({
    params: commands[name].params,
    run: async (p: unknown) => kernel.run(name, s.human, p as never) as never,
  });

  const mainOf = (repositoryId: Id<"repository">): Worktree => {
    const main = kernel.store.worktreesOfRepository(repositoryId).find((w) => w.isMain);
    if (!main) throw new OperationError("repository has no main worktree", "conflict");
    return main;
  };
  const worktree = (id: Id<"worktree">): Worktree => {
    const w = kernel.store.worktree(id);
    if (!w) throw new OperationError(`worktree ${id} not found`, "not_found");
    return w;
  };
  const agent = (id: Id<"agent">): Agent => {
    const a = kernel.store.agent(id);
    if (!a) throw new OperationError(`agent ${id} not found`, "not_found");
    return a;
  };
  const projectDir = (projectId: Id<"project">) => {
    const p = kernel.store.project(projectId);
    if (!p) throw new OperationError(`project ${projectId} not found`, "not_found");
    return join(config.projectsDir, slug(p.name));
  };

  /** Record the commits of a worktree that the kernel does not know yet. */
  async function syncCommits(w: Worktree): Promise<number> {
    const parent = w.parentWorktreeId ? kernel.store.worktree(w.parentWorktreeId) : undefined;
    const log = await git.log(
      w.path,
      parent ? { since: parent.branch, limit: 200 } : { limit: 50 },
    );
    let recorded = 0;
    for (const c of log.reverse()) {
      if (kernel.store.commitBySha(w.repositoryId, c.sha)) continue;
      const agentId = c.message.match(/^Pane-Agent: (agent_[a-z0-9]+)$/m)?.[1] as
        | Id<"agent">
        | undefined;
      const actor = agentId && kernel.store.agent(agentId) ? agentId : SYSTEM_ACTOR_ID;
      kernel.commands.recordCommit(actor, {
        repositoryId: w.repositoryId,
        sha: c.sha,
        message: c.message,
        authorName: c.authorName,
        authoredAt: c.authoredAt,
        insertions: c.insertions,
        deletions: c.deletions,
        filesChanged: c.filesChanged,
        worktreeId: w.id,
      });
      recorded++;
    }
    return recorded;
  }

  const handlers: Handlers = {
    createProject: asHuman("createProject"),
    updateProject: asHuman("updateProject"),
    archiveProject: asHuman("archiveProject"),

    addRepository: {
      params: z.object({
        projectId: idOf("project"),
        path: z.string().min(1),
        name: z.string().optional(),
      }),
      async run(p) {
        const info = await git.detect(p.path);
        if (!info) throw new OperationError(`${p.path} is not a git repository`);
        return kernel.commands.addRepository(s.human, {
          projectId: p.projectId,
          name: p.name ?? basename(info.root),
          mode: "adopted",
          gitDir: info.gitDir,
          defaultBranch: info.branch,
          remoteUrl: info.remoteUrl,
          mainPath: info.root,
        });
      },
    },
    cloneRepository: {
      params: z.object({
        projectId: idOf("project"),
        url: z.string().min(1),
        name: z.string().optional(),
      }),
      async run(p) {
        const name = p.name ?? (basename(p.url).replace(/\.git$/, "") || "repo");
        const dest = join(projectDir(p.projectId), name, "main");
        const info = await git.clone(p.url, dest);
        return kernel.commands.addRepository(s.human, {
          projectId: p.projectId,
          name,
          mode: "managed",
          gitDir: info.gitDir,
          defaultBranch: info.defaultBranch,
          remoteUrl: info.remoteUrl,
          mainPath: info.root,
        });
      },
    },
    createWorktree: {
      params: z.object({
        repositoryId: idOf("repository"),
        name: z.string().trim().min(1),
        objective: z.string().default(""),
        branch: z.string().optional(),
        parentWorktreeId: idOf("worktree").optional(),
      }),
      async run(p) {
        const repo = kernel.store.repository(p.repositoryId);
        if (!repo) throw new OperationError(`repository ${p.repositoryId} not found`, "not_found");
        const main = mainOf(repo.id);
        const parent = p.parentWorktreeId ? worktree(p.parentWorktreeId) : main;
        const name = slug(p.name);
        const branch = p.branch ?? name;
        const path = join(projectDir(repo.projectId), repo.name, name);
        if (kernel.store.worktreeByPath(path))
          throw new OperationError(`${path} is already a worktree`, "conflict");
        await git.addWorktree(main.path, { path, branch, from: parent.branch });
        return kernel.commands.createWorktree(s.human, {
          repositoryId: repo.id,
          name,
          branch,
          path,
          objective: p.objective,
          parentWorktreeId: parent.id,
        });
      },
    },
    updateWorktree: asHuman("updateWorktree"),
    setWorktreeStatus: asHuman("setWorktreeStatus"),
    removeWorktree: {
      params: z.object({ worktreeId: idOf("worktree") }),
      async run(p) {
        const w = worktree(p.worktreeId);
        if (w.isMain) throw new OperationError("the main worktree cannot be removed", "forbidden");
        for (const a of kernel.query.agentsIn(kernel.store, w.id)) await runtime.stop(a.id);
        await git.removeWorktree(mainOf(w.repositoryId).path, w.path, { force: true });
        return kernel.commands.setWorktreeStatus(s.human, {
          worktreeId: w.id,
          status: "abandoned",
        });
      },
    },
    mergeWorktree: {
      params: z.object({ worktreeId: idOf("worktree"), message: z.string().optional() }),
      async run(p) {
        const w = worktree(p.worktreeId);
        if (!w.parentWorktreeId)
          throw new OperationError("the main worktree has nothing to merge into", "forbidden");
        const parent = worktree(w.parentWorktreeId);
        await syncCommits(w);
        const r = await git.merge(parent.path, w.branch, {
          message: p.message ?? `Merge ${w.name}: ${w.objective || w.branch}`,
        });
        if (!r.merged) return { worktree: w, merged: false, conflicts: r.conflicts };
        await syncCommits(parent);
        const merged = kernel.commands.setWorktreeStatus(s.human, {
          worktreeId: w.id,
          status: "merged",
        });
        return { worktree: merged, merged: true, conflicts: [] };
      },
    },
    syncCommits: {
      params: z.object({ worktreeId: idOf("worktree") }),
      async run(p) {
        return { recorded: await syncCommits(worktree(p.worktreeId)) };
      },
    },

    spawnAgent: {
      params: z.object({
        worktreeId: idOf("worktree"),
        provider: z.string().min(1),
        name: z.string().trim().min(1).optional(),
        model: z.string().nullable().optional(),
      }),
      async run(p) {
        if (!runtime.provider(p.provider))
          throw new OperationError(`unknown provider ${p.provider}`);
        const w = worktree(p.worktreeId);
        const label = PROVIDER_LABEL[p.provider] ?? p.provider;
        const n =
          kernel.store.agentsOf(w.projectId).filter((a) => a.provider === p.provider).length + 1;
        const created = kernel.commands.createAgent(s.human, {
          projectId: w.projectId,
          name: p.name ?? `${label} ${n}`,
          provider: p.provider,
          model: p.model ?? null,
          worktreeId: w.id,
        });
        await runtime.ensureOnline(created.id);
        return agent(created.id);
      },
    },
    startAgent: {
      params: z.object({ agentId: idOf("agent") }),
      async run(p) {
        await runtime.ensureOnline(p.agentId);
        return agent(p.agentId);
      },
    },
    stopAgent: {
      params: z.object({ agentId: idOf("agent") }),
      async run(p) {
        await runtime.stop(p.agentId);
        return agent(p.agentId);
      },
    },
    interruptAgent: {
      params: z.object({ agentId: idOf("agent") }),
      async run(p) {
        await runtime.interrupt(p.agentId);
        return agent(p.agentId);
      },
    },
    forkAgent: {
      params: z.object({ agentId: idOf("agent"), name: z.string().trim().min(1).optional() }),
      async run(p) {
        const from = agent(p.agentId);
        return runtime.fork(from.id, p.name ?? `${from.name} fork`);
      },
    },
    archiveAgent: {
      params: z.object({ agentId: idOf("agent") }),
      async run(p) {
        await runtime.archive(p.agentId);
        return agent(p.agentId);
      },
    },
    assignAgent: {
      params: z.object({ agentId: idOf("agent"), worktreeId: idOf("worktree") }),
      async run(p) {
        const wasRunning = runtime.presence(p.agentId).running;
        if (wasRunning) await runtime.stop(p.agentId);
        const a = kernel.commands.assignAgent(s.human, p);
        if (wasRunning) await runtime.ensureOnline(a.id);
        return agent(a.id);
      },
    },
    updateAgent: asHuman("updateAgent"),

    createTask: asHuman("createTask"),
    updateTask: asHuman("updateTask"),
    setTaskStatus: asHuman("setTaskStatus"),
    raiseProblem: asHuman("raiseProblem"),
    updateProblem: asHuman("updateProblem"),
    resolveProblem: asHuman("resolveProblem"),
    dismissProblem: asHuman("dismissProblem"),
    raiseQuestion: asHuman("raiseQuestion"),
    answerQuestion: asHuman("answerQuestion"),
    recordDecision: asHuman("recordDecision"),
    requestAttention: asHuman("requestAttention"),
    resolveAttention: asHuman("resolveAttention"),
    dismissAttention: asHuman("dismissAttention"),
    escalateItem: asHuman("escalateItem"),
    assignOwner: asHuman("assignOwner"),
    link: asHuman("link"),
    unlink: asHuman("unlink"),

    openDm: {
      params: z.object({
        projectId: idOf("project"),
        a: idOf("human", "agent", "system"),
        b: idOf("human", "agent", "system"),
      }),
      async run(p) {
        return kernel.commands.openConversation(s.human, {
          kind: "dm",
          projectId: p.projectId,
          a: p.a,
          b: p.b,
        });
      },
    },
    sendMessage: {
      params: z.object({ conversationId: idOf("conversation"), body: z.string().min(1) }),
      async run(p) {
        if (!kernel.store.isParticipant(p.conversationId, s.human)) {
          kernel.commands.joinConversation(s.human, {
            conversationId: p.conversationId,
            actorId: s.human,
          });
        }
        return kernel.commands.postMessage(s.human, p).message;
      },
    },
    markRead: {
      params: z.object({ conversationId: idOf("conversation") }),
      async run(p) {
        return kernel.commands.markRead(s.human, { conversationId: p.conversationId });
      },
    },

    ask: {
      params: z.object({
        projectId: idOf("project"),
        refs: z.array(z.string()).default([]),
        text: z.string().trim().min(1),
        conversationId: idOf("conversation").optional(),
      }),
      run: (p) => ask.ask(p),
    },
    applyProposal: {
      params: z.object({
        ops: z.array(
          z.object({
            name: z.string(),
            params: z.record(z.string(), z.unknown()),
            summary: z.string(),
          }),
        ),
      }),
      async run(p) {
        const out: unknown[] = [];
        for (const op of p.ops) out.push(await run(op.name as OpName, op.params));
        return out;
      },
    },
  };

  async function run<N extends OpName>(name: N, params: unknown): Promise<OpResult<N>> {
    const h = handlers[name] as Handler<N> | undefined;
    if (!h) throw new OperationError(`unknown operation ${String(name)}`, "not_found");
    const parsed = h.params.safeParse(params);
    if (!parsed.success) {
      throw new OperationError(
        `${String(name)}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "params"}: ${i.message}`).join("; ")}`,
      );
    }
    try {
      return await h.run(parsed.data as OpParams<N>);
    } catch (e) {
      if (e instanceof GitError) throw new OperationError(e.message, "git");
      throw e;
    }
  }

  return { run, names: Object.keys(handlers) as OpName[], syncCommits };
}

export type Ops = ReturnType<typeof createOperations>;
export type { Operations };
