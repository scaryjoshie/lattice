# 2. Worktrees and Git

## Worktrees are the primary unit of parallel implementation

This is probably Pane's strongest opinion. Each significant parallel piece of work gets
a worktree.

```
project
├── repo A
│   ├── main
│   ├── worktree: auth
│   ├── worktree: reconnect
│   └── worktree: graph-ui
└── repo B
    ├── main
    └── worktree: SDK changes
```

A worktree is not merely "a branch open in another folder." It is Pane's
**implementation container**, and it has an objective:

```
AUTH RECONNECT

Objective   Preserve logical sessions across transport reconnects.
Status      working
Tasks       5 / 8 complete
Problems    2 open
Agents      Claude, Codex
Git         +821 −194, parent advanced 3 commits
```

V0 uses **flat** worktrees. Recursive worktrees (`auth` → `oauth`, `sessions`) may make
sense eventually but introduce checkpointing, parent-child merge semantics and update
propagation. Add after observing how flat worktrees actually get used. The data model
keeps `parent_worktree_id` nullable so nesting is not foreclosed.

## Repository vs Worktree

Do not think of "repo" as a filesystem folder.

```
Repository {              Worktree {
  id                        id
  remote(s)                 repository_id
  git_common_dir            branch
}                           path
                            objective
                            parent_worktree_id?   // null in V0
                          }
```

A project has several repositories; each repository has several worktrees.

### Multiple copies of a repo

Two very different ways exist:

1. **Independent clones** (`~/code/foo`, `~/code/foo-copy`, `~/code/foo-again`). Each
   has its own object DB, config, refs. Legal, but organizationally gross for Pane.
2. **One repository, multiple Git worktrees.** Shared history/objects, separate
   files/index/branch.

Pane overwhelmingly prefers (2).

## Pane-managed filesystem layout

Once Pane manages agents, worktrees, tasks, problems, commits and merges, it makes
sense to also own where the checkouts live. Otherwise the UI says "Auth worktree" while
you have to remember whether that is `~/code/foo-auth` or `~/Desktop/foo-copy-3`, which
defeats the abstraction. Once you routinely spawn five or ten isolated agent
workspaces, Pane owning the directories goes from "opinionated" to "necessary for
sanity."

Centralize **Git working environments**, not Finder.

```
~/Pane/
  projects/
    my-app/
      backend/
        main/
        auth/
        reconnect/
      frontend/
        main/
        graph-ui/

~/.pane/                 (hidden)
  repos/
    <repo-id>.git        canonical backing repository
```

An agent is not told to `cd` into the right directory. Pane starts it directly in
`~/Pane/projects/my-app/backend/auth`. The visual object and the filesystem object
correspond exactly.

The UI offers `Open in Finder`, `Open in VS Code`, `Open terminal`, `Copy path`, but the
goal is that you stop caring about paths 95% of the time.

### Managed vs adopted

Do not force existing users to reorganize:

- **Managed repository**: Pane owns clone + worktree layout.
- **Adopted repository**: keep `/Users/josh/code/foo`; Pane registers it and manages
  additional worktrees around it.

Expect most users to drift toward managed mode because it is nicer. Avoid
"Congratulations, please move your entire development directory before continuing."

## Commits are the change units (no separate "semantic diff")

We were in danger of inventing a continually maintained "semantic diff" that is too
close to something Git already gives us. A commit is already the natural semantic
checkpoint. The missing part is that commit messages are often `fix stuff`.

V0 scope: **commits are the canonical change units, and Pane can explain them.**

A commit gets linked (via `object_relations`) to tasks addressed, problems addressed,
related decisions, agent(s), worktree. Pane can generate and display:

```
Commit 81bd2e  "Preserve session identity through reconnect"

Addresses   Task #18, Problem #7
Behavior    Session IDs now persist across transport replacement.
Files       session.ts, reconnect.ts
+281 −94
```

The Git commit remains ground truth. "Explain this more deeply" in Ask mode inspects the
diff.

**Commits are not typed.** No `BugFixCommit`, `FeatureCommit`, etc. Git stays free-form
and plug-and-play. Organizational semantics live *around* Git in relations and derived
explanations, not *inside* it.

### Checkpoint commits

Since agents do long-running work, Pane encourages relatively frequent coherent
commits:

- task finished → commit
- meaningful implementation checkpoint → commit
- before handing work to another agent → commit
- before a risky operation → checkpoint

This makes everything easier: history, explaining changes, restoring state, agent
replacement, merge reasoning, linking work to problems, finding when behavior changed.
Lean into Git harder rather than inventing another change-history system.

### What the worktree-level explanation looks like

Derived from commits + declared state, the worktree summary (the surviving part of the
"semantic diff" idea) can show:

```
Objective            Add reconnect support.
Meaningful changes   • Session identity survives transport reconnects
                     • connection_id is connection-local
                     • reconnect API added
External changes     • new Session.reconnect(token)
Open concerns        • restart persistence unresolved
Potential conflicts  • graph-ui branch also modifies Session creation
```

Click anything to see the raw Git evidence. Useful for human review, assistant
questions, cross-worktree awareness, merge agents, project summaries. Cheap models are
appropriate because the raw diff remains ground truth.

## Integration and merge are first class

Worktrees feed back into an integration branch.

```
main
├── auth
├── reconnect
└── graph-ui
```

Two conceptual motions:

- **parent → child**: update child with newer parent context
- **child → parent**: integrate completed work

Merge is a perfect place for an LLM integration agent. Give it objective, task history,
problems, decisions, worktree summary, raw diff, tests, parent changes, and let it
reconcile. This matches the philosophy of not forcing agents to synchronize constantly
while building; messy reconciliation moves to integration time.

## Git is plumbing, Pane supplies semantics

Git does not know that auth is a work unit with objective X, that Problem 17 caused this
worktree to exist, or that a 3-commit divergence probably does not semantically
conflict. Pane does, or can. Pane opinionates around Git.

## Git/worktree manager responsibilities (V0)

- detect repositories
- create / remove worktrees
- inspect status and diffs
- understand branches and the integration target
- auto-detect agent location from cwd / Git / worktree info
