# Behaviours

Every specific behaviour of the grid, written as what happens rather than why. Implemented
unless marked **[proposed]**.

This is raw material. The point of writing it out is that these are projections of a
smaller system that has not been stated yet, and the system is easier to see from the
shadows than from an argument about it.

## Pointer over the grid

1. Moving the pointer over a cell marks that cell as hovered.
2. A hovered empty cell draws a ring in its own hue, and a plus in its centre while shift
   is held.
3. A hovered occupied cell draws a ring and no plus.
4. Pointing anywhere inside a tile that spans several cells rings the whole tile, not the
   cell under the pointer.
5. A hovered occupant — agent, terminal or browser — additionally veils everything else back toward the page and draws
   crawling dashed lines to every agent it is linked to, with a dot at each end.
6. Every occupant does this, whether it has links or not. The menu distinguishes agents
   from utilities; the canvas does not.
7. Leaving the viewport clears the hover.
8. Hover is suppressed entirely while: a menu is open, a run is being edited, a name is
   being typed, or a tile is being dragged.
9. Closing a menu re-establishes the hover at the pointer's current position, without
   waiting for it to move.
10. The plus appears only while shift is held. It goes when the window loses focus, since
    the keyup that would clear it goes elsewhere.

## Click

11. Clicking an empty cell selects that cell. Shift-clicking it, or right-clicking it, opens
    the add menu at the pointer: for a place, the act and the menu are the same thing.
12. Clicking a tile selects it. A selection is drawn as a ring with a bracket at each
    corner, in the hue of what it is around; a selected agent keeps its veil and links
    while the pointer is elsewhere.
13. Clicking what is already selected deselects it. Escape clears a selection.
14. With something selected, shift-click on any cell selects the rectangle from the
    selection out to that cell. It is valid on the same terms as a move: one scope or
    none, and nothing half in and half out. An invalid one is drawn in the warning
    colour and cannot be moved.
15. While shift is held over a cell outside the selection, the rectangle a shift-click
    would select is previewed as a crawling dashed outline carrying the corner brackets,
    and no plus or hover ring is drawn. Inside the selection shift means what it always
    means: the plus, the add menu, a move.
15a. The rectangle is closed before it is offered: grown to the bounding box of every tile
    it touches, again until nothing straddles it. So it is invalid only for crossing a
    scope edge, which growing cannot fix.
15b. A press inside an invalid selection is the grid's and goes nowhere. The camera does
    not pan, nothing is carried, and the red ring is the only answer. A click there still
    selects the cell.
16. A press that moves more than 3px is a pan, not a click.
17. A click that dismisses an open overlay is spent dismissing it: it does not also open a
    menu, place a tile or select anything.
18. Whether a press is a dismissal is decided when the press starts, not when it ends.

## Shift-click

19. **[proposed]** Shift-clicking a tile opens it.
20. Shift-clicking an empty cell opens the add menu — the same act the plus offers,
    reached by the modifier that reveals it. With something selected, shift-click extends
    the selection instead.

## Right-click

21. Right-clicking an occupied cell opens the tile menu at the pointer.
22. The tile menu offers rename and delete for an occupant, edit and delete for a run.
23. Right-clicking any cell of a multi-cell tile finds that tile.
24. Right-clicking an empty cell opens the add menu, ringing the cell it is about.
25. The browser's own context menu never appears over the canvas.

## Menus

26. A menu opens at the pointer, not at the cell it is about.
27. The add menu is grouped: text (title, note), utilities (terminal, browser), agents
    (claude code, codex).
28. Typing in the add menu filters it. The input exists from the moment it opens, so no
    keystroke is lost, and is invisible until it contains something.
29. Group headings match the query as well as item labels.
30. The first match is always selected. Enter picks it.
31. Arrow keys move the selection; escape closes.
32. Hovering an item moves the selection to it rather than highlighting separately.
33. The tile menu has no search, being two items.
34. While a menu is open, the thing it is about stays ringed, and if it is an agent, its
    veil and links stay lit. A selection stays ringed as well, separately.
34a. While a menu, a rename or an edit is open, the camera takes nothing: no pan, no wheel,
    until it is closed.

## The key panel

34b. Bottom left, on a translucent blurred surface, a list of what the keys and the pointer
    do right now: one row per meaning, filtered by what the grid is in the middle of.
    Keys are drawn as caps, the pointer as a mouse with the button or wheel in question
    filled in the move colour.

## Placing

35. Picking text from the add menu creates a run at that cell, selects it, and opens it
    for typing, so the selection ring grows with the run.
36. Picking anything else creates that tile at that cell immediately.
37. A tile can only be placed on an empty cell.

## Dragging

38. Shift and drag moves a tile when nothing is selected. A plain drag from inside the
    selection moves the selection, and the camera yields that press. The camera does not
    respond to shift.
39. Anything in a cell can be dragged, including text runs.
40. While dragging, the tile is drawn at the cell under the pointer, at full strength, with
    its own mark.
41. The cell it came from shows whatever is underneath: the page, or the region's surface.
42. If the destination holds something, that thing is drawn where the dragged tile came
    from.
43. Both regions — the one being left and the one being entered — are lit and outlined in
    the move colour.
44. Chevrons flow from one region to the other, and in both directions when something is
    coming back, in two lanes.
45. Chevrons run edge to edge, falling back to centre to centre when there is less than
    one chevron's spacing between the two edges. That is a screen-pixel test, so it
    depends on the zoom as well as on the distance.
46. A refused move is drawn identically in the warning colour, and nothing is shown as
    moved.
47. Releasing a refused move does nothing. Escape during a move cancels it, and the
    release that follows does nothing.
47a. While a move is proposed the selection loses its corner brackets; the proposal says
    "held" instead. A moved region selection becomes the destination on release.
48. Nothing changes colour because of a move that has not happened: a tile's hue is the
    region the model says it is in.
49. While dragging, the dragged tile's links stay lit and stay anchored where the drag
    began.
50. Hover, the plus and the menu are all suppressed while dragging.

## Worktrees, and resizing

50a. A worktree is selected by a square on its top-left corner, straddling the corner
    point, shown while the pointer is inside the worktree or on the square; pointing at
    the square rings the whole worktree and names it, and the cell under the pointer is
    not pointed at. A rectangle selection whose bounds are exactly a worktree's is that
    worktree. Selected, the square gives way to the brackets.
50b. With a worktree selected, its gridlines can be held: an edge within nine pixels, an
    interior line within five, a corner both lines, and two interior lines only within
    four pixels of their crossing. A held line is lit across the worktree with a grip
    under the pointer — a pill along a line, a cross at a crossing, a rounded corner at a
    corner — and no cell is hovered while one is lit.
50c. Dragging a line by whole cells moves it. An interior line only inserts: that many
    empty tracks appear at the line, the far side shifts, the worktree grows at that edge.
    An edge inserts outward the same way and dragged inward removes tracks, pushing the
    worktree's own contents inward and refusing when something would have to leave the
    far side. A corner is both axes, the second on the grid the first would leave. The new
    cells are hatched in the hue; a refusal hatches in red and rings in red.
50d. Pushing: nothing beyond the growing edge moves until it is up against it, then it
    moves by the overlap and passes only that on. Units are a loose tile alone or a
    worktree whole with its contents. It chains along one direction and never fails.
50e. A selected run resizes by the same grips, edges only. Inward shrinks it and the words
    reflow; outward grows it and pushes, refused if it would leave or enter a worktree.
    The axis dragged becomes a cap the editor keeps.
50f. Shift-drag sweeps a rectangle selection, closed as it goes and previewed dashed; with
    something selected it extends from the selection. Plain drag pans everywhere except
    from inside the selection, where it moves.
50g. The veil sits at 68 percent. Menus and the key panel share one translucent surface.

## What a move is

51. A move exchanges one region of the grid with another of the same size: the region the
    tile occupies, and the region it would occupy.
52. It is legal when every tile touching either region is entirely inside it.
53. Swapping two tiles of the same size is the case where each region holds one.
54. Moving into free space is the case where the destination region holds none.
55. A two-cell run and two separate single tiles may trade places.
56. A two-cell run dropped half over another two-cell run is refused.
57. A region overlapping its own destination is a slide, not an exchange, and is allowed
    only into space nothing else occupies.
58. A legal move produces every position change the exchange implies, and they are applied
    together.
59. **[proposed]** A refusal could instead grow both regions until nothing straddles them,
    and succeed if they close at the same size.

## Text

60. A run's height is its lines times its leading, rounded up to whole cells: a title
    takes a cell per line, a note fits several lines in a cell.
61. A run's span is derived from its text, measured at the cell's own size.
62. A run grows cell by cell as it is typed.
63. A run stops growing at the first cell that already holds something; further text is cut
    off, both while typing and once committed.
63a. **[proposed]** A run stops at every worktree boundary, in both directions. Text may
    not leave a worktree, and may not enter one either: crossing from open grid into a
    worktree is as much a boundary as crossing out of one. Every cell a run occupies
    belongs to the same worktree, or to none — which is exactly the rule a selection
    obeys (82).
63b. **[proposed]** A run's span is not stored. It is what the text needs, bounded by what
    is free beside it — so anything that stops blocking a run lets it breathe, whether
    that is an agent moving away, a worktree expanding, or a tile being deleted, with no
    rule per case.
63c. **[proposed]** A run grows sideways while there is room and wraps when there is not,
    if there is a free row below it. With no row below it keeps going sideways and is cut
    with an ellipsis. There is no capped mode to switch into: wrapping is what running out
    of room means.
63c2. **[proposed]** Shift-enter inserts a line break. At any time, in either mode,
    including on the first line. It has nothing to do with width.
63d. **[proposed]** Any run may have extra lines. A title and a note differ only in type
    size — a note is smaller, so more lines fit in the same cell height. Nothing else
    branches on which it is.
63e. **[proposed]** `*italic*` and `**bold**` mark emphasis inline, as markdown writes it.
    Emphasis changes width, so it changes the span a run needs.
64. The ruling is omitted inside a run rather than painted over.
65. While a run is being typed, the canvas still owns its surface and its ruling; the input
    contributes only a caret and glyphs.
66. Committing an empty run removes it.
67. Enter commits. Shift-enter is a line break, kept when the run is drawn. Escape
    abandons, and removes the run if it was new.
68. Clicking away commits.
69. Text takes the ink of whatever region it sits in.

## Names

70. An occupant may be named. Right-click, rename.
71. A name is typed in the place it will sit, at the size it will be.
72. A name is cut with an ellipsis to the one cell its tile occupies. It never spills.
73. A named tile's mark does not move to make room.
74. Names stop being drawn below about 34 screen pixels of cell, fading over the next 14.
75. A run is not named; it is what it says.

## Regions

76. A region is one rounded rectangle drawn under the lattice, flush with the outer edges
    of its cells.
77. A cell inside a region takes the region's tint; an occupied one takes its fill.
78. The ruling continues through a region in the region's own hue.
79. A tile inside a region takes that region's hue for its mark, its ring and its links.
80. **[proposed]** A region is selected by a handle in the top-left corner of its plate.
81. **[proposed]** A selected region offers an arrow on each edge to drag it larger.
82. A region is well-formed when nothing it touches is partly inside it: a tile it touches
    lies entirely within it, and a scope it touches lies entirely within it or entirely
    around it. Never neither. One rule for a selection and for both halves of a move, so
    a selection may hold whole worktrees and loose tiles together, and a move carries
    the worktrees with it.
82a. A proposal judges its destination against the world with the carried things lifted
    out, so a thing may slide over its own old cells.
82b. Tracks are made on demand. Placing or moving something past the last track appends
    tracks; before the first prepends them, and the view shifts by the same distance so
    nothing on screen moves. A run walks as far as its text needs and no artificial
    bound stops it.
82c. An action applies whole or not at all. A proposal is judged once, in the model; apply
    never declines part of a verdict.

## The camera

83. The wheel zooms. Dragging the background pans.
84. Zoom is limited to between 0.25 and 3.
85. Panning and zooming never change the model.
86. The canvas repaints at most once per animation frame, always with the latest camera.
87. A camera move starts nothing animating. Anything already in flight — crawling links,
    flowing chevrons — keeps moving through it.

## What scales and what does not

88. Cell size, font size, mark size and name size all scale with the camera. There is no
    gutter and no corner radius in this grid; both belong to experiment 4.
89. Rules, focus rings, chevrons, link lines and dots are a fixed number of screen pixels
    at every zoom.
90. Rules are at full strength above about 24 screen pixels of cell and gone below 8.
91. Names fade out below about 34.

## Colour

92. Hue says which region a thing belongs to. Lightness says whether a cell is occupied.
    The mark says what occupies it.
93. **[experiment 4]** An outline means the cell is empty, a fill means it holds
    something. Not true here: an empty cell in a region is a tint, an empty cell outside
    one is bare page, and nothing outlines an empty cell at all.
94. A *ring* — hover, selection, focus — is the hue of what it is around. The outlines of a
    proposal's two regions are not: they are the move colour, by 96.
95. A cell in no region uses the neutral hue.
96. The move colour belongs to the act, not to anything on the grid, and is not one of the
    hues.
97. Refusal has exactly one colour and it is used for nothing else.
98. The theme follows the system. `t` toggles it, and is ignored while typing.

## Animation

99. The only things that ever animate are the crawling link dashes and the flowing
    chevrons.
100. Both move on one shared counter, so everything in flight moves together.
101. The frame loop runs only while something is focused or a move is being proposed. It
     schedules nothing when idle.

## Gaps and contradictions

Noted rather than resolved.

- Clicking an occupied cell does nothing, which will change when selection exists.
- Shift is the move modifier and would also become the "do it" modifier.
- A tile can be placed on an empty cell without checking whether a run's span covers it, so
  the model can still reach a state where two things claim one cell.
- A note is created at one cell and cannot be resized, so it has almost no room to wrap in.
- Nothing makes room: a run that needs space stops instead of pushing or inserting.
- Deleting a tile removes it from the grid and nothing else, which cannot be what deleting
  an agent means.
