# 4. Communication

## Worktrees are isolation boundaries, not communication communities

We use worktrees partly to *avoid* constant synchronization. Therefore agents in
separate worktrees should **not** be chatting constantly.

**Inside a worktree** (`Claude ↔ Codex ↔ Reviewer`) communication can be relatively
free.

**Across worktrees**, the normal interface is semantic state, not implementation
chatter:

```
objective
status
public / API changes
problems
dependencies
worktree summary (derived from commits)
merge readiness
```

Direct cross-worktree conversation is permitted but exceptional: "I need the answer to
one concrete interface question." Open a direct channel, answer it, close/resolve it.
This keeps worktrees independently coherent and moves messy reconciliation to
integration time.

Agents may also communicate across repositories within a project; the same rule applies.
The organizing principle is scope, not repo: knowledge and communication resolve
locally first and expand outward (see [ask-mode-and-assistants.md](05-ask-mode-and-assistants.md)).

## Control plane vs data plane

> Intelligence may choose **who** talks. It must not rewrite **what** they say.

Discovery/routing can be intelligent:

```
"I need whoever owns reconnect semantics"
               │
               ▼
        routing / directory
               │
               ▼
            Agent 42

Agent 17 ═══════════════ Agent 42      original message travels directly
```

Never:

```
A → manager rewrites → manager rewrites → B
```

Managers/assistants can observe, index and summarize outcomes without sitting in the
semantic data path.

## Knowledge retrieval, not agent-to-agent chat

Most cross-scope needs are knowledge retrieval. Coding agents should not spend tokens on
"hmm, who should I ask?" unless explicitly coordinating implementation.

```
Coding agent: "Does the auth worktree guarantee stable session IDs?"
      ↓ query
Worktree assistant (scope: reconnect)
      ↓
parent / project knowledge layer
      ↓
Auth assistant
      ↓ answer / relevant source
Coding agent
```

The assistant may already know: "Yes. Decision D-381: session IDs remain stable across
transport reconnects." No interruption occurs. Only genuinely unresolved information
becomes:

```
"Nobody has established this yet."
→ open Question
→ possibly connect appropriate agents
```

This dramatically reduces communication load.

## Two queues

```
machine-work queue      tasks / problems           → agents / worktrees
human-attention queue   decisions / approvals /     → you
                        reviews / input
```

Agents should not interrupt the human; they accumulate explicit attention requests
(see [needs-you.md](06-needs-you.md)). "Needs You" is the human equivalent of agent
routing.
