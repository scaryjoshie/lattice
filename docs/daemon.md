# The daemon

Reviewed and being built, 24 September 2026. How the daemon is structured, what it
stores, how the app reaches it, and the order it is built in; steps 1 to 4 of the order
are done. Where [runtime.md](runtime.md) and
[organization.md](organization.md) already decided something, this says how; where this
adds a decision, it says so.

## What it owns

The document and its history, the projects and their worktrees, the preferences, and
later the terminals and the agent service. Nothing that only matters while somebody is
looking. The test is unchanged: would this still be true with no window open.

## Transport

1. Two listeners, one protocol. A Unix socket at `~/.lattice/daemon.sock` for tools and
   the command line, and a WebSocket on a localhost port for the app, since a webview
   cannot open a Unix socket. *New decision:* the WebSocket, instead of the shell's Rust
   proxying every message. Rust then does nothing but start the daemon and open the
   window, and the app in a browser during development reaches the daemon the same way
   the app in the shell does.
2. The port is chosen by the daemon at start and written with a random token to
   `~/.lattice/session.json`, owner-only. A connection that does not present the token is
   closed. So only the owner can connect, which is the same guarantee the socket gives.
3. The shell reads `session.json` and hands the port and token to the webview as it opens.
   In development without the shell, the app's dev server serves the same two values from
   the same file. The app never reads the file itself.
4. Messages are JSON-RPC 2.0, one message per line on the socket and one per frame on
   the WebSocket. A request has an `id`, a `method` and `params`; its reply has the same
   `id` and a `result` or an `error`; what the daemon says on its own is a notification,
   a `method` and `params` with no `id`. Not our own shape: the one VS Code, the Language
   Server Protocol and Chrome's DevTools use, so there is nothing to design and every
   client library already speaks it.

## Protocol

`packages/protocol`, shared, the method names and their parameter and result types, and
the settings' definitions (`preferences.ts`): each setting's default and which stored
values it takes, since both processes read a preference the same way. Nothing else.

```
requests, client → daemon
  hello                                      → { version, home }
  run      { command, mark }                 → { ok, dc, dr, id? }   a document command; mark comes back on undo
  undo     { mark } / redo { mark }          → { ok, mark? }
  prefer   { patch }                         → { preferences }
  addRepo  { path }                          → { repo }             later: git
  start    { host, occupant } / stop { host } → { ok }               later: agents
  attach   { host, cols, rows }              → { ok, screen }        a terminal, at a window's grid
  input    { host, data } / resize { host, cols, rows } / detach { host } → { ok }

notifications, daemon → every client
  grid         { grid, dc, dr }              after any change
  facts        { facts }
  preferences  { preferences }
  output       { host, data }                base64, only to the windows attached
  exited       { host, code }                only to the windows attached
```

5. `propose` never crosses the wire. The model is pure and shared, so the app judges a
   preview locally and instantly, and the daemon judges the same command again when it
   is run. Two judgements of one pure function on one grid agree by construction; when
   they do not, the grid changed underneath, and the daemon's answer is the true one.
6. The app applies nothing itself. It sends `run` and the grid comes back. On a local
   socket that is a round trip of well under a frame, so nothing is optimistic and
   nothing can diverge. Two windows show one grid because there is one.

## Layout

```
packages/daemon/src/
  core/        paths, secrets, store (SQLite), migrations, events, preferences, log
  document/    the grid: load, run a command through @lattice/model, save; history
  git/         reading repos and worktrees, adding a repo                 (later)
  terminals/   PTYs, the headless mirror                                 (later)
  agents/      hosting, observation, the agent service                   (later)
  providers/   one folder per provider: the adapter halves               (later)
  server/      the socket, the WebSocket, the session file, request handling
  main.ts      start: home, store, document, listeners, session file; stop on signal
```

7. Every folder is code, and none of it is yours. `git/` is what runs `git worktree list`;
   which repos you added is rows in the database. `providers/claude` is how Claude Code is
   launched and found; which agent is running where is a fact in the database. This is
   how VS Code ships its built-in language support in its own tree while your workspaces
   live in your settings. Nothing about your projects, agents or preferences is in the
   source; the source holds only how to read and drive them.
8. Layers in that order, checked by folder as the app is: `core` imports nothing else in
   the daemon; `document` imports `core`; `git`, `terminals` and `agents` import `core`
   and `document`; `providers/<name>` imports its own folder, the agents' provider
   contract and `core`'s paths and secrets; `server` imports anything.

## Persistence

9. The document is stored as one JSON snapshot in a `document` table, one row, rewritten
   after every command. The grid is small and a value; normalising it into tracks, tiles
   and scopes buys nothing until something queries them, and it is one migration away
   when something does. *This replaces the tables listed in [runtime.md](runtime.md);
   they were the shape of the data, not a commitment to columns.*
10. `events` is normalised and append-only: sequence, time, kind, payload. Every command
   run and every fact observed. The audit trail, and the way undo is rebuilt across a
   restart if that is ever wanted.
11. `preferences` is one JSON row. `repos` and `projects` are normalised, since they are
    listed and joined.
12. `bun:sqlite`, WAL, foreign keys, a migrations folder run at open. The store module is
    the only code that speaks SQL, as in modelbus.

## History

13. Undo moves to the daemon with the document: a stack of snapshots and marks in memory,
    exactly as the app's store holds it today, so the app's `undo` becomes a request and
    the mark still comes back. Not persisted; see 10 for how it could be.

## Lifecycle

14. The shell starts the daemon as a sidecar and stops it on quit, prompting first if
    agents are running. In development the daemon is started by hand or by the shell's
    dev command. The daemon also exits on its own when its parent goes away, so a crashed
    shell leaves nothing behind.
15. At start: make the home, open the store and run migrations, load the document or seed
    it if there is none, listen on both transports, write `session.json`. At stop: remove
    `session.json` and the socket file.

## What the app changes to

16. `store/store.ts` becomes a client: it holds the latest grid the daemon sent, `propose`
    stays local, `run`, `undo` and `redo` send and await. The session, the scene, the
    painter and the view do not change. The mock leaves the app for the daemon's seed.
17. While disconnected the app shows the last grid it had and refuses commands, and says
    so in the key panel. Reconnecting replaces the grid.

## Where this is standard

Judged against what exists, not against this document. A local daemon owning state with a
thin GUI client: Docker Desktop, tmux, VS Code's extension host, modelbus. The protocol:
JSON-RPC 2.0, as VS Code, the Language Server Protocol and Chrome DevTools use it. A
session file with a port and a token that the client reads: Chrome's `DevToolsActivePort`,
VS Code's CLI token file, Docker's contexts. A localhost WebSocket admitted by that token:
Chrome DevTools and every local dev server. SQLite as a single-file store with WAL and
migrations: VS Code's state database, Chrome, modelbus. The document as one JSON snapshot:
Excalidraw, tldraw, Figma's file format. An append-only events table: event sourcing.
Undo as in-memory snapshots: every editor; undo surviving a restart is the unusual thing,
and is left out.

## Order

Each step leaves the app working and the harness green.

1. Done. `packages/protocol`, and the daemon's `core/store` with `document`, `events` and
   `preferences` tables.
2. Done. The daemon loads or seeds the document, runs commands, saves, answers on both
   transports, writes `session.json`. Tested from Bun against a scratch home.
3. Done. The app is a client, with the dev-server route for the session file. The grid
   survives a reload, and two windows show one grid.
4. Done. The shell starts the daemon as a child, waits for its session, hands it to the
   webview as `window.__lattice` before the first script runs, and stops it on exit. In
   development the child is Bun running the daemon's source; the sidecar binary takes
   its place when there is a build to ship.
5. Preferences: theme first, since it exists, then the default worktree location.
6. Projects: add a repo, read its worktrees, place them as scopes. The seed goes.
7. Terminals. Begun: a terminal host runs the login shell in the daemon, started on the
   first attach and stopped when the host leaves the grid, mirrored by a headless xterm so
   an attach is handed the screen as it is at the window's grid (experiment 2's `pty.ts`).
   Next, xterm in the opened panel; then agents started in their hosts' terminals.
