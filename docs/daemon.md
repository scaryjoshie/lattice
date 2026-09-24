# The daemon

A proposal for review, 24 September 2026. How the daemon is structured, what it stores,
how the app reaches it, and the order it is built in. Where [runtime.md](runtime.md) and
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
4. Messages are JSON, one per line on the socket and one per frame on the WebSocket. A
   request carries an `id`; its reply carries the same `id`. What the daemon says on its
   own, a new grid, new facts, new preferences, has no `id`.

## Protocol

`packages/protocol`, shared, types and a codec and nothing else.

```
client → daemon
  { id, kind: "hello" }
  { id, kind: "run", command, mark }          a document command; mark comes back on undo
  { id, kind: "undo" | "redo", mark }
  { id, kind: "prefer", patch }                a change to preferences
  { id, kind: "add-repo", path }               later: projects
  { id, kind: "start" | "stop", ... }          later: the runtime

daemon → client
  { id, ok: true, ...reply } | { id, ok: false, error }
  { kind: "grid", grid, dc, dr }               after any change, to every client
  { kind: "facts", facts }
  { kind: "preferences", preferences }
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
  core/        paths, secrets, store (SQLite), migrations, events, log
  document/    the grid: load, run a command through @lattice/model, save; history
  preferences/ the third persisted value
  projects/    repos and worktrees, read from git                       (later)
  terminals/   PTYs, the headless mirror                                 (later)
  runtime/     hosting, observation, the agent service                   (later)
  providers/   one folder per provider: the adapter halves               (later)
  server/      the socket, the WebSocket, the session file, request handling
  main.ts      start: home, store, document, listeners, session file; stop on signal
```

7. Layers in that order, checked by folder as the app is: `core` imports nothing else in
   the daemon; `document` and `preferences` import `core`; `projects`, `terminals` and
   `runtime` import `core` and `document`; `providers/<name>` imports its own folder,
   the runtime's provider contract and `core`'s paths and secrets; `server` imports
   anything.

## Persistence

8. The document is stored as one JSON snapshot in a `document` table, one row, rewritten
   after every command. The grid is small and a value; normalising it into tracks, tiles
   and scopes buys nothing until something queries them, and it is one migration away
   when something does. *This replaces the tables listed in [runtime.md](runtime.md);
   they were the shape of the data, not a commitment to columns.*
9. `events` is normalised and append-only: sequence, time, kind, payload. Every command
   run and every fact observed. The audit trail, and the way undo is rebuilt across a
   restart if that is ever wanted.
10. `preferences` is one JSON row. `repos` and `projects` are normalised, since they are
    listed and joined.
11. `bun:sqlite`, WAL, foreign keys, a migrations folder run at open. The store module is
    the only code that speaks SQL, as in modelbus.

## History

12. Undo moves to the daemon with the document: a stack of snapshots and marks in memory,
    exactly as the app's store holds it today, so the app's `undo` becomes a request and
    the mark still comes back. Not persisted; see 9 for how it could be.

## Lifecycle

13. The shell starts the daemon as a sidecar and stops it on quit, prompting first if
    agents are running. In development the daemon is started by hand or by the shell's
    dev command. The daemon also exits on its own when its parent goes away, so a crashed
    shell leaves nothing behind.
14. At start: make the home, open the store and run migrations, load the document or seed
    it if there is none, listen on both transports, write `session.json`. At stop: remove
    `session.json` and the socket file.

## What the app changes to

15. `store/store.ts` becomes a client: it holds the latest grid the daemon sent, `propose`
    stays local, `run`, `undo` and `redo` send and await. The session, the scene, the
    painter and the view do not change. The mock leaves the app for the daemon's seed.
16. While disconnected the app shows the last grid it had and refuses commands, and says
    so in the key panel. Reconnecting replaces the grid.

## Order

Each step leaves the app working and the harness green.

1. `packages/protocol`, and the daemon's `core/store` with `document`, `events` and
   `preferences` tables. Nothing visible.
2. The daemon loads or seeds the document, runs commands, saves, answers on both
   transports, writes `session.json`. Nothing visible; tested from Bun against a scratch
   home.
3. The app becomes a client, with the dev-server route for the session file. The first
   visible step: the grid survives a reload, and two tabs show one grid.
4. The shell starts and stops the daemon and hands the session to the webview.
5. Preferences: theme first, since it exists, then the default worktree location.
6. Projects: add a repo, read its worktrees, place them as scopes. The seed goes.
7. Terminals.
