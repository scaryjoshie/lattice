# Pane, experiment 1

See `ARCHITECTURE.md` for the layout and `DECISIONS.md` for what was chosen where
`../../docs` left a question open.

## Run

```sh
bun install
bun run dev        # daemon on :7777 and the UI on :5173
```

Open http://localhost:5173. Add a project in the sidebar, right-click the canvas to add
a repository by path, right-click the main pane to add a worktree, right-click a pane to
add an agent. `/` enters Ask mode over the current selection.

Environment:

| Variable | Default | Meaning |
|---|---|---|
| `PANE_HOME` | `~/.pane` | Database and the agents' unix socket |
| `PANE_PROJECTS` | `~/Pane/projects` | Where Pane-made checkouts live |
| `PANE_PORT` | `7777` | Daemon port |
| `PANE_ASK_MODEL` | `sonnet` | Model for Ask mode answers and proposals |
| `PANE_SUMMARY_MODEL` | `haiku` | Model for commit explanations |
| `PANE_SUMMARIES` | `1` | `0` turns commit explanations off |

Agents run through the user's own `claude` and `codex` logins; the sidebar shows both.

## Check

```sh
bun run check      # tsc, biome, layer rules, every test
```

Tests cover the kernel (in memory), the git adapter (real temp repositories), the
runtime (a fake provider over a real PTY) and the daemon (its HTTP surface against a
real repository). Spawning a real Claude Code agent and having it use the tools was
verified by hand; it is not in the suite because it needs a login.
