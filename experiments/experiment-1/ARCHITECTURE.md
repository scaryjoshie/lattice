# Pane, experiment 1

The first implementation of the model in `../../docs`. Read `../../docs/core.md` first; this
file only says how that model is laid out in code and what was chosen where the docs left
a choice open (see `DECISIONS.md`).

## Packages

Bun workspace. Dependencies point strictly downward.

| Package | Layer | Contains | May import |
|---|---|---|---|
| `@pane/kernel` | kernel | Ids, model types, SQLite store, typed commands, queries, events | nothing in the workspace |
| `@pane/git` | adapter | Repositories, worktrees, status, diffs, log, commit, merge, via the `git` CLI | kernel model types |
| `@pane/runtime` | adapter + service | Agent processes in PTYs, provider adapters (Claude Code, Codex), delivery of messages into sessions, presence | kernel |
| `@pane/protocol` | contract | The wire types between server and UI: snapshot, operations, events, terminal frames | kernel model types |
| `@pane/server` | composition + services | The daemon: operations (kernel + adapters), HTTP and WebSocket API, the `pane` MCP tool server agents talk to, Ask mode, summaries | everything |
| `@pane/ui` | surface | Vite + React + React Flow. Holds no product state. | protocol, kernel model types |

`scripts/check-layers.ts` enforces the table.

## Kernel

One SQLite file (`$PANE_HOME/pane.db`, default `~/.pane`). `schema.sql` is applied on
open; `PRAGMA user_version` tracks it. The store is the only module that writes SQL.

- **Scopes**: `projects`, `repositories`, `worktrees`. The one tree. The main checkout of a
  repository is a worktree row with `is_main = 1`; feature worktrees have it as parent, so
  the integration target of a worktree is its parent's branch.
- **Actors**: `actors` (human, agent, system) plus `agents` for agent-only columns
  (provider, session key, lifecycle). `created_by` everywhere references `actors`.
- **Items**: `tasks`, `problems`, `questions`, `decisions`, `attention_requests`. Each has
  `scope_id` (owning, mutable) and `origin_scope_id` (immutable).
- **Evidence**: `commits`, `conversations`, `participants`, `messages`, `deliveries`.
- **Graph**: `relations (source_id, type, target_id, created_by, created_at)`. Task
  dependencies, agent assignment and location, provenance: all edges here, validated by
  type in `relations.ts`.
- **History**: `events`, append-only, one or more per command.

Commands are the only writes. Each is `(actor, params) -> result`, validated with zod,
run in one transaction, and emits typed events after commit. `kernel.run(name, actor,
params)` dispatches by name so the HTTP API and the MCP tools stay thin.

Queries are plain functions over the store. `projectSnapshot(projectId)` returns every
object in a project; the UI holds that and refreshes it when events arrive.

## Runtime

An agent is a row; a process is not. The runtime starts a provider's CLI (`claude`,
`codex`) inside a `Bun.Terminal` PTY in the agent's worktree, with `PANE_AGENT_ID`,
`PANE_TOKEN` and `PANE_SOCKET` in its environment, and the `pane` MCP server configured
through the CLI's own flags (no global settings are modified). The session id is chosen
by Pane (`claude --session-id`) or learned from the host (Codex thread id), stored on the
agent, and used for `--resume`.

Before a launch the provider records the folder as trusted where its host records it
(`~/.claude.json`, `~/.codex/config.toml`) and, for Codex, pre-approves the `pane` tools.
`ensureOnline(agent)` spawns or resumes; a resume that fails at once falls back to a fresh
session under the same agent identity. `send(agent, text)` writes into the session:
Claude Code through its inbox socket when the session handed over its token, otherwise
by typing into the PTY as a bracketed paste. `interrupt` sends Escape, `suspend` ends the
process and keeps the session, `fork` resumes with a new session id as a new agent.

Terminal output is fanned out to WebSocket subscribers; the UI renders it with xterm.js.

## Server

Composition root. Owns one kernel, one git adapter, one runtime, and the services:

- **Operations**: what surfaces call. Kernel commands pass straight through; operations
  that touch the outside world (`createWorktree`, `spawnAgent`, `mergeWorktree`) call the
  adapter first, then record the kernel fact.
- **Ask**: selection refs + text -> (1) recorded truth from provenance edges, (2) the
  responsible actor answers through the bus, (3) reconstruction by a headless model call.
  Every answer is labeled with its level.
- **Summaries**: commit explanations by a headless model call, stored as derived.

`pane mcp` is the stdio MCP server each agent gets. Its tools are the coding-agent tools
from `../../docs/03-agents-and-runtime.md` plus `send`, `who` and `context`.

## UI

Sidebar of projects; canvas of the selected project. Repositories are group boxes; the
main worktree is a pane on top with feature worktree panes in a row beneath it, joined by
edges. Agents are nodes inside their pane. Conversations between agents are edges;
clicking one opens the chat. Right-click a pane for `+ Agent`, `+ Worktree`. Enter a
repository or a worktree by clicking; the viewport animates to it and the detail panel
opens. `/` enters Ask mode. Needs You is a panel with a badge.

The UI store holds the snapshot and view state only. All writes are operations.
