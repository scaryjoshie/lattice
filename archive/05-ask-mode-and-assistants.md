# 5. Ask mode and assistants

This could become one of the defining interactions of the whole system.

The key: **"ask" is a universal operation on the project graph**, not "chat with the
orchestrator" as a special interface. Click literally anything (task, worktree, diff,
file, bug, edge, goal, merge, commit) and hit **Ask / Why?**

## Normal mode vs Ask mode

**Normal mode** is direct manipulation of the actual system:

```
drag tasks           create todos            connect dependencies
create worktrees     merge worktrees         assign agents
edit goals           open terminals          inspect diffs
resolve problems     edit objectives
```

Hit `/`, `A`, or hold a modifier to enter **Ask mode**. Now almost everything is
selectable, and the selection *is* the scope/reference. You never have to write "In the
auth worktree, on the reconnect todo, regarding the second dependency..." You point at
it.

| Select | Ask |
|--------|-----|
| a task | why? |
| task A → task B (an edge) | Why does B actually depend on A? |
| a worktree | what's left before we can merge this? |
| two sibling worktrees | are these going to collide when they merge? |
| part of a diff / commit | explain why this changed |
| a problem | deal with this |
| three tasks | parallelize these |
| a line of code | why the fuck is this here |

Ask mode also supports **imperative** requests, so it is really:

> natural-language operations over selected typed objects.

Not "open chatbot." The whole UI becomes conversational without the product becoming a
chat app. Chat is a transient modality layered over direct manipulation.

Example imperative flow:

```
select 🐛 flaky reconnect test  →  "deal with this"

Assistant:
  This appears isolated from the current feature.
  Proposed:  create child worktree fix/reconnect-flake
  Assign:    Codex
  Parent:    session-reconnect
  [Do it]
```

## First question: who or what actually knows?

The system should **not** immediately have a global LLM invent an explanation. It first
answers "who or what actually knows why this exists?" That is a **routing problem**.

Every query is an object:

```
Query {
  text: "why does this have to work this way?"
  subject?: Ref
  asker: Human | Agent
  scope: WorktreeId | ProjectId
  originalText: string        // never rewritten
}
```

The router does not rewrite the question. It chooses respondents. Example scoring for a
question about a task:

```
creator                              +100
current owner                         +80
agent that found the linked bug       +70
worktree lead                         +50
recently touched relevant files       +30
participated in linked discussion     +30
```

```
"why do we have this todo?"
            │
            ▼
      provenance lookup
            │
      ┌─────┴─────┐
      ▼           ▼
 Claude-17     historical
 (creator)     evidence
      │
      ▼
exact question delivered
```

The respondent receives the original question unchanged, plus structured context:

```
Joshua asks:  "fuck man, why is it this way"
Subject:      task_381 "Add generation counter"
Relevant:     bug_82, conversation_182, worktree/session-reconnect
Answer the question directly.
```

## Implicit subject from context

"Ask the orchestrator" is just the unscoped version. Type "fuck man why is it this way"
while looking at some code/worktree/task, and the resolver takes the subject from
current context:

```
you
 ▼
query resolver
 ├── Can project state answer?
 ├── Who created this?
 ├── Who owns it now?
 ├── Who discussed it?
 └── Who has relevant implementation context?
             ▼
          agent(s)
```

The orchestrator is a **concierge**: not "I know the entire codebase" but "I know where
knowledge lives."

## Three levels of answer

Try in order, and label which one you got.

### 1. Recorded truth
"Why does task X exist?" → task X has explicit provenance to bug Y. No model routing
needed.

### 2. Ask the responsible actor
"Why did you choose a generation counter instead of a timestamp?" → find the agent that
made the choice and ask it.

### 3. Reconstruct
The agent is gone. Give another agent the original task, conversation, diff at the
time, current code and commit history and ask it to reconstruct likely rationale.

The UI must clearly label these:

```
Reconstructed explanation
```

vs. "This explanation comes from the agent that implemented it." Otherwise six hours
later the project develops **fake institutional memory**. This distinction is critical.

## "Why does it HAVE to be this way?" asks for the constraint

Not history. An agent might answer:

```
It doesn't strictly have to be. We use a generation counter because:
1. messages can survive transport reconnection;
2. connection IDs therefore cannot uniquely identify delivery epochs;
3. duplicate packets need to be rejected;
4. monotonic generations make that check cheap.
We could instead use globally unique message IDs, but that moves
deduplication state into the session layer.
```

The UI can then attach that to the design object as a Decision with alternatives.

## Every explanation is promotable

Ask "why can't we just use the connection id?", get a good answer, hit **Save as
rationale**:

```
Decision    session generation counter
Rationale   Connection IDs change during reconnect while pending messages
            survive, so connection ID alone cannot establish delivery epoch.
```

Future agents do not ask again. Institutional memory builds from normal work; nobody
writes documentation first.

## Routing questions about code

Highlight:

```
if generation < session.generation { return; }
```

and type "why the fuck is this here". Resolver walks:

```
line → blame / semantic history
     → worktree that introduced it
     → task associated with commit
     → agent responsible
     → design conversation
```

Answer: "This guard was added in session-reconnect to prevent packets from a
pre-reconnect transport epoch being processed afterward."

Follow-up "is that actually necessary anymore?" is a **new analysis question**, so route
it to an active agent with current context rather than returning history.

## Multi-agent questions

No single owner ("Why does auth depend on protocol-v2?"). Fan out, **preserve each
response**, synthesize only in the presentation layer where sources are visible:

```
             question
        ┌───────┴────────┐
        ▼                ▼
   Auth agent       Protocol agent
        └──────┬─────────┘
               ▼
            answer

Auth agent:      We need stable session IDs exposed by protocol-v2.
Protocol agent:  The dependency exists because the old transport exposes
                 connection IDs rather than session IDs.
Synthesis:       Together these imply auth can't implement reconnect-safe
                 sessions until protocol-v2 exposes stable session identity.
```

Synthesis is allowed in the answer presentation, never hidden in the communication
path.

## Scoped knowledge resolution

At any level there is an implicit knowledge scope. Search starts locally and expands
outward only when necessary:

```
Project
  ↓
Auth worktree
  ↓
Session persistence worktree
  ↓
Bug-fix worktree
```

"Why are we doing this?" inside `fix/reconnect-race` first asks what in this worktree
explains it, then the parent, then siblings/relevant dependencies, then project-wide.
Scope is useful for knowledge resolution, not merely agent permissions. This is what
makes eventual recursive worktrees fit without changing the paradigm.

## Assistants

Coding agents are execution workers. Assistants are the UI/knowledge layer: what you
talk to when navigating, asking "why?", reorganizing work, or issuing higher-level
changes.

```
                    YOU
                     │
              UI / Ask mode
                     │
              Project Assistant
         ┌───────────┼────────────┐
         ▼           ▼            ▼
   Worktree A    Worktree B    Worktree C
   Assistant     Assistant     Assistant
       │             │             │
   coding agents  coding agents  coding agents
```

Assistants understand the graph. Coding agents understand the implementation they are
working on.

### The worktree assistant is not the worktree manager

No boss semantics. It is a continuously available librarian / coordinator / interface
for that scope. It knows: objective, task graph, current todos, bugs,
decisions/rationales, agents currently working, who owns which task, worktree summary,
parent/child worktrees, dependencies, recent important events.

It answers, without interrupting a coding agent at all:

- Why does this todo exist?
- What is Claude doing right now?
- Why haven't we merged this yet?
- What is blocking this branch?
- Which agent should handle this bug?

### Project assistant sees compressed children

```
Auth rewrite
  objective: ...            status: working
  2 agents                  1 blocker
  public interface changes: ...
  merge readiness: 72%

Graph UI
  ...
```

Recursively scoped knowledge, no giant omniscient orchestrator:

```
Project Assistant
├── Auth Assistant
│   ├── OAuth Assistant
│   └── Sessions Assistant
└── Graph UI Assistant
    └── Semantic Zoom Assistant
```

### Assistants are logical, not processes

They need not be permanently running LLM processes. `assistant(scope)` is instantiated
on demand over persistent scope state. In V0 this is literally: structured state +
routing agent + whatever model answers.

### Assistants may privately consult coding agents

```
You: Why did we use a generation counter here?

Worktree assistant checks: rationale DB, task provenance, conversation
summaries, commit metadata, semantic history.

Enough evidence → answers.
Not enough:
  Assistant: "I don't have a recorded rationale for that decision."
      ↓ privately asks
  Claude-182: "I used it because connection IDs don't survive reconnect..."
      ↓
  Assistant answers you, labeled as from the implementing agent.
```

From your perspective you are still talking to the assistant. The coding agent is an
information source. Much nicer than your question disappearing into a Claude terminal
and a reply arriving twenty seconds later.

### Routing belongs almost entirely to assistants

Coding agents do not do routing. See [communication.md](04-communication.md).

## Definitions

| Thing | Definition |
|-------|------------|
| Coding agent | Changes the world. |
| Assistant | Understands and explains the world. |
| Task | Describes work that should happen. |
| Worktree | Isolates implementation of an objective. |
| Assistant hierarchy | Mirrors worktree/project scope and makes knowledge navigable. |
| Ask mode | Lets you query or manipulate any object through the appropriate assistant. |

## End state

> Click anything → ask anything → the system finds whoever/whatever actually knows →
> original question delivered unchanged → answer comes back with provenance → useful
> explanations become durable project memory.
