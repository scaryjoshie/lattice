# Architecture

The layers of the application, who owns which state, and how an input becomes a change.
Decided 24 September 2026. Specific and checkable, in the manner of [choices.md](choices.md);
where something is not yet decided it says so.

The product is being renamed Lattice. The docs still say Pane where they were written
before that.

## Layers

Dependencies point down. Nothing lower knows what is above it.

| Layer | What it is | State today |
|---|---|---|
| model | The grid as a value. `propose` returns a verdict with every move; `apply` takes the verdict whole | Exists: `model/grid.ts`, `model/region.ts`. Sound |
| commands | Every document change as data: move, resize, place, remove, set text, set name | Exists: `model/command.ts`; the store is `propose` and `run`. Session commands (select, sweep, open) not yet |
| history | The log of document commands, with undo and redo | Exists: snapshots in `store/store.ts`, Cmd-Z. Selection not yet restored |
| interaction | Selection, pointing, gesture, overlay, opened. One pure step function | Missing: spread across `view/Grid.tsx`. Pointing is one value; the rest is not |
| scene | A pure projection of model, interaction and camera | Half: a memo, plus fields `draw` derives from refs |
| paint | Draws a scene and remembers nothing | Exists: `paint/paint.ts`. Sound. Called paint rather than render because render already means React's re-render in this codebase |
| view | Translates DOM events into inputs; mounts overlays | `view/Grid.tsx`, 1,070 lines, should be about 300 |

One folder per layer, in this order plus `mock` between model and store for the seed grid,
and `scripts/check-layers.ts` fails the build on an import that points up.

The test for where a thing lives is unchanged from [model.md](model.md), with one word
corrected: *would this still be true with no window open?* Yes: model, history, and later
the daemon. No: interaction, scene, camera.

## Three values, three owners

1. `grid`, the document. Persisted. Shared by every window.
2. `session`: selection, pointing, gesture, overlay, opened. References the grid by id only.
   Dies with the window.
3. `camera`: owned by d3-zoom, written straight to the canvas and the tile layer. Never in
   either of the others.

The session does not contain the grid and the grid does not contain the session. The step
function takes both; the scene takes all three.

## The loop

```
DOM event ──▶ toInput(event, camera)         view: the only code that knows the DOM
          ──▶ react(grid, session, input)    pure; returns commands
          ──▶ run(commands)                  document command → history.push, grid = apply
                                             session command  → session = next
                                             runtime command  → agent service
          ──▶ scene = sceneOf(grid, session, camera)
          ──▶ schedule(paint)                one frame, latest camera
```

3. React subscribes to the overlay slice of the session and renders the menu, the editor
   and the opened panel. It renders nothing else and never sees a pointer move.
4. The camera calls `schedule` directly. The frame loop runs only while something animates.
5. Exactly one target is under the pointer at a time. Precedence is handle, then gridline,
   then item, then cell, decided in the one function that builds a `Target`, never in paint.
6. A gesture holds its own proposal. Release applies what was previewed and proposes
   nothing again.

## Commands

7. Every change goes through `run`, selection included. One log, one place to test.
8. Commands are plain data, serialisable. This is what lets the document move into the
   daemon later without touching the interaction layer.
9. Undoable and not are separate from document and session. Document commands are
   undoable; session and runtime commands are not.
10. Each history entry records the grid before the change and the selection before it.
    Undo restores both, so undoing a change re-selects what was selected when it was made,
    and selecting on its own is not an undo step. Figma and tldraw both put selection
    changes on the undo stack; restoring the selection without making it a step is our
    choice, not a precedent.
11. History starts as a stack of grid snapshots, one per command, in memory. The grid is a
    small immutable value, so no inverse commands exist to get wrong. Undo does not survive
    a restart; when it must, it is rebuilt by replaying the daemon's events log
    ([runtime.md](runtime.md)).

## Types the interaction layer is built on

Sixty lines, to be read before any handler is rewritten. Names are decided; shapes are
the proposal from the previous session and may change in the writing.

```ts
type Target =
  | { kind: "cell"; ci; ri }
  | { kind: "item"; id; region }
  | { kind: "handle"; scope }
  | { kind: "line"; owner; c; r }
  | { kind: "overlay" }

type Input =
  | { type: "press"; target; shift; button }
  | { type: "move"; target; cell; world }
  | { type: "release"; target; travelled }
  | { type: "key"; key; down }
  | { type: "leave" }

interface Session {
  selection: Selection | null
  pointing: Target | null
  gesture: null | Carry | Stretch | Sweep | Dismiss   // each holds its proposal
  overlay: Menu | Editing | Naming | null
  opened: string | null
}

function react(grid, session, input): Command[]
```

12. `react` is pure, has no React, no DOM and no canvas, and is tested from Bun like the
    model.
13. The session holds nothing that can be computed. `corners`, `about` and the resize
    lines were stored in the current code and each caused a bug.

## Where this is standard

Unidirectional data flow (Elm, Redux) for input → pure step → view. The command pattern
for the commit step, which is how editors and games get preview and undo. A tool state
chart for the gesture, of which tldraw's `StateNode` tools are the nearest example; note
that tldraw's handlers mutate the editor directly, so the precedent covers the state chart
and not the purity. The closest thing to our pure step is Excalidraw's actions, each a
`perform(elements, appState, …) → { elements, appState }`. Neither keeps a separate session
value: tldraw holds selection as session-scoped records in the same store, Excalidraw in
`appState`. The parts that are ours: the proposal, where the model returns a whole verdict
that the scene previews and the store applies whole; the session as a value of its own;
and pointer ownership as a stated precedence. Checked against both repositories on
24 September 2026.

## Open

- Whether the client keeps a copy of the model for previewing proposals before the daemon
  confirms them. `propose` is pure, so it can; whether it should is a latency question to
  answer when the daemon exists.
- The exact shapes of `Target`, `Input` and `Session` above.
