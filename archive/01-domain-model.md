# 1. Domain model

The "language" Pane really needs is a stable domain vocabulary, not a custom syntax.
The UI, assistants, event system, provider runtime and CLI should all speak it. If it
later maps naturally onto a custom query language, fine, but we do not decide that
syntactic surface before understanding usage.

## Nouns

| Noun | Meaning |
|------|---------|
| **Project** | Pane's top-level container. Can span several repositories. |
| **Repository** | A Git history / remote / codebase. Not a folder. |
| **Worktree** | One materialized filesystem view of a repository at a branch, with an objective. Pane's implementation container. |
| **Agent** | A persistent logical actor (Agent 17), not a process. |
| **Task** | Work we intend to perform. |
| **Problem** | Something discovered. |
| **Question** | Something unresolved that needs an answer. |
| **Decision** | A recorded choice with rationale and alternatives. |
| **AttentionRequest** | Something waiting on the human. See [needs-you.md](06-needs-you.md). |
| **Conversation / Message** | Transcript evidence. |
| **Commit** | The canonical change unit (Git-owned, untyped). |
| **Event** | Something that happened, with actor, time, target, cause. |
| **Reference (Ref)** | A stable typed pointer to any of the above. |

Later candidates, added when their semantics prove useful: **Bug**, **Risk**, **Idea**.

These are proper types sharing common identity/provenance machinery. They are **not**
one untyped generic Item table.

## Relationships

Stable relationship vocabulary:

```
assigned_to        discovered_by      discovered_in      owned_by
blocks             depends_on         caused_by          resolved_by
references         located_in         addresses          investigates
mitigates          resolves           discovered_during  authored
participates_in    contributes_to     occurred_in
```

Not every relation must exist in V0. The conceptual model is that these are
**first-class edges**, many-to-many, stored explicitly:

```sql
object_relations (
    source_id,
    relation_type,
    target_id,
    created_at,
    created_by
)
```

with relation types validated by the domain layer.

### Task ↔ Problem is many-to-many, never parent/child

A problem can create many tasks; a task can address several problems; a task can
discover a new problem:

```
Problem A                     Problem A ──┐
 ├── Task 1                               ├── Task 7
 ├── Task 2                   Problem B ──┘
 └── Task 3
                              Task 7 ── discovered ──▶ Problem C

Task ── addresses / investigates / mitigates / resolves ──▶ Problem
Problem ── blocks ──▶ Task
Problem ── discovered_during ──▶ Task
Problem ── caused_by ──▶ Decision | Commit | ...
```

Rendered:

```
Problem #17  "Reconnect can duplicate delivery"

Addressed by      Task #41 Reproduce race
                  Task #48 Fix queue epoch handling
                  Task #52 Add regression coverage
Resolved by       Commit 81bd2e
Discovered during Task #31
Discovered by     Agent 12
```

### Agent relationships live on edges, not in the agent row

```
Agent 17
  ├── assigned_to     → Task 81
  ├── located_in      → Worktree Auth
  ├── discovered      → Problem 21
  ├── authored        → Decision 12
  └── participates_in → Conversation 9
```

## Operations

```
create   assign   move   raise   resolve   defer   merge
spawn    start    stop   fork    link
```

Mutations always go through typed domain commands, never raw SQL from an agent:

```
agent proposes mutation
       ↓
typed command layer   (createProblem, resolveProblem, assignTask,
       ↓               createWorktree, mergeWorktree, recordDecision, ...)
validate
       ↓
persist
       ↓
emit event
```

Commands enforce invariants and emit events. The LLM never directly mutates the DB.

## Query / mutate / observe split

| Mode | Mechanism |
|------|-----------|
| READ | SQL against the project DB |
| WRITE | Typed domain commands |
| OBSERVE | Typed events |

An assistant can turn "Which unresolved problems were discovered in already-merged
worktrees?" into SQL. It cannot run `UPDATE`.

## Provenance is universal

Every meaningful object carries provenance so "why does this exist?" can be answered by
walking backward. Rough task shape:

```
Task {
  id
  title
  status

  createdBy: AgentId | HumanId
  createdAt

  worktreeId
  parentTask?
  dependencies[]           // via TaskDependency

  derivedFrom: [ BugId | ConversationId | DiffId | HumanInstructionId | ProblemId ]

  owner?
}
```

A resolver can walk:

```
todo
 ↓ created because of
bug
 ↓ discovered by
integration test
 ↓ caused by
behavior introduced in worktree X
```

and answer "This task was created after the reconnect integration test showed queued
messages could be applied twice. Claude in session-reconnect created it while
investigating test #182." with no LLM invention at all.

## Tasks are a DAG, not a checklist

```
Design protocol                  ✓ Design protocol
      │                          ✓ Implement server
      ▼                          ● Client support
Implement server ────┐           ○ Tests
      │              │           ○ Integration
      ▼              ▼
Client support     Tests
      │              │
      └──────┬───────┘
             ▼
        Integration
```

Both are views over the same objects: `Task` + `TaskDependency`. Agents can create,
change, complete, block and split tasks. Humans can directly manipulate them in normal
mode.

## Problems are not tasks

A **problem** describes something discovered. A **task** describes work we intend to do.

```
Problem  "Reconnect occasionally duplicates queued messages."
   ├── Task: reproduce issue
   ├── Task: fix queue semantics
   └── Task: add regression test
```

This enables queries todos cannot answer: What problems did we find while building
auth? Who discovered this? Who solved it? Which problem created this worktree? Which
unresolved problems have no owner? Which problems recur across features?

### Problems can move between scopes

Two distinct facts that must not be conflated:

```
discovered_in   = oauth-callback        (observed, immutable)
owned_by_scope  = auth / project        (organizational, mutable)
```

```
Problem: Generic session cache has eviction race.
Discovered in:        oauth-callback
Owned by:             project/auth
Blocks oauth worktree: no
```

Natural flow after discovery:

```
discover locally
   ├── solve locally
   ├── escalate upward        ← changes durable scope/ownership, not a prose message
   ├── defer
   └── create separate worktree
```

## Decisions carry rationale and alternatives

```
Decision      Use reconnect generation counter
Why           Prevents duplicate delivery across reconnect epochs.
Alternatives  • global message IDs
              • idempotent consumer state
[Ask about this]
```

Any good explanation from Ask mode should be promotable to a Decision ("Save as
rationale") so future agents do not need to ask again. This is how institutional memory
accumulates from normal work without anyone writing documentation first.

## Sources of truth have authority levels

| Level | Source | Examples |
|-------|--------|----------|
| 1 | Pane directly knows | Git state, worktrees, tasks, problems, assignments, events, conversations, process/lifecycle state |
| 2 | Agents explicitly declare | current objective, blocker, decision, problem, task completion |
| 3 | Cheap semantic processes infer | what changed conceptually, possible conflicts, API changes, likely unresolved issues (must carry provenance + inference/confidence marker) |
| 4 | Raw transcripts | fallback evidence |

We do not continuously shove every transcript into one giant assistant context.

## Events exist from day one

Not full event sourcing. Just: **"why?" depends on history.**

```
14:01 task.created
14:03 worktree.created
14:04 agent.assigned
14:28 problem.discovered
14:31 problem.escalated
14:44 decision.recorded
15:07 worktree.merge_ready
15:19 worktree.merged
15:21 problem.resolved
```

Current-state tables answer "what is true now?" Events answer "how did we get here?"
Pane needs both.

Event envelope contains at least: actor, timestamp, target/reference,
cause/correlation, typed payload. Agent lifecycle (`agent.online`, `agent.offline`,
`agent.resumed`) is events, not a domain concept (we explicitly dropped `AgentRun`).

## Persistence

Relational core (SQLite locally) with **explicit graph semantics layered on top**.

```
projects            agents               conversations
repositories        tasks                messages
worktrees           task_dependencies
                    problems             events
                    questions            object_relations
                    decisions
                    attention_requests
```

plus typed tables as concepts mature. Practically every meaningful thing gets a stable
ID.

**Graph database: not initially.** Our graph is highly structured (Project → Repo →
Worktree, Task deps, Problem provenance, Agent assignment); SQLite/Postgres handle it.
If arbitrary multi-hop traversal ever dominates, project the same object/relation model
into Memgraph. The model matters more than the backing store.

**Nesting is not forbidden by the schema.** `parent_worktree_id` is nullable and absent
from V0 UI semantics, so recursive worktrees stay possible later.
