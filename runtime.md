# Runtime

The daemon, what it persists, and the agent service. Decided 24 September 2026. Nothing
here is built; experiment-5 has no daemon and the grid lives in the webview.

## Two processes

```
app (Tauri window, webview)       daemon (Bun, separate process, child of the app)
──────────────────────────        ─────────────────────────────────────────────────
session, camera, scene            grid: the document, and its history
react(): inputs → commands        run(): applies document commands, persists
paint, overlays, xterm view       terminals: PTYs, scrollback, size
                                  agent service: identity, hosting, comms, observation
      ──── document and runtime commands ────▶
      ◀─── grid state, terminal output, agent facts ────
```

1. The client never mutates the document. It sends commands and receives the grid.
2. The daemon is a child of the app. It starts when the app starts and stops when the app
   quits, with a prompt if agents are running, as Terminal does. It is not a launch agent
   and does not survive quitting; that is the expectation every terminal app sets.
3. Closing the window does not quit the app, so terminals and agents survive the canvas
   being closed and reopened. That is the property that gets used. Tauri quits when its
   last window closes unless the exit request is prevented, so this has to be built, not
   assumed.
4. The app and the daemon talk over a Unix socket, not in-process calls. Nothing else
   changes if the daemon is one day started differently.
5. Rust in the Tauri shell does the window, tray and lifecycle. The daemon is a compiled
   Bun binary shipped as a sidecar. The model stays TypeScript, the same `model.ts`, and
   is not ported to Rust.

## Persistence

State lives under `~/.lattice/`: database, socket, log, secrets. Owner-only, as
`~/.modelbus/` is.

| Table | Holds |
|---|---|
| `tracks`, `tiles`, `scopes` | The grid. Positions are ids, so this is a direct dump |
| `terminals` | id, cwd, status, created. The PTY is not persisted; its scrollback is, from the serialised headless mirror |
| `agents` | identity, provider, provider session id, hosted-by terminal or null, created |
| `projects`, `repos` | See [projects.md](projects.md) |
| `events` | Append-only: every document command and every runtime fact, in order. The audit trail. Undo is in-memory snapshots ([architecture.md](architecture.md) 11); if it must survive a restart, it is rebuilt by replaying this |

6. What is persisted is exactly the daemon column of the ownership table in
   [model.md](model.md). Nothing the client holds is written anywhere.
7. The tmux model, plus a database. tmux persists nothing: its server holds PTYs in memory
   and a reboot loses everything; tmux-resurrect restores layout, working directories and
   optionally pane contents, and cannot restore a conversation. Here the daemon holds the
   PTYs for the life of the app,
   and disk holds enough to restore the grid, re-spawn each terminal in its directory with
   its scrollback, and offer to resume each agent from its session id. An agent session is
   resumable in a way a shell command is not, which is why this is more than tmux.

## The agent service

8. Agents are managed beside the grid, not under it. The grid never calls the runtime; the
   runtime never knows where a tile is. A tile references an agent by id; the runtime
   records that agent A messaged agent B; the scene reads that and draws the link. This is
   the layering at the end of [model.md](model.md).
9. Runtime commands: start a provider in terminal T, send, interrupt, resume agent A in
   terminal T. None is undoable, because a process cannot be undone.
10. Runtime facts: agent started, exited, moved host, messaged. Facts, never positions.
11. What runs in a terminal is observed from the PTY's foreground process, never declared.
    Ctrl-C out of Claude Code makes the next observation say shell, and the tile is a
    terminal again with no handler having run. The agent is offline, not gone: its session
    id is kept, and recovery is one runtime command that runs the provider's resume in a
    shell. Claude's transcript cleanup, thirty days by default, bounds how long that
    works and is configurable in Claude's settings.
12. Today's mock stores `links` and `kind` on the grid. Both move out when this exists.

## What is lifted from modelbus

modelbus (`~/dev/modelbus`) is an agent identity and messaging daemon with the same
shape. Taken as-is: the daemon with an owner-only socket; one store module over SQLite with
migrations and WAL; the layer checker; the provider adapters, which know how to find a
Claude Code session id from a process, push text into a running Claude or Codex, and watch
a transcript for receipt. Left behind: the TUI, the web endpoint, and the registration and
discovery machinery for foreign agents.

13. Lattice manages only agents it started in its own terminals. It knows the shell pid,
    the cwd and the moment of launch, so discovery is walking one process tree. Nothing
    outside its roster is touched.
14. Comms between Lattice agents can be an MCP tool the daemon exposes, as modelbus does.
    Whether Lattice depends on modelbus over its socket or absorbs the parts is open;
    absorbing is the current lean, for the reason in 13.
