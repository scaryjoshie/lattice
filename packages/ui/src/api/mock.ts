import type {
  ActorId,
  Agent,
  AttentionRequest,
  Conversation,
  ConversationSummary,
  Decision,
  Event,
  Message,
  Problem,
  Project,
  ProjectSnapshot,
  Question,
  Relation,
  Repository,
  Task,
  Worktree,
} from "@pane/kernel/model";
import type { AgentPresence, AskAnswer, OpName, OpParams, ServerFrame } from "@pane/protocol";
import type { Api, Connection } from "./types.ts";

/** In-memory stand-in for the server, for developing the UI on its own (`?mock=1`). */

const now = Date.now();
const me = "human_you" as ActorId;
const sys = "sys_pane" as ActorId;
let counter = 0;
const id = <P extends string>(p: P) =>
  `${p}_${(++counter).toString(36).padStart(7, "0")}` as `${P}_${string}`;

const project: Project = {
  id: id("proj"),
  name: "Pane",
  goals: "Ship V0",
  createdBy: me,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
};

const repo = (name: string, branch: string): Repository => ({
  id: id("repo"),
  projectId: project.id,
  name,
  mode: "adopted",
  gitDir: `/Users/you/code/${name}/.git`,
  defaultBranch: branch,
  remoteUrl: null,
  createdBy: me,
  createdAt: now,
});
const repos = [repo("pane", "main"), repo("modelbus", "main")];

const wt = (r: Repository, name: string, main: Worktree | null, objective: string): Worktree => ({
  id: id("wt"),
  projectId: project.id,
  repositoryId: r.id,
  parentWorktreeId: main?.id ?? null,
  isMain: main === null,
  name,
  branch: name,
  path: main ? `/Users/you/Pane/projects/Pane/${r.name}/${name}` : `/Users/you/code/${r.name}`,
  objective,
  status: "working",
  createdBy: me,
  createdAt: now - 3600_000,
  updatedAt: now,
});
const r0 = repos[0] as Repository;
const r1 = repos[1] as Repository;
const main0 = wt(r0, "main", null, "");
const auth = wt(r0, "auth", main0, "Preserve logical sessions across transport reconnects");
const graph = wt(r0, "graph-ui", main0, "Semantic zoom on the canvas");
const main1 = wt(r1, "main", null, "");
const sdk = wt(r1, "sdk", main1, "Typed client for the daemon protocol");
const relay = wt(r1, "relay", main1, "Hosted relay between machines");
const worktrees = [main0, auth, graph, main1, sdk, relay];

const agent = (name: string, provider: string, lifecycle: Agent["lifecycle"]): Agent => ({
  id: id("agent"),
  projectId: project.id,
  name,
  provider,
  model: null,
  sessionKey: null,
  lifecycle,
  forkedFromId: null,
  createdBy: me,
  createdAt: now,
  updatedAt: now,
});
const claude1 = agent("Claude 1", "claude-code", "online");
const claude2 = agent("Claude 2", "claude-code", "online");
const codex1 = agent("Codex 1", "codex", "offline");
const agents = [claude1, claude2, codex1];
const homes = new Map<string, Worktree>([
  [claude1.id, auth],
  [claude2.id, graph],
  [codex1.id, sdk],
]);

const relations: Relation[] = [];
const rel = (s: string, type: Relation["type"], t: string) =>
  relations.push({ sourceId: s, type, targetId: t, createdBy: me, createdAt: now });
for (const a of agents) rel(a.id, "assigned_to", (homes.get(a.id) as Worktree).id);
rel(claude2.id, "located_in", auth.id);

const item = (scope: Worktree, title: string, by: ActorId) => ({
  projectId: project.id,
  scopeId: scope.id,
  originScopeId: scope.id,
  title,
  createdBy: by,
  createdAt: now - 600_000,
  updatedAt: now - 60_000,
});
const tasks: Task[] = [
  {
    id: id("task"),
    ...item(auth, "Design reconnect protocol", claude1.id),
    description: "",
    status: "done",
  },
  {
    id: id("task"),
    ...item(auth, "Implement generation counter", claude1.id),
    description: "Monotonic per session.",
    status: "in_progress",
  },
  {
    id: id("task"),
    ...item(auth, "Regression test for duplicate delivery", claude1.id),
    description: "",
    status: "open",
  },
  {
    id: id("task"),
    ...item(graph, "Aggregate wires at project zoom", claude2.id),
    description: "",
    status: "open",
  },
];
rel((tasks[1] as Task).id, "depends_on", (tasks[0] as Task).id);
rel((tasks[2] as Task).id, "depends_on", (tasks[1] as Task).id);
const problems: Problem[] = [
  {
    id: id("prob"),
    ...item(auth, "Reconnect can duplicate queued delivery", claude1.id),
    description: "Seen in the integration test.",
    status: "open",
    resolution: null,
  },
  {
    id: id("prob"),
    ...item(graph, "Edge labels overlap at low zoom", claude2.id),
    description: "",
    status: "resolved",
    resolution: "Hidden below 0.6 zoom",
  },
];
rel((problems[0] as Problem).id, "discovered_during", (tasks[1] as Task).id);
const questions: Question[] = [
  {
    id: id("q"),
    ...item(auth, "Do sessions survive server restart?", claude1.id),
    description: "",
    status: "open",
    answer: null,
  },
];
const decisions: Decision[] = [
  {
    id: id("dec"),
    ...item(auth, "Use a generation counter", claude1.id),
    rationale: "Connection ids change on reconnect while pending messages survive.",
    alternatives: ["Global message ids", "Idempotent consumer state"],
  },
];
const attention: AttentionRequest[] = [
  {
    id: id("att"),
    ...item(auth, "Should sessions survive server restarts?", claude1.id),
    kind: "decision",
    description: "Restart persistence changes the token design.",
    blocking: true,
    status: "open",
    resolution: null,
    resolvedAt: null,
  },
  {
    id: id("att"),
    ...item(graph, "Naming: wires or links?", claude2.id),
    kind: "input",
    description: "",
    blocking: false,
    status: "open",
    resolution: null,
    resolvedAt: null,
  },
];

const conv = (
  kind: Conversation["kind"],
  key: string,
  scopeId: Worktree["id"] | null,
  participants: ActorId[],
): ConversationSummary => ({
  id: id("conv"),
  projectId: project.id,
  kind,
  key,
  scopeId,
  title: null,
  createdBy: me,
  createdAt: now,
  participantIds: participants,
  messageCount: 0,
  lastMessageAt: null,
  unreadForHuman: 0,
});
const conversations: ConversationSummary[] = worktrees.map((w) =>
  conv("group", `group:${w.id}`, w.id, [
    me,
    ...agents.filter((a) => homes.get(a.id)?.id === w.id).map((a) => a.id),
  ]),
);
const dm = conv("dm", `dm:${[claude1.id, claude2.id].sort().join("+")}`, null, [
  claude1.id,
  claude2.id,
]);
conversations.push(dm);
const messages = new Map<string, Message[]>();
let seq = 0;
const post = (c: ConversationSummary, from: ActorId, body: string, at = Date.now()) => {
  const m: Message = {
    seq: ++seq,
    id: id("msg"),
    conversationId: c.id,
    fromActorId: from,
    body,
    createdAt: at,
  };
  messages.set(c.id, [...(messages.get(c.id) ?? []), m]);
  c.messageCount++;
  c.lastMessageAt = at;
  return m;
};
post(dm, claude1.id, "Does the graph worktree change Session creation?", now - 500_000);
post(dm, claude2.id, "No. I only read session ids for edge labels.", now - 480_000);
post(dm, claude1.id, "Good. Keep it that way until auth merges.", now - 20_000);
const authRoom = conversations.find((c) => c.scopeId === auth.id) as ConversationSummary;
post(authRoom, me, "Start with the protocol, then the counter.", now - 900_000);
post(authRoom, claude1.id, "Protocol is done. Counter in progress.", now - 100_000);

const presence: AgentPresence[] = agents.map((a) => ({
  agentId: a.id,
  lifecycle: a.lifecycle,
  running: a.lifecycle === "online",
  pid: a.lifecycle === "online" ? 1000 + counter : null,
  status: a.id === claude1.id ? "busy" : a.lifecycle === "online" ? "idle" : null,
  cwd: homes.get(a.id)?.path ?? null,
  activeAt: now,
}));

const actors = [
  { id: me, kind: "human" as const, name: "You", createdAt: now },
  { id: sys, kind: "system" as const, name: "Pane", createdAt: now },
  ...agents.map((a) => ({ id: a.id, kind: "agent" as const, name: a.name, createdAt: now })),
];

const listeners = new Set<(f: ServerFrame) => void>();
let eventSeq = 0;
const emit = (kind: string, targetId: string | null) => {
  const event: Event = {
    seq: ++eventSeq,
    id: id("ev"),
    projectId: project.id,
    kind,
    actorId: me,
    at: Date.now(),
    targetId,
    causeId: null,
    payload: {},
  };
  for (const l of listeners) l({ type: "event", event });
};

const snapshot = (): ProjectSnapshot => ({
  project,
  repositories: repos,
  worktrees,
  actors: actors.map((a) => ({ ...a, name: agents.find((g) => g.id === a.id)?.name ?? a.name })),
  agents,
  tasks,
  problems,
  questions,
  decisions,
  attention,
  commits: [],
  conversations,
  relations,
  eventSeq,
});

const find = <T extends { id: string }>(xs: T[], i: string): T => {
  const x = xs.find((v) => v.id === i);
  if (!x) throw new Error(`${i} not found`);
  return x;
};

function run<N extends OpName>(name: N, p: OpParams<N>): unknown {
  const t = Date.now();
  switch (name) {
    case "createProject":
      return project;
    case "createTask": {
      const q = p as OpParams<"createTask">;
      const w = find(worktrees, q.scopeId);
      const task: Task = {
        id: id("task"),
        ...item(w, q.title, me),
        description: q.description ?? "",
        status: q.status ?? "open",
        createdAt: t,
        updatedAt: t,
      };
      tasks.push(task);
      for (const d of q.dependsOn ?? []) rel(task.id, "depends_on", d);
      emit("task.created", task.id);
      return task;
    }
    case "setTaskStatus": {
      const q = p as OpParams<"setTaskStatus">;
      const task = find(tasks, q.taskId);
      task.status = q.status;
      emit("task.status_changed", task.id);
      return task;
    }
    case "updateWorktree": {
      const q = p as OpParams<"updateWorktree">;
      const w = find(worktrees, q.worktreeId);
      if (q.objective !== undefined) w.objective = q.objective;
      if (q.name !== undefined) w.name = q.name;
      emit("worktree.updated", w.id);
      return w;
    }
    case "createWorktree": {
      const q = p as OpParams<"createWorktree">;
      const r = find(repos, q.repositoryId);
      const mainWt = worktrees.find((w) => w.repositoryId === r.id && w.isMain) as Worktree;
      const w = wt(r, q.name, mainWt, q.objective ?? "");
      worktrees.push(w);
      conversations.push(conv("group", `group:${w.id}`, w.id, [me]));
      emit("worktree.created", w.id);
      return w;
    }
    case "removeWorktree":
    case "mergeWorktree": {
      const w = find(worktrees, (p as { worktreeId: string }).worktreeId);
      w.status = name === "removeWorktree" ? "abandoned" : "merged";
      emit("worktree.status_changed", w.id);
      return name === "mergeWorktree" ? { worktree: w, merged: true, conflicts: [] } : w;
    }
    case "spawnAgent": {
      const q = p as OpParams<"spawnAgent">;
      const w = find(worktrees, q.worktreeId);
      const n = agents.filter((a) => a.provider === q.provider).length + 1;
      const a = agent(
        q.name ?? `${q.provider === "codex" ? "Codex" : "Claude"} ${n}`,
        q.provider,
        "online",
      );
      agents.push(a);
      homes.set(a.id, w);
      actors.push({ id: a.id, kind: "agent", name: a.name, createdAt: t });
      rel(a.id, "assigned_to", w.id);
      const room = conversations.find((c) => c.scopeId === w.id);
      room?.participantIds.push(a.id);
      presence.push({
        agentId: a.id,
        lifecycle: "online",
        running: true,
        pid: 2000 + counter,
        status: "idle",
        cwd: w.path,
        activeAt: t,
      });
      emit("agent.created", a.id);
      for (const l of listeners) l({ type: "presence", agents: presence });
      return a;
    }
    case "startAgent":
    case "stopAgent":
    case "archiveAgent": {
      const a = find(agents, (p as { agentId: string }).agentId);
      a.lifecycle =
        name === "startAgent" ? "online" : name === "stopAgent" ? "suspended" : "archived";
      const pr = presence.find((x) => x.agentId === a.id);
      if (pr) {
        pr.lifecycle = a.lifecycle;
        pr.running = a.lifecycle === "online";
        pr.status = pr.running ? "idle" : null;
      }
      emit(`agent.${a.lifecycle}`, a.id);
      for (const l of listeners) l({ type: "presence", agents: presence });
      return a;
    }
    case "interruptAgent":
      return find(agents, (p as { agentId: string }).agentId);
    case "forkAgent": {
      const q = p as OpParams<"forkAgent">;
      const from = find(agents, q.agentId);
      return run("spawnAgent", {
        worktreeId: (homes.get(from.id) as Worktree).id,
        provider: from.provider,
        name: q.name,
      });
    }
    case "updateAgent": {
      const q = p as OpParams<"updateAgent">;
      const a = find(agents, q.agentId);
      if (q.name !== undefined) a.name = q.name;
      emit("agent.updated", a.id);
      return a;
    }
    case "resolveProblem":
    case "dismissProblem": {
      const q = p as { problemId: string; resolution?: string; reason?: string };
      const pr = find(problems, q.problemId);
      pr.status = name === "resolveProblem" ? "resolved" : "dismissed";
      pr.resolution = q.resolution ?? q.reason ?? null;
      emit("problem.resolved", pr.id);
      return pr;
    }
    case "answerQuestion": {
      const q = p as OpParams<"answerQuestion">;
      const qu = find(questions, q.questionId);
      qu.status = "answered";
      qu.answer = q.answer;
      emit("question.answered", qu.id);
      return qu;
    }
    case "recordDecision": {
      const q = p as OpParams<"recordDecision">;
      const w = worktrees.find((x) => x.id === q.scopeId) ?? auth;
      const d: Decision = {
        id: id("dec"),
        ...item(w, q.title, me),
        rationale: q.rationale ?? "",
        alternatives: q.alternatives ?? [],
        createdAt: t,
        updatedAt: t,
      };
      decisions.push(d);
      emit("decision.recorded", d.id);
      return d;
    }
    case "resolveAttention":
    case "dismissAttention": {
      const q = p as {
        attentionId: string;
        resolution?: string;
        decision?: { title: string; rationale?: string };
      };
      const a = find(attention, q.attentionId);
      a.status = name === "resolveAttention" ? "resolved" : "dismissed";
      a.resolution = q.resolution ?? null;
      a.resolvedAt = t;
      const d = q.decision
        ? (run("recordDecision", {
            scopeId: a.scopeId,
            title: q.decision.title,
            rationale: q.decision.rationale,
          }) as Decision)
        : null;
      emit("attention.resolved", a.id);
      return name === "resolveAttention" ? { attention: a, decision: d } : a;
    }
    case "openDm": {
      const q = p as OpParams<"openDm">;
      const key = `dm:${[q.a, q.b].sort().join("+")}`;
      const c = conversations.find((x) => x.key === key) ?? conv("dm", key, null, [q.a, q.b]);
      if (!conversations.includes(c)) conversations.push(c);
      emit("conversation.opened", c.id);
      return c;
    }
    case "sendMessage": {
      const q = p as OpParams<"sendMessage">;
      const c = find(conversations, q.conversationId);
      if (!c.participantIds.includes(me)) c.participantIds.push(me);
      const m = post(c, me, q.body);
      emit("message.posted", m.id);
      return m;
    }
    case "markRead": {
      const c = find(conversations, (p as OpParams<"markRead">).conversationId);
      const n = c.unreadForHuman;
      c.unreadForHuman = 0;
      return n;
    }
    case "ask": {
      const q = p as OpParams<"ask">;
      const c = conv("ask", `ask:${counter}`, null, [me]);
      conversations.push(c);
      const subject = q.refs[0];
      const task = tasks.find((x) => x.id === subject);
      const answer: AskAnswer = task
        ? {
            conversationId: c.id,
            level: "recorded",
            text: `${task.title} was created by ${claude1.name} in ${auth.name}${relations.some((r) => r.sourceId === task.id && r.type === "depends_on") ? " and depends on an earlier task" : ""}.`,
            sources: [{ id: task.id, kind: "task", title: task.title }],
            respondents: [],
            proposal: null,
          }
        : /deal|split|create|move/i.test(q.text)
          ? {
              conversationId: c.id,
              level: "actor",
              text: "Isolated from the current objective.",
              sources: [],
              respondents: [
                {
                  actorId: claude1.id,
                  name: claude1.name,
                  text: "This is separate from reconnect work; a child worktree would keep it out of the way.",
                },
              ],
              proposal: [
                {
                  name: "createWorktree",
                  params: {
                    repositoryId: r0.id,
                    name: "fix-flake",
                    objective: "Fix the flaky reconnect test",
                  },
                  summary: "Create worktree fix-flake",
                },
              ],
            }
          : {
              conversationId: c.id,
              level: "reconstructed",
              text: "No recorded rationale. From the diff: the guard rejects packets from a pre-reconnect epoch.",
              sources: q.refs.map((r) => ({ id: r, kind: r.split("_")[0] ?? "", title: r })),
              respondents: [],
              proposal: null,
            };
      return answer;
    }
    case "applyProposal": {
      const q = p as OpParams<"applyProposal">;
      return q.ops.map((o) => run(o.name, o.params as never));
    }
    default:
      emit("noop", null);
      return null;
  }
}

export const mockApi: Api = {
  op: async (name, params) => run(name, params) as never,
  projects: async () => [project],
  snapshot: async () => snapshot(),
  messages: async (c) => messages.get(c) ?? [],
  needsYou: async () =>
    attention
      .filter((a) => a.status === "open")
      .sort((x, y) => Number(y.blocking) - Number(x.blocking)),
  providers: async () => [
    {
      name: "claude-code",
      label: "Claude Code",
      installed: true,
      version: "2.1",
      loggedIn: true,
      account: "you@example.com",
      loginCommand: "claude auth login",
    },
    {
      name: "codex",
      label: "Codex",
      installed: true,
      version: "0.9",
      loggedIn: false,
      account: null,
      loginCommand: "codex login",
    },
  ],
  presence: async () => presence,
  why: async (i) => ({
    object: { id: i, kind: i.split("_")[0] ?? "", title: i },
    created: null,
    edges: [],
  }),
  worktreeGit: async (w) => ({
    worktreeId: w,
    branch: find(worktrees, w).branch,
    ahead: w === auth.id ? 3 : 0,
    behind: w === auth.id ? 1 : 0,
    dirtyFiles: 2,
    insertions: 81,
    deletions: 12,
    lastCommit: {
      sha: "81bd2e0",
      message: "Preserve session identity through reconnect",
      authoredAt: now - 3000_000,
    },
  }),
  commitDiff: async () => ({ diff: "" }),
  connect(onFrame): Connection {
    listeners.add(onFrame);
    const lines = new Map<string, string>();
    return {
      send(frame) {
        if (frame.type === "terminal.open")
          onFrame({
            type: "terminal",
            agentId: frame.agentId,
            data: `\x1b[2m${find(agents, frame.agentId).name}\x1b[0m\r\n$ `,
          });
        if (frame.type === "terminal.input") {
          const line = lines.get(frame.agentId) ?? "";
          if (frame.data === "\r") {
            onFrame({ type: "terminal", agentId: frame.agentId, data: `\r\n${line}\r\n$ ` });
            lines.set(frame.agentId, "");
          } else if (frame.data === "\x7f") {
            lines.set(frame.agentId, line.slice(0, -1));
            if (line) onFrame({ type: "terminal", agentId: frame.agentId, data: "\b \b" });
          } else {
            lines.set(frame.agentId, line + frame.data);
            onFrame({ type: "terminal", agentId: frame.agentId, data: frame.data });
          }
        }
      },
      close() {
        listeners.delete(onFrame);
      },
    };
  },
};
