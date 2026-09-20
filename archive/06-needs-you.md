# 6. Needs You (the human attention queue)

"What you need me to do" is first-class and extremely prominent, possibly the default
home screen.

```
NEEDS YOU                                                    4

Auth reconnect
  ? Decide whether sessions survive server restart         [Open]

Graph UI
  ! Agent wants approval to delete old layout engine       [Review]

SDK
  ↥ Worktree is ready to merge                             [Review diff]

Protocol
  ? Two possible API designs; human preference requested   [Choose]
```

## Not generic todos

Attention requests are **not** tasks assigned to the human. They have different
semantics.

```
AttentionRequest {
  id
  projectId
  scopeId

  requestedBy
  createdAt

  kind: "decision" | "approval" | "review" | "input" | "manual_action" | "unblock"

  question
  contextRefs[]

  blocking: boolean

  status: "open" | "resolved" | "dismissed"
  resolution?
}
```

Agents raise them explicitly:

```
request_user({
  kind: "decision",
  question: "Should sessions survive server restarts?",
  blocking: true,
  refs: [...]
})
```

Pane surfaces it immediately. This is much better than detecting that Claude ended a
message with "Let me know which one you prefer" and hoping you notice.

## Smart ordering

```
BLOCKING 2
  Needs decision     Auth reconnect  → 3 agents blocked
  Ready for review   Protocol v2     → merge ready

NON-BLOCKING 3
  Naming preference
  Potential architectural cleanup
  Review when convenient
```

## Relationship to the rest

- Agents should not interrupt the human. They accumulate attention requests.
- A resolved `decision` request naturally produces a **Decision** object with rationale.
- A resolved `review` on a merge-ready worktree feeds the integration flow.
- This is the human-side counterpart of agent routing: two queues, machine-work and
  human-attention (see [communication.md](04-communication.md)).
