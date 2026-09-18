# Decisions made for experiment 1

Resolutions of `../docs/10-open-questions.md`, numbered the same way, plus a few forced
by implementation. Reopen by adding a note.

| # | Decision | Why |
|---|---|---|
| 1 | An assistant in V0 is `ask(scope, refs, text)`: scope state + deterministic routing + a headless model call. Not a fourth agent role. | Matches D-19; nothing runs permanently. |
| 2 | Two agents in one worktree both steward it; Pane records the actor on every write. | Conflicts are visible in events; no lock semantics yet. |
| 3 | Human and agents may edit a worktree objective; the event records who. | Objective edits by the steward are common ("narrowed scope"). |
| 4 | Humans, agents and the system share the `actors` table. `created_by` is one column. | Uniform provenance. |
| 5 | Commands write both the edge (state) and the event (history). | Edges answer "what is true"; events answer "how". |
| 6 | Objective is a text field on `worktrees`; goals a text field on `projects`. No `Goal` object. | Core.md proposal. |
| 7 | Task status: `open`, `in_progress`, `blocked`, `done`, `cancelled`. | Minimum set with a terminal failure state. |
| 8 | Pane stores its own bus messages. Provider transcripts are referenced by path, not copied. | Runtime owns transcripts; Ask level 3 reads them on demand. |
| 9 | Ids are `<prefix>_<7 url-safe chars>`, globally unique: `proj_`, `repo_`, `wt_`, `human_`, `agent_`, `task_`, `prob_`, `q_`, `dec_`, `att_`, `commit_`, `conv_`, `msg_`, `ev_`. | Typed, short, greppable. |
| 10 | `Question` and `AttentionRequest` are separate types. A question to the human is an attention request of kind `decision` or `input` that `references` the question. | Different lifecycles and audiences. |
| 11 | Adopted repos keep their checkout as the main worktree; new worktrees go under `$PANE_PROJECTS/<project>/<repo>/<name>` (default `~/Pane/projects`). | Never move a user's directory; still one place for Pane-made checkouts. |
| 12 | The integration target of a worktree is its parent worktree's branch. The main worktree is the root. | One tree, no second field; nesting later needs nothing new. |
| 13 | Agent commits carry a `Pane-Agent: <agent id>` trailer. | Git keeps provenance even outside Pane. |
| 14 | Checkpoint commits are encouraged by the system prompt and the `commit` tool; not enforced. | Observe first. |
| 15 | Coding-agent tools are an MCP server (`pane mcp`) configured per spawned session via the CLI's flags. Identity comes from `PANE_AGENT_ID` and `PANE_TOKEN` in the process environment. | No global settings edits; no ancestry sniffing. |
| 16 | No open-loop extraction pass in V0. | Test the steward hypothesis first. |
| 17 | `suspend` ends the process and keeps the session id; `resume` starts it again with the host's resume flag. | Neither host supports a real pause. |
| 18 | Ask level 3 is a fresh headless `claude -p` call over the evidence. | No API key management; the user's Claude login is the provider auth. |
| 19 | Imperative Ask actions propose, then execute on confirm. | Low-risk ops are still project edits; one click is cheap. |
| 20 | Routing weights are the hardcoded table from `../docs/05`. | Deterministic first. |
| 21 | Default home is the project canvas; Needs You is a badge that opens a panel. | The canvas is the product. |
| 22 | Ask mode enters with `/`. Escape leaves. | One key. |
| 24 | No collective noun in the UI. Tabs are Tasks, Problems, Questions, Decisions. | Say what things are. |
| 25 | One local human actor is created on first run, named from `git config user.name`, else "You". | Provenance is never "the user". |
| I-1 | Task dependencies are `depends_on` edges in `relations`, not a separate table. | One graph mechanism, validated by type. |
| I-2 | Canvas layout is computed, not stored. No `layouts` table. | Nothing to persist until someone needs to drag. |
| I-3 | Raw SQL through `bun:sqlite` with a checked-in `schema.sql`, no ORM. | Reads are SQL by design; fewer moving parts. |
| I-4 | Messages are delivered to Claude Code through its inbox socket when the session's token is known, else typed into the PTY. Codex always through the PTY. | Universal fallback; the socket path avoids interrupting a typed draft. |
| I-5 | Agents belong to a project and are shown in the worktree they are `assigned_to`; `located_in` is observed from the process cwd and shown when it differs. | D-13. |
| I-6 | Every worktree has a group conversation the human and its agents are in. Agents may DM any agent in the project. | Open communication as asked; the wires are the edges. |
| I-7 | Before launching Claude Code in a worktree, Pane marks that folder trusted in `~/.claude.json`, the same record Claude writes when the user accepts its trust dialog. | The dialog swallowed the first delivered message and its default answer exits. Pane made the folder. |
| I-8 | Agent processes do not inherit `CLAUDE_CODE_*`, `CLAUDECODE` or `CLAUDE_PID` from the daemon's environment. | A daemon started from inside a Claude session would otherwise make every agent a child session with no registry, no transcript and no presence. |
| I-9 | A delivered bus message starts with `[pane <conversation id>]`; `reply` takes that id. | The agent needs the conversation, not the message, to answer. |
| I-10 | Before launching Codex in a worktree, Pane records the worktree and its repository root as trusted in `~/.codex/config.toml`, and pre-approves every `pane` tool through `-c mcp_servers.pane.tools.<name>.approval_mode="approve"` on the command line. | Codex otherwise stops at a trust dialog and then at an approval prompt on the first tool call. |
| I-11 | A resumed session that exits within eight seconds with a failure is treated as unresumable: the session key is cleared and the agent starts fresh under the same identity. | Agents are disposable; state is not. The alternative was an agent stuck offline with no explanation. |
