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

**A region is a plate, not an outline.** A region contains empty cells — that is most of
what a region is — so a border around it is the wrong primitive. A dashed rectangle also
competes with the texture the gutters already make, carries a conventional meaning
(marquee, drop target, provisional), and shimmers at low zoom unless the dash length is
tied to the cell size.

**And the plate is not drawn — it is the cells themselves, tinted.** A separate rounded
rectangle underneath would be a second kind of object with its own geometry, its own
corners and its own relationship to the gutters. Instead: every cell in the region carries
the region's hue at a light tint, and contiguous cells merge, so the plate's shape *emerges*
from the cells rather than being drawn around them. One primitive, not two. The label sits
in the gutter at the top-left corner and is the region's handle.

The region stays rectangular in the model, so line insertion is untouched, but nothing
requires the painted shape to look like a rectangle — merging draws whatever the cells
actually are.

Dashes then get a meaning instead of being the default: a region being drawn or resized, or
one whose bounds are inferred rather than set.

### Three questions, three channels

| Question | Channel |
|---|---|
| Which group is this cell in? | **Hue** |
| Is it occupied? | **Lightness** — light tint for a member cell, dark for one holding something |
| What is the occupant doing? | **The mark inside the tile** |

Nothing else varies. An earlier version of this had lightness carrying *state*; occupancy is
the better job for it, because it is the question every cell answers, and state is a question
only occupied cells answer.

### Subgroups do not exist yet

Nesting was going to be a step of lightness per level, which this encoding no longer has
spare. That turns out not to matter: **there is currently only one level of region.**
Repositories are a property rather than a container, and nested worktrees are deferred. So
there is no second level to draw, and designing one now would be inventing a problem.

When a real second level appears, the candidates are a hue shift within a family, or a
child region inset within its parent so a ring of parent tint surrounds it — space carrying
the nesting rather than a colour channel. Neither is worth choosing in advance.

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

## What a grid looks like when it is calm

The look is mostly a rendering decision, and it is a short list:

- Page and cell colours sit within a couple of percent of each other. **The grid is felt
  through the gaps rather than drawn with lines.** The moment edges become real strokes it
  turns into a spreadsheet.
- Gap and radius scale with the cell. An **edge stays a fixed screen pixel** and fades out
  below roughly 16px of cell — the constant-screen-width rule again.
- Tinted regions get no border. Only the focused cell does.
- **Hue carries identity, lightness carries state.** Nothing else varies.
- **Contiguous same-coloured cells merge into one rounded blob** rather than reading as a
  cluster of separate tiles. That is the difference between territory and a heatmap, and it
  is the single biggest upgrade over drawing each cell independently. A corner is rounded
  only where its neighbour is absent, so the blob falls out of per-cell drawing with no
  region-union geometry.
- **The camera is the only ambient movement.** Cells respond to change — a scale-in when
  created, a slow pulse on the active one — and nothing else animates. This is also the
  structural reason tiles cannot lag behind cells: if nothing animates per element during a
  pan, nothing can fall behind.

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

**Canvas, not GPU, at this size.** The lattice is painted, never built out of elements —
but there is a spectrum, and the honest calibration matters:

| Approach | When it wins |
|---|---|
| **2D canvas, redrawn from the camera** | Hundreds of visible cells. Ours |
| Fragment shader on a fullscreen quad | Uniform infinite lattice, thousands of cells |
| Data texture, one texel per cell, neighbour sampling | Cells must know about each other at scale; mipmaps give density tints far out |
| SVG `<pattern>` | Never here — expensive on Safari when opacity changes during pan |

The shader routes are better at ten thousand cells and wrong at four hundred. Two
mismatches beyond size: `fract()` grids and chunked data textures both assume a **uniform
lattice addressed by integer coordinates**, which a model of ordered tracks with stable ids
and arbitrary insertion is not; and merging into blobs needs no shader, since a corner's
radius depends only on whether its neighbours are present.

### The discipline comes from immediate mode, not from the GPU

The argument for going GPU-first is not really throughput — it is that game-style rendering
*forces better practices*, while staying in the DOM keeps pulling the design back into web
habits that have already cost us. That argument is right, and it is worth separating from
the technology, because the benefit does not come from where the pixels are drawn.

It comes from **immediate mode**: a render that draws the current state every frame, with no
reconciliation, no retained element per cell, no layout engine holding an opinion, and an
explicit camera. Every failure so far was the framework acting on our behalf — elements per
cell re-rendered on pan, the camera routed through component state, a layout library
measuring screen boxes and springing tiles toward them.

A 2D canvas is immediate mode. It forces all of it. **The GPU is an optimisation of the same
model, not a different one**, which is why adopting canvas now and swapping draw calls later
costs nothing architecturally: the world model, the camera and the draw-from-state loop are
identical either way.

The hybrid is forced regardless, and is not a compromise. A tile holds a terminal, so real
text and real input have to be DOM. Canvas paints the lattice, the tints and the merged
regions; DOM holds the tiles, over the top, sharing one camera. Figma and Mapbox are both
built this way.

Text and interactive content stay DOM, over the canvas, sharing one camera — a tile holds a
terminal eventually. The discipline is the same either way: **React never touches the
canvas contents; it reads the camera and draws on top.**

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

## Proposed: the keyboard

Not built. Recorded because the shape has one decision in it that is easy to get wrong.

A **cursor** that is not the pointer. Arrows move it a cell, shift and an arrow move it
five, held keys repeat. Enter does what clicking does — on an empty cell, the menu.

**One highlight, owned by whichever device spoke last.** Two indicators that can disagree
is the failure everyone hits: the mouse sits over one cell, the keyboard over another, and
Enter takes the wrong one. Moving the mouse gives it the highlight; pressing an arrow takes
it back and the pointer is ignored until it moves again.

**Escape returns to where you came from, not to where the pointer is.** Leaving a menu or a
text run should put the cursor back on the cell that opened it. This is the thing that
would otherwise be got wrong by accident: the obvious implementation restores the hover,
and the hover is wherever the mouse happens to be sitting, which is not where the user was.

Moving a tile by keyboard needs its own gesture and is deferred. With a pointer it is
shift and drag, which the camera does not claim.

## Text overflows like a spreadsheet does

A run grows cell by cell as it is typed, and stops at the first cell that already holds
something: text spills into empty neighbours and is cut off at a full one. That is the
spreadsheet convention, and it is right for the same reason — two things cannot be in one
cell, and the alternative is worse.

The alternative is pushing the neighbour aside, which is what should eventually happen,
and it cannot be done yet: pushing needs to know what may be pushed and what may not, and
that is a question about regions and grouping rather than about text. The line-insertion
rule is the primitive it would be built on.

## Moving is an exchange of regions

A move is a proposal to exchange one region of the grid with another of the same size: the
region a tile occupies now, and the region it would occupy. It is legal when **every tile
touching either region is entirely inside it**. Nothing may have cells both in and out of a
region, because such a tile cannot be exchanged without tearing.

One rule, and it subsumes the cases that would otherwise each need their own. Swapping two
tiles of the same size is the case where each region holds exactly one. Moving into free
space is the case where the destination holds none. Dropping a two-cell run half over
another two-cell run is refused, because that run straddles the edge. A two-cell run and
two separate single tiles *can* trade places, because both regions are self-contained.

A region that overlaps its own destination cannot be exchanged with itself, so that is a
slide rather than a swap, and is allowed only into space nothing else occupies.

The proposal returns every move the exchange implies, and they are applied together: a swap
is one act, not two moves that happen to be adjacent.

### Possible later: growing the regions until they close

A refusal today means "these regions are not self-contained". It could instead mean "not
*yet*": when a tile straddles a boundary, expand the region to contain it, and repeat until
nothing straddles. If both regions close at the same size, the exchange is legal after all —
so swapping one cell of a two-cell agent pair with a two-cell run would carry the pair's
other cell along, because that is what makes the exchange whole.

Attractive, and the reason to hold off is the same reason auto-arrangement is a command
rather than a daemon: a region can grow a long way from what was asked for, and moving one
thing should not silently rearrange six. If it is built, it wants a bound and a preview
showing everything it would move — which the proposal already carries.

## Proposed: selecting

Not built. The gestures, because they are one idea rather than three rules:

```
click         select, and click again to deselect
shift+click   do the thing — open a tile, or offer the menu on an empty cell
right-click   the menu
```

For an empty cell, "do the thing" *is* the menu, so shift+click and right-click arriving at
the same place is the same act reached two ways rather than a collision. The plus appears
only while shift is held, so the affordance shows up exactly when the modifier that
triggers it does, and the mapping is visible rather than remembered.

A rectangular selection is made by clicking one corner and shift-clicking the other.

**A selection must not span worktrees.** Every cell in it belongs to the same worktree, or
to none. Note this is *not* the containment rule that governs moving — a selection need not
contain a whole worktree, it simply may not straddle the edge of one.

It must also be self-contained with respect to tiles: nothing may have cells both inside
and outside it, which *is* the move rule, and means the two agree about what a well-formed
region is.

Dragging an agent between worktrees is a separate question and probably disallowed
regardless, since an agent lives in a worktree and moving its tile does not move its
checkout.

**A worktree is selected by a handle in the top-left corner of its plate**, not by its
title. Tying selection to the title would make the title a special object with rules of its
own, and then "what is the official title?" becomes a question the model has to answer. A
handle is just a handle, it costs no cell because it sits in the plate rather than in the
grid, and it is where a selection handle conventionally lives. Selecting a worktree offers
an arrow on each edge to drag it larger, which is already the documented gesture: dragging
an edge is a request for room, and room can always be made.

## Proposed: a run's span is derived, not stored

A run stops at the first occupied cell, and should also stop at the edge of the worktree it
is in — text may not leave its worktree, which is the containment rule that governs moves
and selections applied to growth, and is what makes a worktree a container in fact rather
than in appearance.

But cut-off relief is not a worktree feature and should not be written as one. **Do not
store a span at all.** A run's span is a function of what it says and what is free beside
it:

```
span = min(what the text needs, what is free)
```

Then every case falls out of one rule with nothing to implement per case. Move an agent
away and the run breathes. Expand the worktree and the run breathes. Delete the thing that
was blocking it and the run breathes. There is no expansion logic, because there is no
stored value to expand.

Vertically the same, for a note: its height is the lines its text wraps to, bounded by what
is free below.

**The one hazard**, which needs deciding before this is built: two runs in the same row can
each want to grow into the other, so "what is free" is circular between them. The fix is
that a run is bounded by the *origin* of another tile rather than by that tile's own
derived span, and where two runs still compete, the earlier one wins. Deterministic, and
never mutually recursive.

## Proposed: a note is a title that was given a second line

Rather than being created at some arbitrary block size, a note is what a run becomes when
you press shift and enter while typing it.

The first shift-enter fixes the run's **width** at what had been typed so far — measured at
the run's real cell width, not at the width the editor happened to be projecting, or the
line that triggered it gets clipped by its own act.

After that, width is fixed and height behaves exactly as width does for a title: it grows
by wrapping, it stops at whatever is below it, and while you are still typing, the run
scrolls so the line you are on stays visible and the earlier lines move out of sight. Which
is what a title already does horizontally — the editor shows the end of a line that has
outgrown its span.

So there is one text object, not two. A title is a run that has never been given a second
line. With this, the space it lacks becomes
something a person can grant, in one gesture, at the place where it is missing.
