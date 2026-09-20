# 8. V0 scope

## The hypothesis V0 tests

> Can one coding agent, given structured persistent tools, externalize its plan,
> problems and decisions well enough that the work remains understandable outside the
> chat?

If **yes**: the graph, Ask mode, human inbox, querying, agent replacement and eventual
multi-worktree orchestration all become very powerful.

If **no**: we have evidence that we need dedicated managerial / extraction processes.

Test the simple version first: coding agents steward their worktree; Pane persists it;
routing agents find things; cheap agents summarize things; humans get one explicit
"Needs You" queue.

## V0 in one line

> Pane persists the world; the active coding agent maintains the meaning of its own
> work.

## Build order

1. **Core.** IDs / refs / objects / event envelope / SQLite schema. Projects, repos,
   flat worktrees, agents, tasks, task dependencies, problems, questions, decisions,
   attention requests, events, object relations.
2. **Git / worktree manager.** Detect repositories, create/remove worktrees, inspect
   status/diffs, understand branches and integration target. Managed + adopted repos.
3. **Integrated agent runtime.** Evolve Modelbus into persistent Agent IDs + provider
   adapters + ensureOnline / send / interrupt / fork.
4. **React Flow project / worktree UI.** Minimal beautiful canvas, project sidebar,
   worktree cards, agent cards.
5. **Task / problem system.** List + graph views, raising / escalating / resolving,
   provenance. Coding-agent tools.
6. **Needs You.** Attention requests, blocking / non-blocking ordering.
7. **Ask mode.** Selection → typed refs → assistant query / tools → answer / action.
   Three levels of answer, labeled.
8. **Commit explanations + worktree summaries.** Cheap models explain commits, maintain
   concise worktree summaries, later extract open loops.
9. **Integration experience.** Merge readiness, parent divergence, LLM-assisted merges.
10. **Observe usage** before recursive worktrees, sophisticated routing, manager
    layers, etc.

## In V0

- Flat worktrees with objectives, Pane-managed layout, adopted repos supported
- Persistent logical agents, provider abstraction, trivial lifecycle, fork
- Three agent roles: coding (steward), routing, summarization
- Tasks (DAG), problems, questions, decisions, attention requests, events, relations
- Commits as untyped change units with Pane-generated explanations and links
- Normal mode + Ask mode
- Needs You
- SQL for reads, typed commands for writes, typed events for observation
- Pane account (local-first) + per-provider auth (Claude, Codex, GitHub, ...)

## Deliberately NOT committed yet

None of these are bad ideas. They are downstream of behavior we have not observed, and
unlike identity / events / problems / tasks / worktrees / agents, getting them wrong
later does not poison the foundation.

- recursive worktree UX (schema allows `parent_worktree_id`)
- complex manager-agent hierarchies
- automatic multi-level LLM routing
- custom Pane query language (PaneQL)
- graph database requirement (Memgraph)
- full autonomous task decomposition
- all provider-specific subagent visualization
- 3D interface
- continually maintained "semantic diff" as a separate artifact (superseded by commits +
  explanations)
- Bug / Risk / Idea as typed objects (add when semantics prove useful)
- teams / collaboration / remote agent control via Pane account

## Login and accounts

Two separate things:

- **Pane account**: sync project metadata, preferences, later teams/collaboration,
  cloud backup of the organizational graph, possibly remote agent control. Source code
  itself does not go to Pane's servers; Git has remotes.
- **Provider authentication**: `Claude ✓ connected`, `Codex ✓ connected`,
  `GitHub ✓ connected`, each initiating its own login flow via its adapter.

Local-first: Pane stays highly functional offline even with an account.
