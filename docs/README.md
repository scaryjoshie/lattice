# Lattice docs

Pane until 24 September 2026; the older docs still say Pane.

Being rebuilt. The previous set is in [archive/](archive/), kept whole and unedited.

Rebuilding rather than adapting is deliberate: an adapted doc carries every assumption it
was not asked to carry, and the product has changed shape enough that inherited
assumptions are the expensive kind of mistake. Everything from the archive re-enters by
being written down again on purpose, or it does not re-enter.

For a reviewing agent, start at [ONBOARDING.md](ONBOARDING.md). The code is in
`../packages`; this folder is one part of one repository since 24 September 2026.

## Current

| Doc | What it covers |
|---|---|
| [session-record.md](session-record.md) | What happened, what was asked for, and what is unresolved |
| [behaviours.md](behaviours.md) | Every specific behaviour of the grid, as raw material for a system |
| [choices.md](choices.md) | The specific decisions behind the grid, as made |
| [principles.md](principles.md) | Generalisations drawn from them. Subordinate to the above |
| [model.md](model.md) | The data layer: terminals, programs, agents, and what the first version models |
| [grid.md](grid.md) | The spatial model: cells, tiles, regions, what has an address |
| [architecture.md](architecture.md) | The layers, the three owned values, the loop, commands and undo. Decided, not built |
| [runtime.md](runtime.md) | The daemon, what it persists, the agent service, what is lifted from modelbus |
| [projects.md](projects.md) | Projects, repos and worktrees: observed from git, never owned |
| [organization.md](organization.md) | Packages for two processes, providers as descriptor and adapter, preferences, `~/.lattice`, secrets |
| [daemon.md](daemon.md) | Proposal: the daemon's transport, protocol, layout, persistence and build order |
| [shipping.md](shipping.md) | Tauri, signing, the sidecar, what installing mandates |
| [working.md](working.md) | The practices, and the mechanism that enforces each |

## Not yet carried across

Named so the gaps are visible rather than forgotten. Each is a decision to make, not a
file to copy.

- What Lattice is, and what it organises
- Values that outrank features
- Communication between isolated scopes
- Ask mode
- The human attention queue
- Scope: what a first version is
- The decisions log
- UI tooling: what was chosen and rejected, and why

Carried across on 24 September, by being decided again: the layers ([architecture.md](architecture.md)),
worktrees and git ([projects.md](projects.md)), agents and lifecycle ([runtime.md](runtime.md)).

The decisions log in the archive is the densest of these. Re-entering it one decision at a
time is the exercise, not a copy.
