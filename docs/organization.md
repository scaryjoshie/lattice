# Organisation

How the code is laid out once there are two processes, where providers and settings go,
and what lives in `~/.lattice`. Decided 24 September 2026. The client half exists in
`experiments/experiment-5`; the rest is not built.

## Packages

One repository, Bun workspaces, one package per process plus what they share.

```
lattice/
  packages/
    model/       the document as a value: grid, region, commands, propose and apply     shared, pure
    protocol/    the wire: commands in, snapshots and facts out; types and a codec    shared
    daemon/      the Bun sidecar
      core/        store (SQLite), history, events, preferences, paths, secrets
      document/    the grid: load, run, save
      terminals/   PTYs, the headless mirror, size
      agents/      identity, hosting, observation of what is running
      providers/   one folder per provider: the adapter halves
      git/         reading repos and worktrees. Which repos: rows in the store, not code
      server/      the socket and request handling
    app/         the webview client: session/, scene/, paint/, view/, client/
    shell/       src-tauri: the window, the tray, sidecar supervision, the quit prompt
  docs/
```

1. `model` and `protocol` are the only packages both processes import. The daemon never
   imports the app; the app never imports the daemon.
2. Each package keeps its own layer checker, by folder, as `experiment-5` and modelbus do.
   Within the daemon, `core` imports nothing else in the daemon; `document` imports `core`;
   `git`, `terminals` and `agents` import `core` and `document`; `providers/<name>` imports
   its own folder, the agents' provider contract, and `core`'s paths and secrets helpers;
   `server` imports anything.
3. Done on 24 September: `experiment-5` is `packages/app`, `model` is its own package
   imported as `@lattice/model`, `packages/protocol` is the wire, `packages/daemon` owns
   the document and answers on both doors, and `packages/shell` starts the daemon and
   opens the app on it. The seed lives in the daemon. See [daemon.md](daemon.md).

## Providers

4. The grid knows two families: a *host*, a place holding one thing, and a run. A host
   carries the *surface* it was made for, terminal or webview, as a name the model stores
   and never branches on. What a host holds is an *occupant*, a fact the runtime observes;
   a host with nothing in it shows its surface's idle occupant, a terminal its shell. A
   *provider* is an occupant that is an agent: Claude Code, Codex, and not necessarily a
   program in a terminal, since a browser agent would be one too. A shell and a browser
   page are the grid's own occupants, under `occupants/`, and are not providers.
   Surfaces are a registry, `occupants/surfaces.ts`; adding one is a row and a view
   component that mounts it. Terminals are most hosts, so the terminal is the default
   surface and the daemon allocates a PTY unless a surface says otherwise.
5. A provider is one folder that defines everything about itself, in two halves. The
   *descriptor* is data: its mark, its label, the controls it offers. The *adapter* is
   code: how it is started, resumed, identified, delivered to, and what hosts it. Both live
   in `providers/<name>/`. A terminal is the first host, not the only one.
6. Descriptors are shared, so the client draws a mark and offers a control without knowing
   how anything is started. Adapters run only in the daemon. A registry, `providers/index.ts`,
   lists the folders and knows nothing about them but their names. Built as far as the
   descriptors: `experiment-5/src/providers/{claude,codex}` and
   `experiment-5/src/occupants/{shell,browser}`, with `occupants/index.ts` the registry over
   both.
7. Adding a provider is one folder and one line in the registry. Nothing in `model`,
   `session` or `paint` changes, which is the test that the tile's `kind` has left the
   model.
8. Two model changes came before the daemon, because its protocol is written against the
   model's shape, and both are done: the provider is off the tile and is a fact the
   runtime observes (`runtime/facts.ts`) looked up in the descriptor table
   (`providers/descriptors.ts`); and a run is its own record beside terminals and
   browsers rather than optional fields on one `Tile`.

## Preferences

9. A third persisted value beside the document and the session. Theme, the key panel,
   provider configuration such as paths and flags.
10. Owned by the daemon, kept in `~/.lattice/preferences.json` beside the store (see
   [daemon.md](daemon.md) 11), changed by their own request, not undoable, pushed to the
   client the way the grid is. Not in the session, because they outlive the window; not in
   the document, because they are not about any project. Settings that are about a
   project, such as where its new worktrees go, are that project's and live with it:
   [settings.md](settings.md) has the rule, and corrects this item, which listed the
   worktree location here.

## `~/.lattice`

```
~/.lattice/
  lattice.db        the store: grid, terminals, agents, projects, events
  preferences.json  the app's settings that differ from the defaults; edited by hand too
  daemon.sock       the socket
  daemon.log
  secrets/          one owner-only file per provider, replaced through a temporary file and rename
```

11. The directory and every file in it are owner-only. That protects against other users
    on the machine and not against other programs running as you: the same trust model as
    `~/.modelbus` and every developer tool's dotfolder, and the right one for a local daemon.
12. `daemon/core/paths.ts` is the only module that knows where `~/.lattice` is. Tests run
    against a temporary directory by overriding one value.
13. `daemon/core/secrets.ts` is the only module that reads or writes `secrets/`. A provider
    asks it for its own secret and cannot reach the database.
14. The socket needs no token. A client that can open an owner-only socket is the owner.

## Tokens

15. Lattice runs the providers' own programs and never calls their APIs, so it holds no
    API keys. Claude Code and Codex keep their own logins.
16. What it may hold: a per-provider delivery token, if pushing text into a running Claude
    uses its inbox mechanism as modelbus does. In `secrets/`, owned by that provider's
    adapter.
17. Cloud or sync credentials, if they ever exist, go in the macOS Keychain through
    Tauri's plugin, not in a file. Not now.
