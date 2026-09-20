# Core

> Status: DRAFT for discussion. This is the foundation the other docs assume.
> Once agreed, it outranks them.

## What Pane is, in one sentence

Pane is an operating environment for software work done by humans and agents in
parallel, where the *structure* of the work (what, why, who, where, what changed) is
persistent state that outlives any chat, agent or process.

## Value propositions we will not trade away

These are the tests for any feature or schema. If a change violates one, it is wrong
even if it is convenient.

| # | Value | What it means concretely |
|---|-------|--------------------------|
| V1 | **Nothing important dies in chat** | Observations, plans, decisions and asks become typed objects with provenance, not sentences in a transcript. |
| V2 | **Work is legible without reading transcripts** | A person can open Pane cold and understand what is happening, why, and what is waiting on them. Transcripts are evidence, not the interface. |
| V3 | **Everything can answer "why?"** | Every object carries provenance. "Why does this exist?" walks recorded edges before any model is asked. |
| V4 | **Agents are disposable; state is not** | Any agent can be killed, restarted, forked or replaced and the project loses nothing but in-flight context. |
| V5 | **Git is ground truth for code; Pane adds meaning** | Pane never invents a parallel change-history. Commits are the change units. Pane links and explains them. |
| V6 | **Direct manipulation first, language as an overlay** | Normal mode edits real objects. Ask mode is natural language over selected objects, never a chatbot beside the product. |
| V7 | **Intelligence routes, never rewrites** | Models may decide who should hear a message or answer a question. The original text is delivered unchanged. |
| V8 | **Derived knowledge is labeled derived** | Recorded truth, an actor's own explanation, and reconstruction are visibly different. No fake institutional memory. |
| V9 | **Humans are reached through one explicit queue** | Agents never interrupt. Anything that needs a person becomes an attention request. |
| V10 | **The model precedes every surface** | Canvas, lists, Ask mode, CLI are projections of one domain. No product state lives in a UI component. |

## The one tree and the graph

There is exactly **one containment hierarchy** in Pane, and it is the scope tree:

```
Project
└── Repository
    └── Worktree
        └── (Worktree)          nested worktrees, later
```

Everything else is a **graph**: objects with a single owning scope and arbitrary typed
edges between them. This is the single most important structural rule. Tasks are not
"under" problems. Agents are not "under" worktrees. Commits are not "under" tasks. They
are all nodes with edges.

Why one tree: the tree answers *where* (permissions, knowledge resolution, filesystem
layout, aggregation on the canvas). The graph answers *what, why, who* (which are
many-to-many by nature and break the moment you force them into a tree).

## Object families

Five families. Every object belongs to exactly one.

### 1. Scopes — *where*

`Project`, `Repository`, `Worktree`

- Form the tree. Each has a parent except Project.
- Each carries an **objective** (Project: goals; Worktree: objective). The objective is
  a field on the scope, not a separate object, in V0.
- Map to something real outside Pane: a directory tree, a Git history, a checkout.

### 2. Actors — *who*

`Human`, `Agent`

- Persistent identities that do things. Both live in the same actor ID space so
  `created_by`, events and relations are uniform.
- Actors are **not** in the scope tree. An agent is *located in* and *assigned to*
  scopes via edges. It belongs to the project.
- Agents have a backend and a lifecycle; humans have an account.

### 3. Items — *what and why*

`Task`, `Problem`, `Question`, `Decision`, `AttentionRequest`

- The organizational state. All are typed, all share the object contract below.
- Each has one owning scope (mutable, so items can be escalated) and a
  `discovered_in` / `created_in` scope (immutable).
- Tasks say what should happen. Problems say what was observed. Questions say what is
  unresolved. Decisions say why. AttentionRequests say what a human must do.
- Later candidates: `Bug`, `Risk`, `Idea`, `Goal`. Added only when a concrete use case
  demands their own semantics.

### 4. Evidence — *proof*

`Commit`, `Conversation`, `Message`

- Produced by actors, mostly immutable, owned by Git or by the provider runtime.
- Pane references them and derives explanations from them. It never treats a derived
  explanation as evidence.

### 5. History — *how we got here*

`Event`

- Append-only. Every command emits one. Actor, time, target, cause, payload.
- Current-state tables say what is true; events say how it became true.

## The object contract

Every object in families 1–4 has:

```
id            stable, typed, globally unique       task_381, wt_auth, agent_17
kind          the type name
scope_id      owning scope (scopes: parent_id instead)
created_by    actor id
created_at
title?        human-readable label
status?       type-specific state machine, if any
```

and participates in:

```
relations     (source, relation_type, target, created_by, created_at)
events        (actor, at, target, cause, payload)
```

Provenance is not a special field. It is the set of edges pointing at the object
(`derived_from`, `discovered_during`, `caused_by`, `created_because_of`) plus its
creation event.

## The kernel

The kernel is the smallest thing that is *Pane* and nothing else:

```
Refs + object contract
Scope tree
Actors
Items
Relations
Events
Commands            createTask, raiseProblem, recordDecision, assignAgent,
                    escalate, resolve, requestUser, createWorktree, merge, ...
Queries             SQL over the above
```

The kernel knows nothing about React, Claude Code, Codex, terminals, or how Git is
invoked. It is a library with a SQLite file.

Everything else is a **module over the kernel**:

```
                     ┌──────────────────────────────┐
   Surfaces          │ Canvas  Needs You  Ask  CLI  │   projections + commands
                     ├──────────────────────────────┤
   Services          │ Runtime  Assistant  Summarizer│   act on kernel, call adapters
                     ├──────────────────────────────┤
   Adapters          │ Git      Claude  Codex  ...   │   translate the outside world
                     ├──────────────────────────────┤
   Kernel            │ objects  relations  events    │   the only source of truth
                     └──────────────────────────────┘
```

- **Adapters** translate outside systems into kernel facts (a Git worktree exists; an
  agent process is online) and execute kernel intentions outside (create a worktree;
  send a message).
- **Services** are the ongoing processes: the agent runtime (evolved Modelbus), the
  assistant/query layer, background summarization.
- **Surfaces** render and accept commands. They hold no state of their own.

Dependency direction is strictly downward. A surface never talks to an adapter
directly.

## The operating-system reading

A useful way to hold the whole project in your head, since "operating environment" is
the thesis:

| OS concept | Pane |
|------------|------|
| Kernel | Domain objects, relations, events, commands |
| Filesystem | Git (repositories, worktrees, commits) |
| Processes | Agents (persistent identity over transient processes) |
| Scheduler / queues | Machine-work queue (tasks) and human-attention queue (Needs You) |
| IPC | Control plane routes, data plane delivers verbatim |
| Shell | Ask mode |
| Window manager | The canvas, with glance / peek / enter |
| Syslog | Events |

The metaphor is a thinking aid, not an architecture mandate.

## What the kernel deliberately does not contain

- Any UI layout or position (canvas positions are a surface concern, stored separately)
- Provider-specific lifecycle state
- Transcripts (referenced as evidence, stored by the runtime)
- A planner, router or summarizer (those are services)
- Typed commits (Git stays free-form)
- A second tree (no task trees, no problem trees, no agent trees)

## Open decisions this doc forces

1. Humans and agents share an actor ID space. (Proposed yes.)
2. Objective is a field on scopes, not an object. (Proposed yes for V0; `Goal` deferred.)
3. AttentionRequest is an Item family member, not its own family. (Proposed yes.)
4. Canvas position is stored outside the kernel. (Proposed yes; a `layouts` table owned
   by the surface.)
5. Repository sits between Project and Worktree in the tree, so items can be owned at
   repo scope. (Proposed yes, though most items will be owned at project or worktree.)
