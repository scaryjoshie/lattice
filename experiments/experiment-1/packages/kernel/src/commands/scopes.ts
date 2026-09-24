import { z } from "zod";
import {
  type Id,
  idOf,
  newId,
  type Project,
  type Repository,
  WORKTREE_STATUSES,
  type Worktree,
} from "../model/index.ts";
import { type Ctx, command, KernelError } from "./define.ts";
import { openGroup } from "./evidence.ts";
import { requireProject, requireRepository, requireWorktree } from "./guards.ts";

const name = z.string().trim().min(1).max(120);

export const createProject = command(
  "createProject",
  z.object({ name, goals: z.string().default("") }),
  (ctx, p): Project => {
    const id = newId("project");
    ctx.store.insert("projects", {
      id,
      name: p.name,
      goals: p.goals,
      created_by: ctx.actor,
      created_at: ctx.now,
      updated_at: ctx.now,
    });
    ctx.emit("project.created", { target: id, project: id, payload: { name: p.name } });
    return requireProject(ctx, id);
  },
);

export const updateProject = command(
  "updateProject",
  z.object({ projectId: idOf("project"), name: name.optional(), goals: z.string().optional() }),
  (ctx, p): Project => {
    requireProject(ctx, p.projectId);
    const patch: Record<string, string | number> = { updated_at: ctx.now };
    if (p.name !== undefined) patch.name = p.name;
    if (p.goals !== undefined) patch.goals = p.goals;
    ctx.store.update("projects", { id: p.projectId }, patch);
    ctx.emit("project.updated", { target: p.projectId, project: p.projectId, payload: patch });
    return requireProject(ctx, p.projectId);
  },
);

export const archiveProject = command(
  "archiveProject",
  z.object({ projectId: idOf("project") }),
  (ctx, p): Project => {
    requireProject(ctx, p.projectId);
    ctx.store.update(
      "projects",
      { id: p.projectId },
      { archived_at: ctx.now, updated_at: ctx.now },
    );
    ctx.emit("project.archived", { target: p.projectId, project: p.projectId });
    return requireProject(ctx, p.projectId);
  },
);

/**
 * A repository always has a main worktree: the checkout of its default branch, which
 * is the root of its worktree tree and the integration target of the others.
 */
export const addRepository = command(
  "addRepository",
  z.object({
    projectId: idOf("project"),
    name,
    mode: z.enum(["managed", "adopted"]),
    gitDir: z.string().min(1),
    defaultBranch: z.string().min(1),
    remoteUrl: z.string().nullable().default(null),
    mainPath: z.string().min(1),
  }),
  (ctx, p): { repository: Repository; main: Worktree } => {
    requireProject(ctx, p.projectId);
    if (ctx.store.worktreeByPath(p.mainPath)) {
      throw new KernelError(`${p.mainPath} is already a worktree`, "conflict");
    }
    const id = newId("repository");
    ctx.store.insert("repositories", {
      id,
      project_id: p.projectId,
      name: p.name,
      mode: p.mode,
      git_dir: p.gitDir,
      default_branch: p.defaultBranch,
      remote_url: p.remoteUrl,
      created_by: ctx.actor,
      created_at: ctx.now,
    });
    ctx.emit("repository.added", {
      target: id,
      project: p.projectId,
      payload: { name: p.name, mode: p.mode },
    });
    const main = insertWorktree(ctx, {
      projectId: p.projectId,
      repositoryId: id,
      parentWorktreeId: null,
      isMain: true,
      name: p.defaultBranch,
      branch: p.defaultBranch,
      path: p.mainPath,
      objective: "",
    });
    return { repository: requireRepository(ctx, id), main };
  },
);

function insertWorktree(
  ctx: Ctx,
  w: {
    projectId: Id<"project">;
    repositoryId: Id<"repository">;
    parentWorktreeId: Id<"worktree"> | null;
    isMain: boolean;
    name: string;
    branch: string;
    path: string;
    objective: string;
  },
): Worktree {
  const id = newId("worktree");
  ctx.store.insert("worktrees", {
    id,
    project_id: w.projectId,
    repository_id: w.repositoryId,
    parent_worktree_id: w.parentWorktreeId,
    is_main: w.isMain ? 1 : 0,
    name: w.name,
    branch: w.branch,
    path: w.path,
    objective: w.objective,
    status: "working",
    created_by: ctx.actor,
    created_at: ctx.now,
    updated_at: ctx.now,
  });
  ctx.emit("worktree.created", {
    target: id,
    project: w.projectId,
    payload: {
      name: w.name,
      branch: w.branch,
      isMain: w.isMain,
      parentWorktreeId: w.parentWorktreeId,
    },
  });
  // Every worktree has a room its agents and the humans are in.
  openGroup(ctx, w.projectId, id);
  return requireWorktree(ctx, id);
}

export const createWorktree = command(
  "createWorktree",
  z.object({
    repositoryId: idOf("repository"),
    name,
    branch: z.string().min(1),
    path: z.string().min(1),
    objective: z.string().default(""),
    /** Defaults to the repository's main worktree. */
    parentWorktreeId: idOf("worktree").optional(),
  }),
  (ctx, p): Worktree => {
    const repo = requireRepository(ctx, p.repositoryId);
    const siblings = ctx.store.worktreesOfRepository(repo.id);
    const parent = p.parentWorktreeId
      ? requireWorktree(ctx, p.parentWorktreeId)
      : siblings.find((w) => w.isMain);
    if (!parent) throw new KernelError("repository has no main worktree", "conflict");
    if (parent.repositoryId !== repo.id) {
      throw new KernelError("parent worktree belongs to another repository", "forbidden");
    }
    if (siblings.some((w) => w.name === p.name)) {
      throw new KernelError(`worktree "${p.name}" already exists in ${repo.name}`, "conflict");
    }
    if (ctx.store.worktreeByPath(p.path)) {
      throw new KernelError(`${p.path} is already a worktree`, "conflict");
    }
    return insertWorktree(ctx, {
      projectId: repo.projectId,
      repositoryId: repo.id,
      parentWorktreeId: parent.id,
      isMain: false,
      name: p.name,
      branch: p.branch,
      path: p.path,
      objective: p.objective,
    });
  },
);

export const updateWorktree = command(
  "updateWorktree",
  z.object({
    worktreeId: idOf("worktree"),
    objective: z.string().optional(),
    name: name.optional(),
  }),
  (ctx, p): Worktree => {
    const w = requireWorktree(ctx, p.worktreeId);
    const patch: Record<string, string | number> = { updated_at: ctx.now };
    if (p.objective !== undefined) patch.objective = p.objective;
    if (p.name !== undefined) patch.name = p.name;
    ctx.store.update("worktrees", { id: w.id }, patch);
    ctx.emit("worktree.updated", { target: w.id, project: w.projectId, payload: patch });
    return requireWorktree(ctx, w.id);
  },
);

export const setWorktreeStatus = command(
  "setWorktreeStatus",
  z.object({ worktreeId: idOf("worktree"), status: z.enum(WORKTREE_STATUSES) }),
  (ctx, p): Worktree => {
    const w = requireWorktree(ctx, p.worktreeId);
    if (w.isMain && p.status !== "working" && p.status !== "idle") {
      throw new KernelError("the main worktree cannot be merged or abandoned", "forbidden");
    }
    ctx.store.update("worktrees", { id: w.id }, { status: p.status, updated_at: ctx.now });
    ctx.emit("worktree.status_changed", {
      target: w.id,
      project: w.projectId,
      payload: { from: w.status, to: p.status },
    });
    return requireWorktree(ctx, w.id);
  },
);
