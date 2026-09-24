# Working

How the practices in these docs are followed while building, and what enforces each one.
A practice with nothing enforcing it is a preference, and preferences do not survive a
long session. Written 24 September 2026.

## Mechanisms

| Practice | What enforces it |
|---|---|
| Dependencies point down the layers | A layer checker in `bun run check`, as modelbus has: `region` imports nothing; `model` imports `region`; `interaction` and `scene` import `model`; `paint` imports scene types; nothing imports the view. A wrong import fails the build |
| The model is right before the view is | `bun test` over `model.ts`: `proposeMove`, `push`, `close`, `wellFormed`, `applied`, from Bun with no browser. The previous sessions wrote these as throwaway probes and they found real bugs each time; they are checked in |
| The interaction layer is pure | The same tests over `react`. If a rule cannot be tested from Bun, it is in the wrong layer |
| `behaviours.md` is the regression test | The headless harness drives the running app through Playwright and checks the behaviours that can be checked mechanically: what opens, what closes, what is selected, what moved. What it cannot check, the look, Joshua checks |
| Every change is a command | The store has one entry point, `run`. A new store method is a review failure |
| Nothing moves unless asked | No layout code runs outside a command. A packing or tidying pass is a command the user invokes |
| One decision, one place | A decision goes into `choices.md` or the relevant doc in the same commit that makes it. `behaviours.md` is updated in the commit that changes a visible behaviour |

## Cadence

1. One step per commit. A step is one rule, one deletion, or one behaviour. Ten fixes in
   two edits broke chevrons and the frame loop on 23 September and needed a hard reset.
2. `bun run check` before every commit. `bunx vite build` does not typecheck.
3. A visible change is left uncommitted with a note saying exactly what to look at. Joshua
   looks; then it is committed. A green build says nothing about what is drawn.
4. Prefer the diff that deletes. The correct implementation replaces the incorrect one
   rather than sitting beside it. Eleven net-positive commits in a row is the signal the
   architecture is being patched, not fixed.
5. When something looks impossible, the model is wrong, never the pixels. Find the
   structural fault before touching paint.
6. If a thing has to be specified, the abstraction is off. A rule per case means the rule
   above the cases is missing.
7. Write specific behaviours and specific choices. Generalisations authorise nothing.

## Two agents

One agent in `Grid.tsx` at a time. A second agent works on a branch in a separate worktree
and says so on the bus first, or stays in `docs/` and review. Two hands in one checkout
cost an hour on 24 September.
