# Principles

> These are generalisations drawn after the fact. They do not authorise anything. Where a
> principle here and a decision in [choices.md](choices.md) disagree, the decision wins —
> it was made about something real, and this was inferred from it.

Rules that keep recurring, each with the mistake it prevents. They were all arrived at by
making the mistake first, which is why each one has a failure attached rather than a
justification — a principle without a failure behind it is a preference.

## Name roles, not values

Every colour, size and weight is named by what it *does*: `tint`, `fill`, `line`, `edge`,
`ink`. Never by what it looks like.

**Prevents:** a second theme missing things. Dark is not an inversion — in light a fill is
darker than a tint because ink on paper is darker; in dark an occupied cell is lighter than
its surface. "A fill means occupied" survives the flip. "The darker one" does not.

## One table, checked by the compiler

Which role applies in which state is a table, not a decision taken at each site. A theme is
a typed record, so one missing role does not build.

**Prevents:** completeness by vigilance. Nobody catches every case by reading; a type does.

## A colour cannot be written where it is used

Definitions live in one file. The stylesheet's custom properties are *written from* that
file rather than declared beside it.

**Prevents:** drift between two surfaces that must agree. A canvas palette and a CSS
palette will diverge, and nothing will tell you.

## Decide what scales and what does not

A gap, a radius and a font scale with the cell. A rule, a focus ring and a hit area are
fixed in screen pixels. Every visual quantity is one or the other, deliberately.

**Prevents:** a 15px grab handle becoming 3px at the zoom floor, and a 1px rule becoming a
3px band when zoomed in.

## Draw the current state; never animate toward it

The renderer is immediate mode: every frame draws what is true. The camera writes straight
to the canvas and the DOM, never through the framework's state.

**Prevents:** the worst bug so far. A layout animation library measured screen boxes, so a
camera move looked to it like the tiles had moved, and it sprang them toward their new
positions — tiles visibly lagging behind the cells they sat on.

## Derived state has no transitions

If a thing is a pure function of what is observed, there is no code path for it changing.
The occupant of a terminal, the focus of a hover, the span of a run: all derived.

**Prevents:** a conditional matrix over every transition, and the tile that had to *handle*
its agent exiting and handled it by dying.

## "Nothing special" is a case, not an else-branch

A cell in no region has the neutral hue. A terminal running no agent has the shell
occupant. Both are ordinary members of their set.

**Prevents:** rules that apply to some things and not others, and the branch that says
"outlines are grey except when…".

## One highlight, owned by whichever device spoke last

Never two indicators that can disagree.

**Prevents:** the mouse sitting over one row, the keyboard over another, and enter taking
the wrong one.

## One owner per thing

The canvas owns the surface and the ruling; the text input owns only a caret and glyphs.
The daemon owns a terminal's size; a client only reports what it can measure.

**Prevents:** the bug that recurred three times — something opaque drawn on top of
something already correct. A rule is centred on a cell boundary, so half of it lives
inside the cell; anything that paints over the cell eats it.

## What is canonical is known, not discovered

A run owns whole cells, so which rules fall inside it is known. The ruling omits them
rather than the text painting over them.

**Prevents:** artefacts that should have been impossible. Painting over a line at a
fractional position antialiases differently cell by cell, and the overdraw needed to close
the seams spills into the neighbours.

## Nothing moves unless it was asked to

Tidying the layout is a command. Room is made by inserting a line, which moves things the
minimum a guarantee allows and preserves relative order exactly.

**Prevents:** a packing pass that recomputes everyone's position whenever anything changes,
which contradicts the one property a grid exists to provide.

## Two things cannot be in one cell

Occupancy is the model's invariant. Text spills into empty neighbours and is cut off at a
full one, as a spreadsheet does.

**Prevents:** states the model cannot represent being reachable anyway.

## Prefer reversible to refused

A tile dropped on an occupied cell swaps. Refusing would be safer in a way nothing needs.

**Corollary:** red means *this would be invalid*, not *this would change something*.

## Delete a category rather than restyle one

Floating label tabs were chrome that obeyed none of the grid's rules. Text became a tile
instead, so a word occupies cells and has to be made room for like everything else.

**Prevents:** a growing set of things that are exceptions to the layout.

## Show both halves of what will happen

A move draws the tile where it would land and, if something is there, that one where the
first came from.

**Prevents:** needing a symbol for "swap". Two marks changing places says it, and it
degrades correctly when the target is empty.

## The test for where something belongs

> Would this still be true with no browser open?

Yes: model or service. Only while somebody is looking: surface. This settles terminal size,
layout persistence, camera position and scroll position without further argument.
