# Lattice

A visual operating environment for parallel software work by humans and agents: git
worktrees give isolation, agents give disposable compute, and a spatial grid is the
interface. Called Pane until 24 September 2026.

```
packages/model    the document as a value, shared by app and daemon
packages/app      the grid: session, scene, paint, view. Runs in a browser or the shell
packages/daemon   the Bun sidecar: state, terminals, agents. A socket that answers hello, today
packages/shell    the Tauri window around the app
docs/             the design, as specific decisions. Start at docs/ONBOARDING.md
experiments/      experiments 1 to 4, kept whole. Experiment 5 became packages/app
```

`bun install`, then `bun run dev` for the grid in a browser on port 5277, or
`bun run --cwd packages/shell dev` for it in a window. `bun run check` runs every package's
layer check, tests, types and build.
