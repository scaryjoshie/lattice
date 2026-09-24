# Pane, experiment 3

One question: **does the grid look and feel right?**

A pannable plane of cells. Hover an empty cell for a `+`, click to put a tile there. Drag a
tile to another cell; drag the gap between two tracks to make new ones. Nothing else — no
daemon, no processes, no terminals, no persistence. Reload and it is back to the seed.

The spec is `../../docs/grid.md`, including the survey that rejected React Flow, the
dashboard-grid family and the docking family, and settled on `d3-zoom` plus CSS Grid plus
our own occupancy.

## Run

```sh
bun install
bun run dev      # http://localhost:5274
bun run check    # tsc
bun run build
```

## The model

`src/grid/model.ts` is the whole thing, and it is plain — no React, no store.

```
columns   Track[]   ordered, stable ids
rows      Track[]   ordered, stable ids
tiles     Tile[]    each stores (columnId, rowId)
```

A cell is the pair `(columnId, rowId)`, never a pair of indices. That is the entire point:
inserting a column is `columns.splice(i, 0, track)` and the tiles array comes back the same
array it went in as. No stored position is rewritten, so the rule that would be O(n) on
stored data is O(1), and layout stays mergeable if it ever lives in the daemon.

Indices appear only where ordering is the subject — where to splice, which lane a drag
landed on — and are never stored. `src/grid/store.ts` is a thin zustand shell over the
operations; components hold only what is true for the duration of a gesture.

A cell is 16:10, a tile is exactly one cell, and a cell holds one tile: dropping onto an
occupied cell swaps the two rather than displacing a queue.

## Shape

```
src/grid/model.ts     tracks, tiles, insertion, occupancy — pure
src/grid/store.ts     the operations, plus "a lane outside the grid makes a track"
src/grid/camera.ts    d3-zoom, with wheel rebound for a trackpad
src/grid/metrics.ts   the cell and gutter, read back out of the CSS
src/ui/lanes.ts       model tracks -> rendered lanes (margin, ghosts)
src/ui/Canvas.tsx     the grid, the two drags, the cells
src/ui/Tile.tsx       one tile
src/styles.css        every colour and size, as custom properties
```

## Rules this experiment holds to

- **CSS Grid does the geometry.** The renderer emits `grid-template-columns: repeat(n,
  var(--cell-w))` and nothing measures a cell. The gutter handles are grid items sitting in
  the gaps the template already made, so even the gaps are not computed.
- **Screen delta divides by the zoom.** A tile lives inside the camera's transform, so every
  drag converts through `k` before it means anything in cells (`src/ui/Canvas.tsx`,
  `cellDelta`). This is why dragging is ours: a drag library would have to know about the
  camera to get it right.
- **One pointer, one interpretation.** `d3-zoom`'s filter drops any gesture starting on a
  tile or a gutter, so there is never an arbitration between two gesture systems.
- **Wheel is rebound for a trackpad.** A two-finger swipe on a Mac is a plain wheel event,
  which d3 reads as zoom; here plain wheel pans and `ctrlKey` — what a pinch actually sends —
  zooms, both through the behaviour so the transform stays d3's.
- **The margin is one track wide.** The rendered grid is the model's tracks plus a ring of
  empty cells, so there is always somewhere to point at. Clicking one makes the track, which
  is the same insertion primitive the gutters use.
- **Inserting at the front moves the camera, not the world.** Growing from the left or top
  would lurch the whole plane; the camera moves the same distance so the view holds still.
  A gutter drag is exempt: it is a request to push things aside and should look like one.
- **Everything tunable is a custom property.** Colours, cell size, gutter, radius. The drag
  arithmetic reads those same values back rather than keeping a second copy.

## Known gaps

- **No regions.** `docs/grid.md` builds the line-insertion rule out of regions; the
  primitive it reduces to — splice a track into an ordered list — is here, but regions,
  their cards and edge dragging are not. This experiment is the grid only.
- **No opening a tile**, no stacks, no focus view, no auto-arrange. A tile is a rectangle
  with its id on it.
- **Nothing persists** and nothing is virtualised. Both are deliberate at this size.
- **A tile snaps to its cell on release without animating** — it is already under the
  cursor. Insertion does animate, which is the case that needed it.
