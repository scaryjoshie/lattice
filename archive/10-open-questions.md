# 10. Open questions

Things the discussion touched but did not settle, plus tensions I noticed while
condensing. Resolve by moving items into [decisions.md](09-decisions.md).

## Tensions between sections

1. **Assistants vs "coding agent manages everything in V0."** Earlier we described
   worktree/project assistants as the knowledge layer. Later V0 says: coding agent
   stewards, routing agents route, summarization agents summarize. Reconciliation I
   assumed: in V0 an "assistant" is not a fourth role; it is `assistant(scope)` =
   scope state + routing agent + an answering model call. Confirm.
2. **Who stewards when two coding agents share a worktree** (Claude + Codex in Auth)?
   One primary steward? Both can mutate freely and Pane just records actor? Conflicts?
3. **Objective ownership.** Who may edit a worktree's objective: human only, or the
   steward agent too? It is the one field that defines scope.
4. **Human as actor.** Provenance uses `AgentId | HumanId`. Is the human an actor in
   the same table (so relations and events are uniform), or a separate type?

## Data model

5. **Relations vs events.** Is `discovered_by` a stored edge, an event, or both? Working
   assumption: commands write both (edge = current state, event = history). Confirm.
6. **Where does the worktree objective live?** Field on Worktree, or a Goal object that
   worktrees, tasks and projects can all point at? "Goals" appears under Project in the
   thesis but has no shape yet.
7. **Task states.** Minimum set: open / in_progress / blocked / done? Do we need
   deferred / cancelled?
8. **Conversations.** Does Pane store full transcripts in its DB, or reference provider
   session files (Claude Code JSONL etc.) and index them? Affects Ask mode level 3.
9. **Refs.** Format for stable typed IDs (`task_381`, `wt_auth`)? Global or
   per-project? Needed before anything else.
10. **Question vs AttentionRequest(kind=decision).** A Question raised by an agent to
    the human is an attention request. A Question between agents is not. Same object
    with a target, or two types?

## Worktrees / Git

11. **Adopted repo layout.** When adopting `~/code/foo`, where do additional worktrees
    go: siblings (`~/code/foo-auth`) or under `~/Pane/projects/...`?
12. **Integration target per repo.** Always `main`, or configurable per worktree
    (worktree off a feature branch)?
13. **Commit authorship.** Do agent commits carry the agent identity (co-author trailer,
    author name) so Git itself preserves provenance, or only Pane's relation table?
14. **Checkpoint commit policy.** Encouraged by prompt only, or enforced by the runtime
    (auto-commit on task completion / before handoff)?

## Agents / runtime

15. **What the coding-agent tools look like concretely.** MCP server exposed to Claude
    Code / Codex? CLI? Both? This decides how the steward pattern actually works.
16. **Extraction fallback in V0.** Do we ship the "cheap model detects open loops the
    agent forgot to persist" pass in V0, or wait for evidence the steward pattern
    misses things?
17. **Suspend semantics** per provider. Is suspend real (process kept, paused) or just
    offline with resume?

## Ask mode

18. **Which model answers** in V0 Ask mode when recorded truth is insufficient and no
    responsible agent is online: a fresh reconstruction call, or resume the
    responsible agent?
19. **Imperative Ask actions** ("deal with this", "parallelize these"): always propose +
    confirm, or allow direct execution for low-risk ops?
20. **Scoring weights** for respondent routing: hardcode the table from the design, or
    let a routing model decide with the table as guidance?

## UI

21. **Default home**: Needs You, or the project canvas with Needs You as a badge?
22. **Ask mode entry**: `/`, `A`, modifier-hold, or all three?
23. **Reference screenshot**: not in the repo yet. Drop it into `docs/assets/` so the
    aesthetic target is recorded.

## Product

24. **Name for the sub-items.** "Problems" is settled; do we call the family
    (Task/Problem/Question/Decision) anything collectively in the UI, or never expose
    a collective noun?
25. **Multi-user.** Even if V0 is single-user, does `HumanId` need to exist now so
    events are not all attributed to "the user"?
