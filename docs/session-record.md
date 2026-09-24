# Session record

What happened, what Joshua asked for, and what he pushed back on. Written at the end of a
long session so the reasoning survives the conversation. His positions are recorded as
positions, not as conclusions I reached — most of them were corrections to something I had
got wrong.

## What was built

**experiment-4** — a grid of rounded cells with gutters, on a canvas, under a `d3-zoom`
camera. Superseded but runnable.

**experiment-5** — the live one. A ruled grid: square cells sharing edges, painted on one
canvas. Regions, occupants with brand marks, text runs, a menu, moving with previews, link
visualisation, light and dark. Frontend only; everything on it is a mock.

The route between them: experiment-4's opening animation was a camera flight, which was
wrong; it became a pane expanding in place. Then the whole thing was rebuilt as a ruled
grid, which also answered a performance question by drawing dozens of lines where it had
drawn hundreds of rounded rectangles.

## Joshua's positions, recurring

These came up more than once, usually as a correction.

**Design rules must be specific, not philosophical.** On a document of generalisations:
*"sounds more like I took the design rules and pushed them through an AI-straw… agents are
going to take these rules and then use them to justify some diabolical stuff."* The record
that matters is the ledger of what was decided — `choices.md`, `behaviours.md` — and
`principles.md` was demoted to say explicitly that it authorises nothing.

**A fix should usually make the system smaller.** Late in the session, after eleven
consecutive net-positive commits: *"most of these fixes should really be simplifications of
the architecture, and we've been adding code each time."* True and measured: `src` went
from about 2,017 lines to about 2,500. The cause is that the correct implementation kept
being added *beside* the incorrect ones rather than replacing them.

**Behaviours are shadows of a simpler system.** *"these specific behaviors are incomplete
shadows/projections of a simpler, broader set of 'systems'… sometimes we need to start by
piecing individual behaviors we like together, and gradually revealing the shape."* This
produced `behaviours.md` and the seven-system proposal.

**When something looks impossible, the model is wrong.** Said repeatedly, and right every
time: *"how is this even possible?"* about a swap that lit one cell and not another, *"what
kind of design code would let THAT happen"*, *"this shouldn't even be possible."* Each was a
real structural fault, never a cosmetic one.

**If a thing has to be specified, the abstraction is off.** On what a vacated cell should
show: *"the blank of whatever worktree is behind it, although if you have to specify that,
your overall abstraction may be off."* It was. Paint stopped knowing about dragging
entirely.

**Verify rather than assert.** He asked for an independent agent to check the docs against
the code, and for an onboarding document to point it at. That review found ten false
claims, four of which were live bugs.

## Specific things he asked for or corrected

Roughly in order.

1. **Fixed-size panes**, each a live agent, rather than a dot behind a click.
2. **Opening a pane should expand it in place**, not fly the camera to it — *"same vibe as
   a modal except maybe more refined."*
3. **Opening should scale, not resize.** *"you are literally zooming into the screen… the
   text would ideally appear smaller."*
4. **Cmd for application shortcuts**, because Escape belongs to the TUI.
5. **Grid with real gridlines**, square cells, no boxes.
6. **Tiles, not agents** — a tile is a terminal; what runs in it can change.
7. **Deleting is unresolved** for anything with a persistent identity.
8. **Regions are a plate, then tinted cells, then a drawn rectangle** — settled by rejecting
   merged cells: *"I actually do not like the merged cells at all."*
9. **An outline should be the hue of what it outlines.**
10. **Text as a tile**, replacing floating label tabs: *"instead of using weird tags for
    labels, just utilize part of the graph as labels."*
11. **Text is its own family**, because a title grows sideways and a note is a block —
    different geometry, not a different style.
12. **Type-to-search in the menu**, with the first result preselected.
13. **Click selects, shift-click acts, right-click opens the menu** — and the plus appears
    only while shift is held, so the affordance shows when the modifier does.
14. **A selection may not span worktrees** — not "must contain one", which was my error.
15. **Worktrees are selected by a corner handle**, not by their title, because tying
    selection to a title makes the title a special object.
16. **Moving exchanges two regions of the same size**, legal when every tile touching either
    is entirely inside it. His rule, and it replaced three special cases of mine.
17. **Chevrons flowing along a move**, orange, in two lanes when it is an exchange.
18. **A proposal should light and outline both its regions** — *"why would we ever have to
    do otherwise?"*
19. **Light and dark, done so nothing is missed.**
20. **Text stops at every worktree boundary, both ways**, and at anything occupied — one
    notion of boundary, not two.
21. **A run's span should be derived, not stored**, so anything that stops blocking it lets
    it breathe.
22. **Wrapping is what running out of room means** — with a free row below, wrap; without
    one, keep going sideways and cut.
23. **Shift-enter is just a line break**, unrelated to width.
24. **`*italic*` and `**bold**`.**
25. **An ellipsis when text is cut**, not a hard truncation.
26. **A drag must remember where in the tile it was grabbed.**

## What is unresolved

- **Who owns text.** The canvas draws a run and a DOM element edits it, and they must agree
  about width, leading, wrapping, breaks and the pointer. Every text bug has been those two
  disagreeing. This is an unmade decision rather than a bug.
- **Room** — how space is made. Designed in `grid.md`, built nowhere. Three behaviours end
  in "it just stops" because of it.
- **Delete** — undefined for anything with an identity.
- **Selection** — designed in full, built not at all.
- **The duplication** — containment exists three times, and `relight`/`restore` are one job
  written twice. Both are deletions, and both are the next thing worth doing.
