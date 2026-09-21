# The grid

The spatial model. Written from scratch; nothing here is inherited.

## The shape

```
project        one grid
region         a rectangle of cells — a worktree
tile           one cell — an agent, a view, a worktree's own card
```

One level of containment on the surface: a region holds tiles. That is the depth a grid
handles well, and keeping to it is why several other things below work out.

## Cells

A cell carries the screen's aspect ratio, and a tile is exactly 1x1. A screen is already
wider than it is tall, so a 1x1 tile on an aspect-correct cell *is* a wide rectangle —
"2x1" and "1x1 on the right cell" are one idea said twice, and only one of them needs span
arithmetic. Larger tiles stay available later but must be square in cell count, or the
shape stops matching the screen.

**Position is `(columnId, rowId)`, not `(col, row)`.** The grid is two ordered lists of
tracks, each track with a stable id; a cell is named by the pair of ids, never by an index.

This matters because line insertion is the core primitive. With integer indices, inserting
a column renumbers every column to its right, so every stored position, every region span
and every reference becomes wrong and has to be rewritten. With stable ids, insertion adds
one entry to an ordered list and changes the identity of nothing. The rule that was O(n)
on stored data becomes O(1).

It matters twice over because layout lives in the daemon and persists, and index-based
positions would be unmergeable the moment two clients ever touch the same grid.

**Occupancy, not snapping.** Snapping is visual — a tile lands on round numbers while the
model still stores pixels. Occupancy is semantic: a tile *is at* a cell, a cell holds one
tile, dragging displaces or swaps. Occupancy is what makes it feel exact, and it is what
makes everything below cheap.

**Empty cells are affordances.** A grid has something a free canvas does not: named
nothing. Hovering an empty cell shows a `+`; clicking it offers Claude, Codex or a shell.
Adding a tile stops being a right-click into a void that has to invent a position, and
becomes pointing at where you want the thing.

## Opening a tile

A tile is drawn at the screen's size and shown smaller; opening it animates scale alone,
from thumbnail to 1. No resize, no reflow, no camera move. What is inside cross-fades,
because a card and a terminal are different representations rather than two sizes of one
thing.

Every tile opens the same way, which is what lets tiles generalise:

```
agent tile       opens into   its terminal
worktree tile    opens into   its tasks, problems, decisions, git
integration tile opens into   merge readiness, divergence, conflicts
```

## Two families of tile

| | Examples | Identity | Lives in |
|---|---|---|---|
| **Subjects** | agent, worktree, integration | Persistent, in the model | The kernel |
| **Views** | file tree, an open file, a diff, a browser | None of their own | Surface state |

A browser tile is not a peer of an agent tile; it is a window onto something else. Keeping
the two apart is what stops the canvas becoming the source of truth. A new subject type
needs a concrete use case. A new view type barely needs justifying, because a useless view
costs nothing to delete.

## Agents never place tiles

An agent boxed in by neighbours wants to open a browser and there is no free cell. Any
answer that moves other tiles means the layout rearranges itself under the person using
it.

**A tile is a stack.** An agent's tile holds its terminal plus whatever it opens; the tile
says how many and you page between them. Opening a view is therefore never a spatial act,
and an agent never has to solve a geometry problem it cannot see.

**Promotion is a human act.** Pulling a view out into its own cell is something a person
does, when they want two things side by side and can see whether there is room. Spatial
decisions belong to whoever can see the space.

A stack is a tab strip. Nobody needs it explained.

## Regions are worktrees

A worktree has to *show* things — objective, branch, counters — and be clickable. Shading
alone gives it nowhere to put any of that.

**A worktree occupies one tile of its region, and that tile is its card.** Agent tiles fill
the rest. This invents nothing: it is a tile, so it opens like a tile, and the worktree
detail view stops being a separate surface that needs designing. It also answers what a
worktree with no agents looks like — its card, alone in its region.

Regions are sized by dragging, not by growing to fit. Auto-growth displaces neighbours,
which is the same problem in a new place. Adding an agent to a full region grows it
deliberately.

A tint or a region border helps grouping read at a glance, but cannot be the only carrier,
for the reason this section starts with.

**A labelled region must be a scope.** A region that is not a worktree or a repository is a
second way of putting things in boxes, which is a second containment hierarchy whatever the
UI calls it. Free grouping would have to enter the model as a real concept first.

## Repositories are a property, not a container

Repository as a box containing worktree boxes is three levels of rectangle on a 2D grid:
wasteful, and every region becomes a negotiation with its parent's shape.

Repository as a workspace you switch between removes the nesting but costs worse. A project
spans repositories on purpose, so separate screens mean the frontend and backend halves of
one piece of work can never be seen together, and cross-repository traffic becomes
invisible exactly when it is most worth seeing.

**So repository is not spatial.** One project, one grid. Which repository a region belongs
to is a property of the region — label, tint — not its position.

The consequence is the good part: **adjacency means "related work", not "same
repository".** The backend auth worktree can sit beside the frontend auth worktree, because
that is the piece of work. Seeing one repository at a time becomes a view — highlight or dim
on demand — which costs no geometry.

## No edges

Edges were assumed and are now rejected, for the original product as much as this one. A
web of connections is a picture of a graph, not an answer to a question, and it becomes
unreadable at exactly the scale where the question gets interesting.

**Relationships are shown by focus, not by lines.** To see who an agent can reach, light
its reachable cells and dim the rest. This is query-driven rather than always-on, it costs
nothing when nobody is asking, and it does not degrade with N — there are no N² lines
because there are no lines.

It generalises past communication: which tiles a worktree owns, which were touched by a
commit, which an agent has open. Each is the same gesture.

**Consequence.** Edges were the main reason to keep a node-graph library. Without them,
what is left is pan, zoom and placing absolutely positioned boxes on a grid, which is a
much smaller thing. Whether a graph library still earns its place is an open question, and
a cheap one to test.

## What has an address, and what does not

**Identity is the address. Position is not.**

A cell is not a name. People move tiles, so an agent that referred to another agent by cell
would be referring to something else five seconds later. Anything durable — messages,
relations, provenance, an orchestrator's instructions — refers to an agent by its id, as it
always did.

What position gives is **deixis**: "this one", "that one", pointed at, hovered over, spoken
about, resolved to an identity at the moment of pointing. Position is a pointing device,
not an address.

For an orchestrator the same distinction applies, and it is still valuable: a layout is
*context*, not addressing. What is near what, what shares a region, what is open — real
information, read at a moment, never stored as a reference.

## Auto-arrangement is a command

Position being `(col, row)` makes tidying an ordinary packing problem: pack by repository,
by activity, by recency.

It must be invoked, never ambient. Anything that rearranges tiles on its own breaks the one
property the grid exists to provide — that where you put something is where it stays.

## Layout belongs to the daemon

Processes already survive a browser reload. Layout must too, or terminals and display are
not really independent. With `(col, row)` that is two integers per tile.

Outside the kernel does not mean inside the browser.

## Future: a shared grid

Not now. Recorded because it changes how attractive the grid is.

A grid suits collaboration far better than a free canvas. Cells are discrete, so there is no
overlap to reconcile and no pixel-level merge conflict; a region is a contiguous range of
cells, so **ownership is expressible as geometry**. A teammate owns a region, their agents
work in it, you watch it live, and routing agents carry a question from your region to
theirs.

Presence is cheap for the same reason: a viewport is a cell range, so where someone is
looking is two coordinates.

Nothing needs building for this. It is worth knowing that the layout model chosen for
single-player reasons is also the one that makes multiplayer tractable, and worth not
precluding it — principally by keeping layout in the daemon, which is already the plan.

## What renders the grid

Edges are not entirely dead. Inside a focus view — everything else dimmed — a handful of
lines between the lit cells is legible, because the noise that made a web unreadable has
been turned off. That is a small, conditional use, and almost certainly not enough on its
own to justify a node-graph library.

Surveyed September 2026. Two families exist and neither fits, for the same reason.

| Family | Examples | Model | Why it misses |
|---|---|---|---|
| Dashboard grids | `react-grid-layout` 2.2.4, `gridstack` 13.3.0, `muuri` 0.9.5 | Cells, spans, collision, drag and resize | Fills a viewport. No pan or zoom |
| Docking / tiling | `dockview` 8.3.1, `flexlayout-react` 0.11.0, `react-mosaic-component` 7.1.0 | A tree of splits and tab sets | Not coordinates at all. No canvas |

All MIT except react-mosaic (Apache-2.0), so licensing is not the deciding factor the way
it was for tldraw.

The dashboard family is closer than expected. `react-grid-layout` supports
`compactType={null}`, `preventCollision` and `allowOverlap`, which is precisely the
non-compacting occupancy wanted here — nothing drifts, a cell is claimed or it is not. Its
gap is only that it has no viewport of its own.

The question underneath was whether the grid needs to be pannable at all — a viewport-filling
tiling layout would delete the camera and make those libraries usable directly. Continuous
depth settles it (below): the plane is larger than the screen, so there is a camera, and
both families are out.

### Decided

| Concern | Choice | Why |
|---|---|---|
| Camera | **`d3-zoom` 3.0.0** (ISC) | See below |
| Transition | `motion` 13.4.0 (MIT) | Already proven on the scale-open |
| Rendering | **CSS Grid** | The engine emits track sizes, `grid-template-columns` does the geometry. Variable-width tracks later cost nothing |
| Occupancy | **ours**, ~100 lines | Tracks, regions, insertion, and screen-to-cell conversion |
| Snap dragging | **ours**, ~60 lines | See below |
| Build | Bun, Vite 8, React 19, TypeScript | Carried over; nothing wants changing |
| Styling | Plain CSS | The look is bespoke, so utility classes buy nothing |

**The camera is the part of React Flow that was never the problem.** Its viewport is
`d3-zoom` — verified directly: `@xyflow/system` lists `d3-zoom`, `d3-drag`,
`d3-selection` and `d3-interpolate` as dependencies. So using `d3-zoom` directly keeps
exactly the pan and zoom feel that already worked, and drops the node-graph layer that did
not. This is subtraction, not replacement.

It matters because input normalisation is the genuinely hard part of pan and zoom, not the
matrix maths. A trackpad pinch arrives as a wheel event with `ctrlKey` set although no key
was pressed, and the delta magnitudes vary by browser, OS, hardware and sensitivity
setting with no reliable threshold between "pinch" and "scroll". `d3-zoom` has absorbed a
decade of that.

The React-native alternatives were considered and rejected on exactly this point.
`react-zoom-pan-pinch` has an open defect on two-finger panning on macOS.
`@use-gesture/react` 10.3.1 does handle wheel-based pinch — an earlier note here said it
was touch-only, which was wrong — but the behaviour diverges by browser: Chrome fires both
its pinch and wheel handlers for a trackpad pinch, Safari fires only wheel for ctrl+wheel
and only pinch for its own gesture events, and improving the wheel-based pinch algorithm is
an open issue upstream. It is usable; it just leaves the cross-browser reconciliation with
us, which is the exact work `d3-zoom` has already done.

**Dragging is ours, deliberately.** Every drag library computes deltas in screen pixels,
and a tile lives inside a zoomed transform, so every delta needs dividing by the current
zoom — something a library cannot do unless it knows about the camera, which is precisely
what makes React Flow's dragging feel approximate. Snapping to an occupancy grid is our
model regardless. Pointer events plus a division is less code than configuring something
to be wrong.

`interactjs` 1.10.28 (MIT) is the closest fit among manipulation libraries, and is worth
knowing about: it reports draggable, resizable and gesture data and deliberately does not
move the element for you, which suits "drag an edge, interpret it as an insertion". It is
maintained slowly — 1.10.27 in March 2024, then nothing until August 2026. `@dnd-kit/core`
6.3.1 solves a different problem, draggable-to-droppable with collision detection and
sortable semantics, which is not what moving a tile between cells needs.

The argument against both is the same and is not about their quality: a second gesture
system on the same objects as the camera means two things interpreting the same pointer,
and every edge case has to be arbitrated between them. One drag path, ours, converting
screen delta to cell delta through the camera we already own.

There is no tool for "occupancy grid on a zooming plane". Having checked both families and
found neither fits, writing the small thing is the honest answer rather than the lazy one.

## Open: hierarchy is still unsolved

Repository, worktree and tile are three levels, and none of the models tried so far is
convincing. Nesting rectangles is ugly, workspaces break cross-repository work, and
repository-as-a-property does not yet say what happens when a project has six repositories
and forty worktrees.

Two candidate shapes, neither developed:

**Regions flow; tiles are fixed.** Within a region a tile's cell is absolute and stays put.
*Between* regions, placement is computed rather than manual, so a growing region pushes its
neighbours apart and buffer space appears without anyone arranging it. This keeps the
property that matters — what you placed stays where you placed it — while giving up manual
control at the level where manual control is mostly tedium. It is two layout models
stacked, which is a real cost.

**Hierarchy as depth, not as rectangles.** A repository is a chunk; zooming into it reveals
its worktrees; zooming into one reveals its tiles. Containment is expressed by how far in
you are rather than by boxes drawn inside boxes, so no level pays rent in the level above.
This is semantic zoom applied to containment rather than to detail, and it fits the scale
transition already built: opening a tile and entering a chunk would be the same gesture at
different depths.

**But depth must not be modal.** The objection that settles it: sometimes you genuinely do
want one view to hold everything, and making the user walk down and back up through levels
to reach anything is a tax paid on every single interaction. It is worst for voice, where
the whole appeal is referring to something without first travelling to it.

So distinguish two things that "drilling in" runs together:

| | What entering a chunk does | Cost |
|---|---|---|
| **Modal** | Replaces the view; the rest of the project is gone | Forces navigation. Nothing outside the current chunk can be seen, pointed at, or spoken about |
| **Continuous** | Changes nothing about what exists; only what is drawn | None of that |

**Continuous.** One plane. Everything coexists on it always, at a real position, and zoom
decides only how much of each thing is rendered. Nothing is ever hidden, only small.

That also rescues nesting from the objection made against it earlier. Three levels of
nested rectangle is ugly *when all three are drawn at once* — which is a rendering problem,
and semantic zoom is exactly its fix. Containment stays real in the layout; the renderer
just never shows more than about one level of it at a time.

### Space can always be made, so nothing has to flow

If every region is an axis-aligned rectangle of cells, room can always be found, and the
construction is one move: **insert a grid line.**

To grow region `R` by a row, insert an empty row at the grid line below `R`'s bottom edge.
One rule covers every case:

> **Everything not entirely above the line moves down by one. `R` keeps its new row.**

Nothing grows. Regions that straddle the line are *moved*, not stretched — an earlier
version of this had them gain a blank interior row, which is unnecessary growth inside a
region that had nothing to do with the request.

It is collision-free, and worth stating why rather than assuming it. Take `P` entirely
above the line and `Q` straddling or below it, so `P` does not move and `Q` moves down.
`P`'s bottom edge is above the line; `Q`'s bottom edge is at or below it. So `P` can never
sit below `Q`, and `Q` moving down can only increase their separation. Regions that both
move keep their relative positions exactly. No pair can newly overlap.

The inserted row is also genuinely empty. Anything occupying that row before must have had
its top edge at or above the line and its bottom at or below it, so by the rule it moved
down, and the row is clear.

Every shape keeps its size, relative order is exactly preserved, and columns work the same
way. It is how a spreadsheet inserts a row, it is O(n), and it is deterministic — no
packing, no search, no solver.

A straddler that moves leaves a gap above it. That is not a defect: it is the buffer space
appearing on its own, which is the behaviour wanted, and it costs nobody any size.

With tracks having identity, "moving" needs no rewriting at all. A region owns a contiguous
run of tracks, so a line that would fall *inside* a region is instead inserted immediately
before that region's first track. The region keeps exactly the tracks it had, and is later
in the ordering purely because a track now precedes it. Regions entirely above keep both
their tracks and their place. Nothing is renumbered, and the new track is genuinely empty
because the insertion point was chosen not to split anything.

**Dragging an edge is the same operation.** Pulling a region's boundary outward is a
request for room, so it resolves exactly as above — take adjacent free cells if there are
any, otherwise insert a line. Resizing needs no separate mechanism, and never fails.

**This replaces the idea that regions should flow.** A packing pass recomputes everyone's
position whenever anything changes, which quietly contradicts the property the grid exists
for. Line insertion moves things only when asked, and moves them the minimum a guarantee
allows: absolute coordinates change, relative arrangement does not. What you built stays
built.

The honest caveat is that it guarantees space *exists*, not that it is found politely: a
full-line insertion displaces distant things that had nothing to do with the request. So in
practice, try local displacement first — where the cells immediately adjacent are free or
can be nudged without cascading — and fall back to line insertion, which always works.
Animating the insertion makes it legible rather than startling.

**And it takes layout duty away from hierarchy.** Containment stays what it is — a worktree
contains its agents, because that is true — but it no longer has to carry the job of
producing room, which is what made every nesting scheme feel like it was straining.
Hierarchy expresses meaning; rectangles and line insertion handle space. No further levels
should be invented to make the geometry work, because the geometry already works.

And it decides the renderer question above. Continuous zoom over a plane larger than the
screen means the pannable canvas, not the single screenful — so the dashboard and docking
families are out, and what is needed is a pan/zoom container plus our own occupancy.

One thing to hold on to: voice and orchestration should not be bound by the camera at all.
They address by identity, so they can act on anything regardless of where the view happens
to be. Zoom level is then a useful *default* for what "this one" means when a person points
— repositories at one depth, agents at another — rather than a limit on what can be reached.
