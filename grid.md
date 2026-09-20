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

Position is `(col, row)`. Not a float pair, not pixels.

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
