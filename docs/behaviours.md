# Behaviours

Every specific behaviour of the grid, written as what happens rather than why. Implemented
unless marked **[proposed]**; checked against `experiment-5` at the commit this file was
last touched in.

This is raw material. The point of writing it out is that these are projections of a
smaller system, and the system is easier to see from the shadows than from an argument
about it. Where a behaviour is a consequence of a rule already stated, it says which.

## Cells, regions, items, scopes

1. A cell is a position. A region is a rectangle of cells, and is a value: two things at
   the same place have the same region.
2. An item owns a region. A host owns one cell. A run owns the cells its words need.
   Nothing anywhere treats one cell as a special size. A host is a place with a surface,
   a terminal or a webview: what it holds — a shell, a browser page, Claude Code, Codex —
   is a fact the runtime observes, not a property of the tile, and its mark is that
   occupant's. A host with nothing in it shows its surface's idle occupant: a terminal,
   its shell.
3. A scope — a worktree — is a named region that items belong to. An item is in a scope
   when its region lies within the scope's bounds.
4. A cell holds at most one item. The model's rule: a cell is held by whichever tile's
   extent covers it, and a place onto a held cell is refused, whether the cell is a host's
   or the second cell of a run.
5. A region is well-formed when nothing it touches is partly inside it: an item it
   touches lies entirely within it, and a scope it touches lies entirely within it or
   entirely around it. Never neither. This is the one rule for a selection and for both
   halves of a move.
6. Closure: the smallest well-formed region containing a region, found by growing to the
   bounding box of everything it partly touches, again until nothing new is touched.
7. Tracks are made on demand. Anything placed or moved past the last track gets tracks
   appended; before the first, prepended, which shifts every index while every stored
   position stays the same, and the view shifts by the same distance so nothing on
   screen moves.

## Pointer over the grid

8. Moving the pointer over a cell marks that cell as hovered, unless something else is
   pointed at instead: a scope's handle, or a gridline of the selected scope or run.
9. A hovered empty cell draws a ring in its own hue, and a plus in its centre while shift
   is held. The plus goes when the window loses focus, since the keyup that would clear
   it goes elsewhere.
10. A hovered item draws a ring around the whole of it, whichever cell was touched, and no
    plus.
11. A hovered occupant additionally veils everything else back toward the page and draws
    crawling dashed lines to every occupant it is linked to, leaving from its edge and
    ending in a dot at each end. Every occupant does this, linked or not; the add menu
    distinguishes agents from utilities and the canvas does not.
12. Nothing inside the selection is hovered: no ring on a cell or an item, no veil, no
    links. The selection is already the thing pointed at, and a press there moves the
    whole of it. Inside a valid selection the cursor is a grab hand, or the arrow while
    shift is held, since shift-click there acts rather than moves; while carrying, the
    hand closes.
13. While something is selected, hovering an occupant outside it rings it but does not
    move the veil to it.
14. Leaving the viewport clears the hover.
15. Hover is off while a menu is open, a run is being edited, a name is being typed,
    anything is being dragged, a rectangle is being swept, a gridline is lit, or a scope's
    handle is pointed at.
16. Whatever closes a menu — Escape, picking, clicking away — hover picks back up where
    the pointer already is.

## Selection

17. Clicking an item selects it. Clicking an empty cell selects that one cell. Clicking a
    scope's handle selects the scope.
18. Clicking anywhere inside the selection clears it. Escape clears it.
19. A selection is drawn as a ring in the hue of what it is around, with a bracket at each
    corner. A selected occupant keeps its veil and links while the pointer is elsewhere.
20. With something selected, shift-click on a cell outside it selects the rectangle from
    the selection out to that cell, closed (6). Shift-drag from anywhere sweeps one out,
    closed as it goes; with something selected the sweep extends from the selection.
21. While shift is held over a cell outside the selection, or a sweep is in progress, the
    rectangle that would be selected is drawn as a crawling dashed outline carrying the
    corner brackets, and no plus or hover ring is drawn. Inside the selection shift means
    what it always means.
22. A selection is valid when it is well-formed (5). Since it is offered closed, it is
    invalid only when closing ran into something it could not include. An invalid one is
    drawn in the warning colour.
23. A press inside an invalid selection belongs to the grid and goes nowhere: no pan, no
    move, no preview. A click there still selects the cell.
24. A rectangle selection whose bounds are exactly a scope's is that scope.
25. Picking text from the add menu, or editing a run, makes that run the selection, so
    the ring grows with it as it is typed.
26. Deleting the selected item clears the selection.

## Click, shift-click, right-click

27. A press that moves more than 3px is a pan or a drag, never a click.
28. A click that dismisses an open overlay is spent dismissing it: it does not also open a
    menu, place anything or select anything. Whether a press is a dismissal is decided
    when it starts, not when it ends.
29. Shift-click on an empty cell opens the add menu at the pointer: for a place, the act
    and the menu are the same thing. With something selected and the cell outside it,
    shift-click extends instead (20).
30. Shift-click on an occupant opens it (105). A run does not open.
31. Right-click on an item opens the tile menu at the pointer, whichever of its cells was
    hit. Right-click on an empty cell opens the add menu. The browser's own context menu
    never appears over the canvas. Only the primary button presses on the grid: a
    right-button press selects nothing and starts nothing.
32. The tile menu offers rename and delete for an occupant, edit and delete for a run.

## Menus

33. A menu opens at the pointer, not at the cell it is about, and rings what it is about:
    the item, or for the add menu the cell.
34. The add menu is grouped: text (title, note), utilities (terminal, browser), agents
    (claude code, codex). Everything but text is an occupant from the registry, grouped by
    whether it is an agent; a new one is one folder and one line there.
35. Typing in the add menu filters it. The input exists from the moment it opens, so no
    keystroke is lost, and is invisible until it contains something. Group headings match
    the query as well as item labels.
36. The first match is always selected. Enter picks it. Arrow keys move the selection;
    Escape closes. Hovering an item moves the one selection rather than adding a second.
37. The tile menu has no search, being two items.
38. While a menu is open, the thing it is about stays ringed, an occupant keeps its veil
    and links, and the selection stays ringed as well.
39. While a menu, a rename or an edit is open, the camera takes nothing: no pan, no wheel,
    until it is closed.
40. Menus and the key panel share one surface: translucent, blurred, the same in both
    themes.

## The key panel

41. Bottom left, a list of what the keys and the pointer do right now, one row per
    meaning, filtered by what the grid is in the middle of: nothing selected, something
    selected, a scope or run selected, an invalid selection, a drag, the add menu, the
    tile menu, typing.
42. Keys are drawn as caps with words on them — `shift`, `enter`, `esc` — and the pointer
    as a mouse with the button or wheel in question filled in the move colour.

## Placing

43. Picking text from the add menu creates a run at that cell and opens it for typing (25).
    Picking anything else creates a host with the surface that occupant needs and, unless
    the occupant is what that surface shows anyway, asks the runtime to start it there;
    the mark follows what is observed.
44. An item can only be placed on an empty cell. Placing past the last track makes tracks
    (7).

## Moving

45. A plain drag from inside the selection moves the selection. A plain drag anywhere
    else, item or not, pans, so there is always somewhere to pan from. The camera yields
    the press inside the selection and no other.
46. A move exchanges the selection's region with the region it would occupy, of the same
    size, carrying everything inside: items, and whole scopes with their contents.
47. It is legal when both regions are well-formed (5). The destination is judged in the
    world with the carried things lifted out, so a thing may slide over its own old
    cells.
48. A region overlapping its own destination is a slide, not an exchange, and is allowed
    only into space nothing else is in.
49. Swapping two items of the same size, moving into free space, a two-cell run trading
    places with two single items, and a two-cell run dropped half over another being
    refused, are all cases of 46 and 47.
50. A legal move produces every position change the exchange implies, applied together.
    An action applies whole or not at all: a proposal is judged once, in the model, and
    apply never declines part of a verdict.
51. While dragging, everything carried is drawn where it would land, at full strength,
    words included. The cells it came from show whatever is underneath. If the destination
    holds something, that is drawn where the carried things came from.
52. Both regions are lit and outlined in the move colour, and chevrons flow from one to
    the other, in two lanes and both directions when something comes back.
53. Chevrons run edge to edge, falling back to centre to centre when there is less than one
    chevron's spacing between the edges. A screen-pixel test, so it depends on the zoom.
54. A refused move is drawn identically in the warning colour, and nothing is shown as
    moved. Releasing it does nothing.
55. Escape during a move cancels it, and the release that follows does nothing.
56. While a move is proposed the selection loses its corner brackets. On release a region
    selection becomes the destination; an item or scope selection follows itself.
57. Nothing changes colour because of a move that has not happened: an item's hue is the
    scope the model says it is in.
58. A carried occupant's links stay lit and stay anchored where the drag began.
59. **[proposed]** A refused move could grow both regions until they close, and succeed if
    they close at the same size. Selection already closes (6); moving does not.

## Scopes

60. A scope's plate is one rectangle, not rounded, drawn under the lattice, flush with the
    outer edges of its cells. A cell inside it takes the tint; an occupant's cell takes
    the fill. The ruling continues through it in its own hue.
61. An item inside a scope takes that scope's hue for its mark, its ring, its links and
    its ink.
62. A scope has a name in the model. The runs inside it are text, not its name.
63. A scope's handle is a square straddling its top-left corner point, shown while the
    pointer is inside the scope or on the handle, and gone while the scope is selected.
    Pointing at the handle rings the whole scope, shows its name above the corner, and
    points at no cell.
64. A scope moves as part of a selection that contains it whole (46), bounds and contents
    together. Two same-sized scopes may swap.

## Resizing

65. With a scope or a run selected, its gridlines can be held: an edge within 9 screen
    pixels, an interior line within 5, a corner both lines, and two interior lines only
    within 4 pixels of their crossing. A run offers its edges only.
66. A held line is lit across the whole thing at the focus weight, with a grip under the
    pointer that follows it: a pill along a line, a cross at a crossing, two arms into
    the corner at a corner. No cell is hovered while a line is lit, and the cursor says
    which resize it is: across for a column line, down for a row line, diagonal at a
    corner, four-way at a crossing.
67. Dragging a line by whole cells moves it. An interior line of a scope only inserts:
    that many empty tracks appear at the line, the part on the far side shifts, and the
    scope grows at that edge. An edge inserts outward the same way.
68. An edge dragged inward removes that many tracks. The scope's contents are pushed
    inward ahead of the edge (70), and the resize is refused when something would have
    to leave the far side.
69. A corner is both axes at once, the second proposed on the grid the first would leave.
70. Pushing: nothing beyond a growing edge moves until it is up against it; then it moves
    by the overlap and passes only that on. Units are a loose item alone, or a scope whole
    with its contents; nothing is ever pushed out of its scope. It chains along one
    direction, so it cannot cycle, and it never fails.
71. The cells being made are hatched in the hue; a shrink hatches the cells going. A
    refusal hatches in red and rings the thing in red. A legal resize gets no second ring.
72. A run resizes by its edges through the same operation. Inward shrinks it and the
    words reflow; outward grows it and pushes, and is refused if the run would leave or
    enter a scope. The axis dragged becomes a cap the editor keeps; a capped width
    re-derives the height whenever the width changes.
73. Escape during a resize cancels it.

## Text

74. A title and a note differ only in type size. One drawing path, one editor, and nothing
    else branches on which a run is.
75. A run's width is what its words need, bounded by what is free beside it, unless a cap
    fixes it. Its height is its lines times its leading rounded up to whole cells, bounded
    by what is free below, unless a cap fixes it. Text is measured by arithmetic: the face
    is monospace and every glyph advances 0.6 em, so a line's width is its length times
    its size times 0.6, and no canvas is asked.
76. A run grows cell by cell as it is typed. It stops at the first cell that already holds
    something, and at every scope boundary in both directions: text may not leave a
    scope, and may not enter one.
77. A run that runs out of width wraps if there is room below at that width. When there
    is no room in either direction, the words are cut with an ellipsis, on both axes,
    while typing and once committed.
78. Shift-enter is a line break, kept when the run is drawn. Enter commits. Escape
    abandons, and removes the run if it was new. Clicking away commits. Committing an
    empty run removes it.
79. The ruling is omitted inside a run rather than painted over. While a run is being
    typed the canvas still owns its surface and its ruling; the input contributes only a
    caret and glyphs, and reports its draft, which the scene lays out like any run.
80. Text takes the ink of whatever scope it sits in.
81. A run's span is not stored at all: what the text needs, bounded by what is free, so
    anything that stops blocking a run lets it breathe with no rule per case. Move a host
    away and the run grows; undo and it is cut again. Two runs in one row are bounded by
    the later one's origin and the earlier one's extent, in tile order. A cap is the only
    stored size.
82. **[proposed]** `*italic*` and `**bold**` mark emphasis inline. Emphasis changes width,
    so it changes the span a run needs.

## Names

83. An occupant may be named: right-click, rename. A name is typed in the place it will
    sit, at the size it will be.
84. A name is cut with an ellipsis to the one cell its item occupies. It never spills, and
    the mark does not move to make room for it.
85. Names stop being drawn below about 34 screen pixels of cell, fading over the next 14.
86. A run is not named; it is what it says.

## The camera

87. The wheel zooms. Dragging the background pans. Zoom is limited to between 0.25 and 3.
88. Panning and zooming never change the model.
89. Everything repaints at most once per animation frame, always with the latest camera.
    A camera move and a scene change in the same frame are one paint.
90. A camera move starts nothing animating. Anything already in flight keeps moving.

## What scales and what does not

91. Cell size, font size, mark size and name size scale with the camera. There is no
    gutter and no corner radius in this grid.
92. Rules, rings, brackets, chevrons, lanes, link lines and dots, grips, handles, hatching
    and the key panel are a fixed number of screen pixels at every zoom.
93. Legibility thresholds are screen-pixel tests that gate world-scaled things: rules are
    at full strength above about 24 screen pixels of cell and gone below 8, and text,
    rings and proposals go with them; names fade out below about 34.
94. Menus and the key panel live in screen space: at the pointer, and at the corner.

## Colour

95. Hue says which scope a thing belongs to. Lightness says whether a cell holds an
    occupant. The mark says what occupies it. A cell under a run is held but not
    lightness-marked, which is a hole in this rule.
96. A cell in no scope uses the neutral hue, as an ordinary member of the set.
97. A ring — hover, selection, focus, a menu's subject, a lit line — is the hue of what it
    is around. A proposed move's outlines and chevrons are the move colour instead.
98. The move colour belongs to the act, not to anything on the grid, and is not one of the
    hues. It is also the colour of the pointer's part in the key panel.
99. Refusal has exactly one colour, used for a refused move, an invalid selection and a
    refused resize, and nothing else.
100. The veil pushes everything outside a focus 68 percent of the way to the page.
101. The theme follows the system. `t` toggles it, and is ignored while typing. Every
     colour, canvas and DOM, comes from one typed table.

## Animation

102. The only things that animate are the crawling link dashes, the flowing chevrons and
     the crawling outline of a selection being previewed.
103. All of them move on one shared counter, so everything in flight moves together.
104. A frame is requested only while something animates: a focus, a proposal or a
     previewed selection. Each animated frame asks for the next itself and stops asking
     when nothing animates, so an idle canvas requests no frames and paints nothing.

## Opening

105. Shift-click on an occupant opens it: a panel appears exactly over the tile, at whatever
     zoom, and scales up to fill the viewport 24 screen pixels short of each edge. Inside
     the selection shift still means act, so a selected occupant opens the same way.
106. The panel is one element at its full size, shown as a transform of itself, so nothing
     reflows and nothing inside is measured on the way. What is inside fades in once the
     panel has arrived. For now what is inside is nothing.
107. Cmd-Escape closes it, and so does Cmd-period, and so does a press anywhere outside the
     panel. Escape alone does nothing: it belongs to what is inside. Closing retraces the
     same path back to the tile, and the panel is gone when it arrives.
108. While a tile is open the grid and the camera see nothing: no hover, no press, no pan,
     no wheel, no Escape.
109. The key panel fades and settles a few pixels down while a tile is open, and comes back
     the moment the close begins, not when it ends.

## History

110. Every change to the grid is a command, judged by the model and applied whole or not
     at all: move, resize, place, remove, set text, set name. The store keeps the grid as
     it was before each one.
111. Cmd-Z restores the grid as it was before the last command. Cmd-Shift-Z restores what
     the last undo replaced. A new command drops what could have been redone.
112. Undo restores the selection the change was made with, along with the grid; redo
     restores what was selected when the change was undone. Selecting on its own is not
     a step. The camera is not undone. Neither key does anything while typing or while a
     tile is open.
113. The key panel lists undo when nothing is selected.

## Gaps and contradictions

Noted rather than resolved.

- A cell under a run is not lightness-marked (95).
- A cap on a run can be set by dragging and cannot be lifted.
- A run stops when it runs out of room while typing. Only a resize pushes; typing does not.
- A scope's name is in the model and cannot be edited from the grid.
- Deleting an item removes it from the grid and nothing else, which cannot be what deleting
  an agent means.
