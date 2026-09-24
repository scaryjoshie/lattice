# Onboarding for a reviewing agent

You are being pointed here to check whether what has been written down is true. Read this
first, then verify rather than believe. The author of these docs is the same agent that
wrote the code, so the docs and the code failing together is a real possibility.

## What this is

Pane: a visual operating environment for parallel software work by humans and agents.
Git worktrees give isolation, agents give disposable compute, and a spatial canvas is the
primary interface. The current effort is establishing what that canvas *is*.

## Where things are

```
/Users/joshua/dev/lattice        one repository since 24 September 2026; history of each part kept
  docs/                the current design. Rebuilt from scratch; see README.md
  docs/archive/        the previous design set, superseded, kept whole for cherry-picking
  packages/model       the document as a value. Pure, shared, tested from Bun
  packages/app         the grid. Was experiments/experiment-5
  packages/daemon      the Bun sidecar. A socket that answers hello, today
  packages/shell       the Tauri window around the app
  experiments/experiment-1   a full vertical slice: kernel, git, runtime, MCP, React Flow UI
  experiments/experiment-2   a pane that opens into a live Claude Code terminal
  experiments/experiment-3   a first grid, abandoned
  experiments/experiment-4   a grid of rounded boxes with gutters, superseded
```

Commit messages are long and explain reasoning; they are a good history of why things are
the way they are, and they are also claims that can be wrong. `~/dev/pane` holds the
repositories as they were before the merge, untouched.

`bun install && bun run dev` runs the app in a browser on port 5277; `bun run --cwd
packages/shell dev` runs it in a window. No terminals or agents actually run yet; what is
on the grid is a mock.

## The documents, and what each claims

| Doc | Claim |
|---|---|
| `behaviours.md` | 101 specific behaviours of the grid. Implemented unless marked proposed |
| `choices.md` | 63 specific design decisions, as made |
| `grid.md` | The spatial model: cells, tracks, regions, moves, rendering |
| `model.md` | The data layer: terminals, programs, agents, and who owns what |
| `principles.md` | Generalisations drawn after the fact. Explicitly subordinate to `choices.md` |

## What would be most useful to check

In rough order of how much damage a wrong answer does.

1. **Is `behaviours.md` accurate and complete?** Every unmarked entry should be observable
   in `experiment-5`. Entries that no longer match the code are the most valuable finding.
   Behaviours present in the code but absent from the list are equally valuable.

2. **Do the seven proposed systems actually generate the 101 behaviours?** The systems are
   in the conversation, not yet a document: Space (cells, regions, containment, occupancy),
   Derivation (the scene is a pure function of model plus interaction), Gesture (each input
   has a meaning, projected onto contexts), Interaction (every input has exactly one owner
   at every moment), Proposal (propose, preview, commit or refuse), Presentation (scale,
   colour, motion), and Room (making space, designed but unbuilt). The interesting question
   is which behaviours are *not* derivable, since those are either accidents or missing
   rules.

3. **Is the code's separation real?** `model.ts` claims to be pure and React-free.
   `paint.ts` claims to be a pure function of a scene. The camera claims never to touch
   React state. Check these rather than take them.

4. **Known weaknesses, already admitted — confirm or refute rather than rediscover.**
   These were true on 23 September and are not now: `Grid.tsx` is 410 lines and decides
   nothing, there are 55 tests, the scene is a pure function. What is admitted today is in
   the gaps list at the end of `behaviours.md`.

5. **Claims made about third-party behaviour**, which were researched but may be wrong or
   stale: that xterm's WebGL addon ignores `lineHeight`; that `@xyflow/react` delegates
   pan and zoom to `d3-zoom`; that `react-zoom-pan-pinch` has an open defect on two-finger
   macOS panning; that Claude Code cleans up session transcripts on a configurable period
   defaulting to thirty days; that tldraw's SDK requires a commercial licence for
   production use.

## Things that are known to be unresolved

Do not report these as findings; they are recorded as open.

- What deleting means for an agent, which has a persistent identity and a resumable session
- How room is made: line insertion is specified in `grid.md` and implemented nowhere
- Selection, in all its forms, which is proposed and unbuilt
- Whether a refused move should grow both regions until they close, rather than refusing

## How to be useful

Prefer "this line in this file contradicts this line in this doc" over "the architecture
could be cleaner". Both are welcome, but only the first cannot be argued with.
