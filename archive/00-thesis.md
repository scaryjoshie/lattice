# 0. Thesis

## What Pane is

Pane is **not** "a graph UI for terminals" and not "a project chatbot bolted onto a
terminal manager."

> Pane is a persistent, visual operating environment for parallel software work.

- **Git / worktrees** provide isolated execution environments.
- **Agents** provide disposable, restartable compute.
- **Tasks / problems / questions / decisions** provide durable organizational state.
- **Modelbus** (evolved) is the communication and runtime substrate.
- **The graph** is the primary way humans understand and manipulate all of it.

The defining property: **work survives chats, agents, terminals, and individual model
contexts.**

## The problem Pane solves

Today, coding agents produce huge streams of ephemeral conversation while the actual
structure of the work exists mostly in somebody's head. A coding agent says:

> There's probably a race here, but it's outside what I'm doing.

and that observation is gone unless someone remembers it.

Pane turns that implicit structure into persistent, queryable, manipulable state.

| Question | Answered by |
|----------|-------------|
| Where is isolated work happening? | Worktrees |
| What needs to happen? | Tasks |
| What remains unresolved? | Problems, questions |
| Why are things the way they are? | Decisions |
| Who is doing work? | Agents |
| What actually changed? | Git (commits) |
| How did the system get here? | Events |
| What is waiting on me? | Needs You (attention requests) |

Ask mode makes the whole thing interrogable. The graph makes it understandable without
turning it back into another linear feed.

## What Pane fundamentally organizes

The central mistake would be organizing around agents. Agents matter, but they are
workers inside a larger system. The durable center is the **project**:

```
PROJECT
├── goals
├── tasks
├── problems / questions / decisions
├── repositories
├── worktrees
├── agents
├── conversations
├── git history / diffs
└── event history
```

A project can span several repositories:

```
Pane Project
├── backend repo
├── frontend repo
└── SDK repo
```

So **Project ≠ Repository**. Pane owns the project abstraction. Git owns repositories,
branches, commits and worktrees underneath it.

## Nothing important should die in chat

This is probably the central product insight. Today:

> "There's probably a race here." → lost

With Pane:

```
⚠ Problem
Reconnect cleanup may race with queued delivery.

Discovered by      agent_18
Discovered while   working on Reconnect Support
Source             conversation/message 821
Scope              Auth
Status             open
```

The transcript remains evidence. The problem becomes state. Same for:

- "We need to decide whether session IDs survive reconnect." → Question / Decision
- "We should clean this up later." → Task / Idea
- "Let me know which one you prefer." → Attention request (see [needs-you.md](06-needs-you.md))

Agents get explicit tools (`raise_problem`, `create_task`, `raise_question`,
`record_decision`, `request_user`) and, later, cheap models can detect open loops the
coding agent failed to persist. Extraction must always preserve provenance.

## The architectural shape

Data first. The canvas is a projection of state, not state itself. The task list is
another projection. Ask mode is another interface into the same domain. A CLI someday is
another interface.

```
           CORE DOMAIN
               │
     ┌─────────┼───────────┐
     │         │           │
    UI      Assistant    Runtime
     │         │           │
     └─────────┼───────────┘
               │
              DB
```

What we must avoid: product state accidentally living inside React components
(`node.data.todo`, `node.data.agentThing`, `node.data.problemMetadata`).

The discipline: **build the semantic substrate before UI-specific state, but only model
concepts for which we already have concrete use cases.** Design IDs, events, refs,
scopes, tasks, problems, worktrees and agents properly before building a big React Flow
frontend. Do not design a universal ontology.

## The simplified product, after lean-on-Git

| Concern | Provided by |
|---------|-------------|
| Files / code | Git |
| Change units | Commits |
| Parallel isolation | Worktrees |
| Intended work | Tasks |
| Observed issues | Problems |
| Actors | Agents |
| Why / history | Relations + events |
| Interaction | Normal mode + Ask mode |

Pane leans aggressively on Git for what Git is already excellent at, and adds the
organizational semantics Git fundamentally does not represent. Git does not know that
"auth is a work unit whose objective is X", that "Problem 17 caused this worktree to
exist", or that "this branch is 3 commits behind but those commits probably don't
semantically conflict." Pane does. Pane **opinionates around Git** rather than merely
exposing it.
