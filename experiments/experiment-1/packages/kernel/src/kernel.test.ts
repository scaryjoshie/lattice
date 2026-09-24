import { beforeEach, describe, expect, test } from "bun:test";
import { type Event, type Id, isId, KernelError, openKernel, SYSTEM_ACTOR_ID } from "./index.ts";

/** A project with one adopted repository, its main worktree, one feature worktree, and one agent. */
function world() {
  const k = openKernel(":memory:");
  const events: Event[] = [];
  k.subscribe((e) => events.push(e));
  const me = k.commands.createHuman(SYSTEM_ACTOR_ID, { name: "Josh" }).id;
  const project = k.commands.createProject(me, { name: "Pane", goals: "Ship V0" });
  const { repository, main } = k.commands.addRepository(me, {
    projectId: project.id,
    name: "pane",
    mode: "adopted",
    gitDir: "/tmp/pane/.git",
    defaultBranch: "main",
    mainPath: "/tmp/pane",
  });
  const auth = k.commands.createWorktree(me, {
    repositoryId: repository.id,
    name: "auth",
    branch: "auth",
    path: "/tmp/Pane/pane/auth",
    objective: "Preserve sessions across reconnects",
  });
  const agent = k.commands.createAgent(me, {
    projectId: project.id,
    name: "Claude 1",
    provider: "claude-code",
    worktreeId: auth.id,
  });
  return { k, me, project, repository, main, auth, agent, events };
}

describe("ids", () => {
  test("typed and recognisable", () => {
    const { project, agent } = world();
    expect(isId(project.id, "project")).toBe(true);
    expect(isId(agent.id, "agent")).toBe(true);
    expect(isId(agent.id, "task")).toBe(false);
  });
});

describe("scopes", () => {
  let w: ReturnType<typeof world>;
  beforeEach(() => {
    w = world();
  });

  test("a repository is born with its main worktree and the feature worktree hangs off it", () => {
    expect(w.main.isMain).toBe(true);
    expect(w.main.parentWorktreeId).toBeNull();
    expect(w.auth.parentWorktreeId).toBe(w.main.id);
    expect(w.auth.status).toBe("working");
  });

  test("every worktree has a room with the human in it", () => {
    const snap = w.k.query.projectSnapshot(w.k.store, w.project.id);
    const rooms = snap?.conversations.filter((c) => c.kind === "group") ?? [];
    expect(rooms.map((r) => r.scopeId).sort()).toEqual([w.main.id, w.auth.id].sort());
    for (const r of rooms) expect(r.participantIds).toContain(w.me);
  });

  test("worktree names and paths are unique within a repository", () => {
    expect(() =>
      w.k.commands.createWorktree(w.me, {
        repositoryId: w.repository.id,
        name: "auth",
        branch: "auth-2",
        path: "/tmp/other",
      }),
    ).toThrow(KernelError);
    expect(() =>
      w.k.commands.createWorktree(w.me, {
        repositoryId: w.repository.id,
        name: "auth-2",
        branch: "auth-2",
        path: "/tmp/Pane/pane/auth",
      }),
    ).toThrow(/already a worktree/);
  });

  test("the main worktree cannot be merged", () => {
    expect(() =>
      w.k.commands.setWorktreeStatus(w.me, { worktreeId: w.main.id, status: "merged" }),
    ).toThrow(KernelError);
    const merged = w.k.commands.setWorktreeStatus(w.me, {
      worktreeId: w.auth.id,
      status: "merged",
    });
    expect(merged.status).toBe("merged");
  });
});

describe("agents", () => {
  test("assignment is an edge and puts the agent in the worktree room", () => {
    const { k, me, agent, auth, main } = world();
    expect(k.query.agentPlacement(k.store, agent.id)).toEqual({
      assignedTo: auth.id,
      locatedIn: null,
    });
    const authRoom = k.store.conversationByKey(`group:${auth.id}`);
    expect(authRoom && k.store.isParticipant(authRoom.id, agent.id)).toBe(true);

    k.commands.assignAgent(me, { agentId: agent.id, worktreeId: main.id });
    expect(k.query.agentPlacement(k.store, agent.id).assignedTo).toBe(main.id);
    expect(authRoom && k.store.isParticipant(authRoom.id, agent.id)).toBe(false);
    expect(k.query.agentsIn(k.store, main.id).map((a) => a.id)).toEqual([agent.id]);
  });

  test("location is observed separately and may differ", () => {
    const { k, agent, auth, main } = world();
    k.commands.observeAgentLocation(SYSTEM_ACTOR_ID, { agentId: agent.id, worktreeId: main.id });
    expect(k.query.agentPlacement(k.store, agent.id)).toEqual({
      assignedTo: auth.id,
      locatedIn: main.id,
    });
    k.commands.observeAgentLocation(SYSTEM_ACTOR_ID, { agentId: agent.id, worktreeId: null });
    expect(k.query.agentPlacement(k.store, agent.id).locatedIn).toBeNull();
  });

  test("lifecycle is events; archived is final", () => {
    const { k, me, agent, events } = world();
    k.commands.setAgentLifecycle(SYSTEM_ACTOR_ID, { agentId: agent.id, lifecycle: "online" });
    k.commands.setAgentLifecycle(SYSTEM_ACTOR_ID, {
      agentId: agent.id,
      lifecycle: "offline",
      detail: "exit 0",
    });
    expect(
      events.filter((e) => e.kind === "agent.online" || e.kind === "agent.offline").length,
    ).toBe(2);
    k.commands.setAgentLifecycle(me, { agentId: agent.id, lifecycle: "archived" });
    expect(() =>
      k.commands.setAgentLifecycle(me, { agentId: agent.id, lifecycle: "online" }),
    ).toThrow(/archived/);
  });

  test("fork is a new agent with a forked_from edge", () => {
    const { k, me, agent, auth, project } = world();
    const fork = k.commands.createAgent(me, {
      projectId: project.id,
      name: "Claude 2",
      provider: "claude-code",
      worktreeId: auth.id,
      forkedFromId: agent.id,
    });
    expect(fork.forkedFromId).toBe(agent.id);
    expect(k.store.relation(fork.id, "forked_from", agent.id)).toBeDefined();
  });
});

describe("items", () => {
  test("tasks form a DAG; cycles are refused", () => {
    const { k, agent, auth } = world();
    const a = k.commands.createTask(agent.id, { scopeId: auth.id, title: "Design protocol" });
    const b = k.commands.createTask(agent.id, {
      scopeId: auth.id,
      title: "Implement",
      dependsOn: [a.id],
    });
    const c = k.commands.createTask(agent.id, {
      scopeId: auth.id,
      title: "Tests",
      dependsOn: [b.id],
    });
    expect(() =>
      k.commands.link(agent.id, { sourceId: a.id, type: "depends_on", targetId: c.id }),
    ).toThrow(/cycle/);
    expect(() =>
      k.commands.link(agent.id, { sourceId: a.id, type: "depends_on", targetId: a.id }),
    ).toThrow(KernelError);
    expect(k.store.relationsFrom(c.id, "depends_on").map((r) => r.targetId)).toEqual([b.id]);
  });

  test("a problem keeps its origin when escalated", () => {
    const { k, agent, auth, project } = world();
    const task = k.commands.createTask(agent.id, { scopeId: auth.id, title: "Reconnect" });
    const p = k.commands.raiseProblem(agent.id, {
      scopeId: auth.id,
      title: "Cache eviction race",
      discoveredDuring: task.id,
    });
    const moved = k.commands.escalateItem(agent.id, { itemId: p.id, scopeId: project.id });
    expect(moved.scopeId).toBe(project.id);
    expect(moved.originScopeId).toBe(auth.id);
    expect(k.store.relation(p.id, "discovered_during", task.id)).toBeDefined();
  });

  test("resolving a problem records what resolved it and refuses a second resolution", () => {
    const { k, agent, auth, repository } = world();
    const p = k.commands.raiseProblem(agent.id, { scopeId: auth.id, title: "Duplicate delivery" });
    const commit = k.commands.recordCommit(agent.id, {
      repositoryId: repository.id,
      sha: "81bd2e0000",
      message: "Preserve session identity",
      authorName: "Claude 1",
      authoredAt: Date.now(),
      worktreeId: auth.id,
    });
    const r = k.commands.resolveProblem(agent.id, {
      problemId: p.id,
      resolution: "generation counter",
      resolvedBy: commit.id,
    });
    expect(r.status).toBe("resolved");
    expect(k.store.relation(commit.id, "resolves", p.id)).toBeDefined();
    expect(() =>
      k.commands.resolveProblem(agent.id, { problemId: p.id, resolution: "again" }),
    ).toThrow(/already/);
  });

  test("a decision can answer a question", () => {
    const { k, agent, auth } = world();
    const q = k.commands.raiseQuestion(agent.id, {
      scopeId: auth.id,
      title: "Do sessions survive restart?",
    });
    const d = k.commands.recordDecision(agent.id, {
      scopeId: auth.id,
      title: "Sessions survive restart",
      rationale: "Clients keep tokens",
      alternatives: ["Re-auth on restart"],
      resolves: [q.id],
    });
    expect(d.alternatives).toEqual(["Re-auth on restart"]);
    expect(k.store.question(q.id)?.status).toBe("answered");
  });

  test("attention requests order blocking first and resolving one can record a decision", () => {
    const { k, agent, auth, project } = world();
    const a = k.commands.requestAttention(agent.id, {
      scopeId: auth.id,
      kind: "input",
      title: "Naming preference",
    });
    const b = k.commands.requestAttention(agent.id, {
      scopeId: auth.id,
      kind: "decision",
      title: "Survive restarts?",
      blocking: true,
    });
    expect(k.query.needsYou(k.store, project.id).map((x) => x.id)).toEqual([b.id, a.id]);
    const { attention, decision } = k.commands.resolveAttention(agent.id, {
      attentionId: b.id,
      resolution: "yes",
      decision: { title: "Sessions survive restarts", rationale: "tokens" },
    });
    expect(attention.status).toBe("resolved");
    expect(decision?.title).toBe("Sessions survive restarts");
    expect(decision && k.store.relation(decision.id, "derived_from", b.id)).toBeDefined();
    expect(k.query.needsYou(k.store, project.id).map((x) => x.id)).toEqual([a.id]);
  });

  test("items cannot cross projects", () => {
    const { k, me, agent, auth } = world();
    const other = k.commands.createProject(me, { name: "Other" });
    expect(() =>
      k.commands.createTask(agent.id, { scopeId: other.id, title: "x", dependsOn: [] }),
    ).not.toThrow();
    const t = k.commands.createTask(agent.id, { scopeId: auth.id, title: "here" });
    expect(() => k.commands.escalateItem(agent.id, { itemId: t.id, scopeId: other.id })).toThrow(
      /another project/,
    );
  });
});

describe("relations", () => {
  test("types are validated by kind", () => {
    const { k, agent, auth } = world();
    const t = k.commands.createTask(agent.id, { scopeId: auth.id, title: "t" });
    expect(() =>
      k.commands.link(agent.id, { sourceId: t.id, type: "located_in", targetId: auth.id }),
    ).toThrow(/source may not be task/);
    expect(() =>
      k.commands.link(agent.id, { sourceId: agent.id, type: "assigned_to", targetId: t.id }),
    ).toThrow(/target may not be task/);
  });

  test("exclusive types replace", () => {
    const { k, me, agent, auth, main } = world();
    k.commands.link(me, { sourceId: agent.id, type: "located_in", targetId: main.id });
    k.commands.link(me, { sourceId: agent.id, type: "located_in", targetId: auth.id });
    expect(k.store.relationsFrom(agent.id, "located_in").map((r) => r.targetId)).toEqual([auth.id]);
  });
});

describe("conversations", () => {
  test("a DM is one per pair and posting creates pending deliveries", () => {
    const { k, me, agent, auth, project } = world();
    const other = k.commands.createAgent(me, {
      projectId: project.id,
      name: "Codex 1",
      provider: "codex",
      worktreeId: auth.id,
    });
    const dm = k.commands.openConversation(agent.id, {
      kind: "dm",
      projectId: project.id,
      a: agent.id,
      b: other.id,
    });
    expect(
      k.commands.openConversation(other.id, {
        kind: "dm",
        projectId: project.id,
        a: other.id,
        b: agent.id,
      }).id,
    ).toBe(dm.id);
    const { message, deliveries } = k.commands.postMessage(agent.id, {
      conversationId: dm.id,
      body: "Does auth keep session ids?",
    });
    expect(deliveries.map((d) => [d.toActorId, d.status])).toEqual([[other.id, "pending"]]);
    expect(k.query.undelivered(k.store, other.id).map((m) => m.id)).toEqual([message.id]);
    k.commands.setDelivery(SYSTEM_ACTOR_ID, {
      messageId: message.id,
      toActorId: other.id,
      status: "delivered",
      detail: "pty",
    });
    expect(k.query.undelivered(k.store, other.id)).toEqual([]);
    expect(k.commands.markRead(other.id, { conversationId: dm.id })).toBe(1);
    expect(k.store.delivery(message.id, other.id)?.status).toBe("read");
    expect(() => k.commands.postMessage(me, { conversationId: dm.id, body: "hi" })).toThrow(
      /not in this conversation/,
    );
  });

  test("the room delivers to every member but the sender", () => {
    const { k, me, agent, auth } = world();
    const room = k.store.conversationByKey(`group:${auth.id}`);
    if (!room) throw new Error("no room");
    const { deliveries } = k.commands.postMessage(me, {
      conversationId: room.id,
      body: "Start with the protocol.",
    });
    expect(deliveries.map((d) => d.toActorId)).toEqual([agent.id]);
    const snap = k.query.projectSnapshot(k.store, auth.projectId);
    expect(snap?.conversations.find((c) => c.id === room.id)?.messageCount).toBe(1);
  });
});

describe("provenance and events", () => {
  test("why does this task exist? walks recorded edges without a model", () => {
    const { k, agent, auth, repository } = world();
    const commit = k.commands.recordCommit(agent.id, {
      repositoryId: repository.id,
      sha: "abcdef1234",
      message: "add cache",
      authorName: "Claude 1",
      authoredAt: 1,
    });
    const problem = k.commands.raiseProblem(agent.id, {
      scopeId: auth.id,
      title: "Cache race",
      causedBy: [commit.id],
    });
    const task = k.commands.createTask(agent.id, {
      scopeId: auth.id,
      title: "Fix race",
      derivedFrom: [problem.id],
    });
    const why = k.query.provenance(k.store, task.id);
    expect(why?.created?.kind).toBe("task.created");
    expect(why?.edges[0]?.relation.type).toBe("derived_from");
    expect(why?.edges[0]?.node.object.id).toBe(problem.id);
    expect(why?.edges[0]?.node.edges[0]?.node.object.id).toBe(commit.id);
  });

  test("every command emits events with actor and target, in order", () => {
    const { k, events, agent, project } = world();
    expect(events.map((e) => e.kind)).toEqual([
      "actor.created",
      "project.created",
      "repository.added",
      "worktree.created",
      "conversation.opened",
      "conversation.joined",
      "worktree.created",
      "conversation.opened",
      "conversation.joined",
      "agent.created",
      "relation.added",
      "conversation.joined",
      "agent.assigned",
    ]);
    expect(events.at(-1)?.actorId).not.toBe(agent.id);
    expect(k.query.eventsSince(k.store, 0, project.id).length).toBe(13);
    expect(events.every((e, i) => i === 0 || (events[i - 1]?.seq ?? 0) < e.seq)).toBe(true);
  });

  test("a failed command leaves no rows and no events", () => {
    const { k, agent, auth, events } = world();
    const n = events.length;
    expect(() =>
      k.commands.createTask(agent.id, {
        scopeId: auth.id,
        title: "x",
        dependsOn: ["task_missing" as Id<"task">],
      }),
    ).toThrow(/not found/);
    expect(events.length).toBe(n);
    expect(k.store.tasksOf(auth.projectId)).toEqual([]);
    expect(k.store.lastEventSeq()).toBe(n);
  });

  test("invalid params are rejected before anything runs", () => {
    const { k, agent, auth } = world();
    expect(() => k.run("createTask", agent.id, { scopeId: auth.id, title: "" })).toThrow(/title/);
    expect(() => k.run("createTask", "agent_nobody", { scopeId: auth.id, title: "x" })).toThrow(
      /actor/,
    );
  });
});

describe("snapshot", () => {
  test("holds everything in the project", () => {
    const { k, project, agent, auth } = world();
    k.commands.createTask(agent.id, { scopeId: auth.id, title: "t" });
    const s = k.query.projectSnapshot(k.store, project.id);
    expect(s?.repositories.length).toBe(1);
    expect(s?.worktrees.length).toBe(2);
    expect(s?.agents.length).toBe(1);
    expect(s?.tasks.length).toBe(1);
    expect(s?.relations.some((r) => r.type === "assigned_to")).toBe(true);
    expect(s?.eventSeq).toBe(k.store.lastEventSeq());
    const summary = k.query.worktreeSummary(k.store, auth.id);
    expect(summary?.tasks.total).toBe(1);
    expect(summary?.agentIds).toEqual([agent.id]);
  });
});
