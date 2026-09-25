# Choices

The specific decisions behind the grid, as made. Concrete and checkable — not principles,
and not a licence to reason from. If a choice here and a principle elsewhere disagree, the
choice wins, because it was made about something real.

## Camera

1. Wheel zooms, drag pans. d3's defaults, and what felt right when they were rebound the
   other way and tried.
2. `d3-zoom` rather than a React gesture library. The hard part is input normalisation — a
   trackpad pinch arrives as a wheel event with `ctrlKey` set — and d3 has absorbed it.
3. The camera never goes through React state. It writes to the canvas and the tile
   transform directly.
4. Camera and hover repaints coalesce into one animation frame, and the frame paints the
   **latest** camera, not the first of the batch.
5. Zoom range 0.25 to 3.
6. Shift is excluded from the camera's filter, so it can be the move gesture.

## The lattice

7. Painted on one canvas. Never built out of elements.
8. Square cells sharing their edges, no gutter. A gridline is a boundary, not a gap.
9. Rules are 1px, fixed in screen pixels at every zoom.
10. Rules fade out below about 8px of cell and are full above 24px.
11. Rules snap to half-pixels so a one-pixel line lands on a pixel.
12. The neutral ruling is drawn across the page, then each region redraws its own area,
    clipped, in its own hue.
13. Rules inside a text run are **omitted**, not painted over.
14. The lattice is infinite and uniform, independent of which tracks the model holds.

## Colour

15. Hue says which group. Lightness says occupied or not. The mark says what it is doing.
    Nothing else varies.
16. An outline means empty; a fill means occupied. At every hue, in or out of a region.
17. An outline is always the hue of what it outlines.
18. A cell in no region takes the neutral hue. Not a special case.
19. A hue's `edge` must read against that hue's own `fill`, the darkest surface a ring
    ever sits on.
20. One theme table. The stylesheet's custom properties are written from it.
21. The theme follows the system; `t` toggles it; the key is ignored while typing.
22. Dark is re-derived, not inverted.

## Cells and occupancy

23. A cell holds one thing.
24. Position is `(columnId, rowId)`. Never indices.
25. Inserting a track is a splice that touches no stored position.
26. Regions are rectangles in the model, stored as two track ranges.
27. A region is one plate drawn under the lattice, flush with the outer edges of its cells.
28. A tile takes the hue of the region it sits in.

## Hover and focus

29. Hovering an empty cell shows a plus.
30. The focus ring is 2.5px, inset by half its stroke so it sits inside the cell rather
    than growing it.
31. Pointing anywhere in a multi-cell tile rings the whole tile.
32. Hover is suppressed while the menu is open, while text is being edited, and while a
    tile is being dragged.
33. Closing the menu picks the hover back up where the pointer already is, rather than
    waiting for it to move.
34. A click that dismisses something is spent dismissing it. It does not also open a menu,
    place a tile or select a cell. Whether a press is a dismissal is recorded when it
    starts, not when it ends, because an editor commits on blur and blur happens in
    between — by the release, the thing that was open has already gone.

## Relationships

35. No permanent edges. Relationships are shown by focus.
36. Hovering an agent veils everything else — one rectangle, not a decision per cell.
37. Every agent focuses, whether it has links or not.
38. Link lines take one rounded turn. Never diagonal: a diagonal ignores the grid it is
    drawn on.
39. Links end in a dot at both ends, over the tile rather than at its edge, so neighbouring
    agents still show a connection.
40. The dashes crawl. A still line says a connection exists; a moving one says it is in use.
41. The animation loop runs only while something is focused.

## Text

42. Text is its own family, not a kind of occupant. An occupant's host is sized by
    dragging its edges; text is sized by what it says.
43. A **title** is one row and grows sideways. A **note** is a block and the words wrap
    inside it.
44. Text is canvas content, not DOM, so it stays crisp at every zoom.
45. A run's span is derived from its text, measured at the cell's own size so the answer
    does not depend on the zoom it was typed at.
46. Text spills into empty neighbours and is cut off at a full one, as a spreadsheet does.
47. The font size is not rounded — rounding makes glyphs snap between integers while the
    cell scales smoothly, which is visible as a jiggle.
48. The editor is transparent. The canvas owns the surface and the ruling; the input
    contributes a caret and glyphs.
49. The editor reports the span it currently wants, so the ruling opens up as you type
    rather than ahead of you.
50. Committing an empty run removes it.

## The menu

51. Opens at the pointer, not at the cell. It answers a question the pointer asked.
52. Grouped by what a thing is: text, utilities, agents.
53. Typing filters it. The input exists from the moment it opens so no keystroke is lost,
    and is invisible until there is something in it.
54. The first match is always selected, so typing and pressing enter is the whole
    interaction.
55. Hovering moves the selection rather than competing with it. One highlight.
56. Headings match the query too, so "agents" finds both of them.

## Moving

57. Shift and drag moves a tile.
58. Dropping onto an occupied cell swaps. Reversible, and never leaves an invalid state.
59. The preview shows both halves: the tile where it would land, and anything displaced
    where the first came from.
60. Tiles being moved are lifted from their origin, or a swap looks like a duplication.
61. Focus during a drag is the tile being dragged, so its connections stay lit.

## Marks

62. Brand marks come from `@lobehub/icons-static-svg`. A shell is not a brand, so it gets a
    prompt glyph rather than a borrowed logo.
63. Marks are path data drawn on the canvas, and the menu renders the same data as SVG.

## Size

64. Hosts resize by their edges, the same operation as a run, pushing what is beyond.
    Any rectangle: squares were considered and not required, since nothing yet depends on
    the shape. Decided 24 September 2026; supersedes the one-cell tile in
    [grid.md](grid.md).
