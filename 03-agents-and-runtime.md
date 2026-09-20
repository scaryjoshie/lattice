# 3. Agents and runtime

## Agents are persistent logical identities

Pane has **Agent 17**, not **Claude process 19381**. The logical agent survives close,
restart, offline, resume, app restart, terminal reconnect. Its underlying
process/session can disappear and return.

```
Agent {
  id
  name
  backend        // claude-code | codex | opencode | ...
  lifecycle      // online | offline | suspended | archived
}
```

Most richness is relationships, not columns on the agent row (see
[domain-model.md](01-domain-model.md)).

`AgentRun` was explicitly dropped as a domain concept. Boot/restart history is events
(`agent.online`, `agent.offline`, `agent.resumed`), not separate user-visible actors.

## Location and assignment are distinct

```
agent.location    = observed        (auto-detected from cwd / Git / worktree)
agent.assignment  = organizational  (durable project intent)
```

An agent might be assigned to "Implement reconnect support" while physically operating
in the frontend worktree. Maybe expected, maybe suspicious. Pane knows both. Agents
should not have to announce which worktree they are in. **Changing cwd does not create a
new Agent.** This is also the answer to "can I peek at where an agent is located?": yes,
location is observed state and rendered on the agent card.

## Provider abstraction (Modelbus evolves into the runtime)

Claude Code, Codex, OpenCode, whatever comes next. Pane must not embed each provider's
lifecycle semantics everywhere.

```
interface AgentBackend {
  create(...)
  ensureOnline(...)
  send(...)
  interrupt(...)
  suspend(...)
  terminate(...)
  fork(...)
  inspect(...)
}
```

Pane says "send message to agent_17". The runtime knows whether that means resuming
Claude, talking to a running Codex process, or starting something new.

Instead of `Pane → external Modelbus`, the stack is:

```
PANE
  UI
  Project / work graph
  Problem system
  Task system
  Git / worktrees
  Assistant / query layer
  Agent runtime + communication      ← evolved Modelbus
  Provider adapters
```

Modelbus may remain a separable library internally, but Pane owns the whole experience.

## Lifecycle should feel trivial

From the user's perspective: `Agent 12 ● online` or `Agent 12 ○ offline`. Messaging an
offline agent does `ensureOnline(agent_12); send(...)`. Users do not think about
terminal process lifecycles. Only explicit operations (`suspend`, `archive`, `fork`)
feel meaningful.

## Forking is different from restarting

```
Restart:   Agent 12 → offline → online     (still Agent 12)

Fork:          Agent 12
                  │ fork
                  ▼
               Agent 29                    (a new persistent logical actor)
```

This matters for addressing and provenance.

## Three agent roles in V0

We were drifting toward project manager + worktree manager + coding agent + routing
manager + summarization agent, which is an agent-framework research project, not the
product. V0 has exactly three roles.

### 1. Coding agents — change the world

Long-running, attached to worktrees. They write code **and maintain the local project
state of their own worktree**. The coding agent is the **local steward**.

Its system context effectively says:

> You are working within Worktree X toward Objective Y. Pane is persistent project
> state. When you identify work, problems, unresolved decisions, or things requiring the
> user, update Pane using the appropriate structured operation rather than leaving them
> only in conversation.

Tools:

```
create_task        update_task       raise_problem      resolve_problem
raise_question     record_decision   request_user       commit
```

Normal work looks like:

```
Agent investigates code
→ creates Task 18
→ discovers Problem 7
→ decides Problem 7 is unrelated to this worktree
→ raises its scope to project
→ completes Task 18
→ creates commit
→ marks Task 18 done
→ requests user decision on API naming
```

**The coding agent does its own planning.** Given "Implement reconnect support", it
creates the task graph and dependencies, then edits it as reality changes. You watch it
happen live. This beats a planning agent producing a plan that the implementation agent
then has to obey while stale. The coding agent has the richest local context; let it
maintain the local plan. The human can still edit directly, and Ask mode can say "Why
are you doing step 3 before step 2?" or "Split this into two tasks." The task graph is a
shared workspace between human and agent, not a manager's instruction document.

### 2. Routing agents — find things

Very short-lived. Given user question, selected UI objects, scope hierarchy, object
index, they return relevant objects, relevant scope, possibly a relevant active agent.
They do **not** answer the substantive question unless explicitly asked, and never
rewrite messages between coding agents. See [communication.md](04-communication.md).

### 3. Summarization / extraction agents — derive things

Background, cheap models. Triggered by commit created, large work interval completed,
worktree becoming idle, conversation completed. Produce commit explanations, concise
worktree summaries, later candidate missed problems / open loops. Outputs are derived
and replaceable, and always carry provenance and an inference marker.

## Authority asymmetry

Broad freedom inside scope, little outside it.

| Inside own worktree (free) | Outside own worktree (needs explicit permission / higher-level op) |
|---|---|
| create / update tasks | reassign another worktree's task |
| raise / resolve local problems | close another worktree's problem |
| record decisions | change project goal |
| change local plan | merge another worktree |
| create commits | |

Agents *can* say "raise Problem 18 to project scope" or "request creation of another
worktree." Otherwise one ambitious Claude reorganizes the entire project because it
noticed an architecture smell.

## Assistants are not coding agents

Coding agents change code. Assistants understand Pane's state, answer questions,
manipulate project objects and route queries. In V0 assistants are **logical**
(`assistant(scope)` constructed from structured state + a routing agent), not
permanently running processes. See [ask-mode-and-assistants.md](05-ask-mode-and-assistants.md).
