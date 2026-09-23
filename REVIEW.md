# Review of the behaviours, the systems and the transcript

A second agent's audit, 23 September 2026. Read against:

- the transcript of the session that wrote the docs and experiment-5 (`ad9b6778`, 3504 lines,
  experiment 2 through experiment 5, plus its three subagents)
- `docs/` at `4542e63`
- `experiments/experiment-5` at `a81b335`

Written to be checked, not believed, in the same spirit as `ONBOARDING.md`. Every claim
below names a line.

## Read this first

**The session that wrote these docs is still running.** Its transcript was still being
appended to at 04:06, and it committed to both `docs/` and `experiment-5` at 04:05 and
04:06 while this review was being written. Two agents are editing the same two
repositories. This file is the only thing this review touches.

**Nothing is unpersisted.** `docs/` and every experiment are their own git repositories,
and all six working trees were clean at the time of reading. What does not exist is a
repository at `pane/` itself. Creating one on top of the nested repositories would turn
each into an embedded gitlink, which is worse than what is there now. Leave the layout,
or move to one repository deliberately by deleting the nested `.git` directories, which is
a decision rather than a fix.

## Update: the afternoon reset, and the text redesign

Read against `experiment-5` at `0ebf3d7` plus its uncommitted working tree, `docs/` at
`1007e90`, and the transcript through the writing session's turn at 17:59 UTC.

**Main was reset to `384c96e`.** At 17:42 UTC the user reported chevrons, drag previews
and typing all broken. The writing session hard-reset to the commit before the verifier
fixes and moved the two fix commits to a branch, `verifier-fixes`. That branch is where
section 3's headline lives; on `main` the four repaint effects are present again
(`Grid.tsx:467-491`). The session's own diagnosis was "I rewrote the frame loop blind
alongside six unrelated fixes", which is the same hunk section 3 names. So the finding
was right and is now moot on `main`; it would come back with any cherry-pick from that
branch.

**What that undid.** Only 63 (clip a committed title) and 61 (re-measure after the
webfont) were re-applied, as separate commits. Everything else the verifier found is
false again on `main`: 101 (the frame loop never stops), 9 (nothing hovered after escape
or placing), 86 (two paints per frame while dragging), 46 (a refusal draws one lane), 34
(the add menu rings nothing), 49 (a refused drag drops its links). The doc-only
corrections in `behaviours.md` stand. The 4×3 note in section 3 is gone with the reset,
and the design replacing it is below.

**New on `main`: one boundary primitive.** `available(grid, tileId, home, ci, ri)` in
`model.ts` treats a cell in a different region and a cell holding something else as the
same kind of obstacle, and `columnsFor` and `rowsFor` are built on it. The editor uses
`columnsFor` (`Grid.tsx:57`); `rowsFor` has no caller yet. This matches what the user
asked for, that the primitive is "boundary", not "region". Two things to know about it:

- `available` bounds a run by other tiles' `footprint`, that is, their stored span.
  `grid.md`'s new section says a derived span must be bounded by another tile's *origin*,
  or two runs in one row become mutually recursive. That is correct and the code does not
  do it yet. It is fine today because span is still stored. It becomes the circularity the
  doc warns about the moment 63b is built with `available` as written.
- `rowsFor` requires every cell across the run's width to be clear before a row counts,
  which is the multi-line calculation the user flagged. Right.

**The text redesign, as recorded against what was said.** The user's message covers cut-off
relief as a general behaviour, shift-enter fixing width at the real cell width, and
vertical growth that scrolls while blocked. The transcript adds, and the docs record, five
more pieces: span is derived rather than stored (63b); the boundary rule runs both ways,
so a run may not enter a worktree either (63a); a title may have extra lines too, so
`style` is only a size (63d); `*italic*` and `**bold**` (63e); and the earlier-run-wins
tiebreak for two runs competing in one row (`grid.md`, the hazard paragraph). All five
are marked proposed and none is built. Step 1 of the sequence, "style is only a size", is
applied and uncommitted in `measure.ts` and `paint.ts`.

Three things in that recording to fix:

- `grid.md`'s new section opens by calling the worktree rule "the containment rule that
  governs moves and selections". Two paragraphs later in the same file (`grid.md`, the
  selection section) it says the worktree rule is *not* the containment rule, and 63a
  states it correctly as "same worktree or none". The file now contradicts itself twice.
  The user's own words settle it: this is a **boundary** rule, and it is a different rule
  from containment. It also means an eighth system is emerging that none of the seven
  covers: what a thing may grow into, shared by text growth (63a) and selection (82).
- The last sentence of `grid.md` ("With this, the space it lacks becomes something a person
  can grant, in one gesture, at the place where it is missing") is orphaned from a
  paragraph that was replaced. It belongs to nothing.
- The uncommitted step 1 changes the line-fit test from "the line's centre is inside the
  box" to "the line's top is inside the box" (`paint.ts`, the `ly - leading / 2 >= y + box.h`
  break). For a one-cell note that draws a third line whose lower half is clipped off,
  where the old test drew two whole lines. A half line at the bottom of a committed note
  is a smudge. Titles are unaffected. Worth looking at before committing.

## 1. The message matches the transcript

The message pasted as "the last few messages" is, word for word, the final assistant turn
of the session. Nothing was edited between the transcript and what was shown. The seven
corrections it lists are the seven the user made. The verifier it spawned was real and
its two reports are in the transcript; the fixes it prompted are the two commits above.

## 2. What the message says that is not true, or not true of the code

**"Derivation is the rule every bug today violated."** Overstated by about half. The
bugs that session found, in order: the proposal borrowed the focus veil (a derivation
violation), the drag lived in `paint` (yes), `swapping` was read from the scene the scene
was built from (yes), a bare `return` in the chevron pass skipped the rest of `paint` (a
control-flow error), and `draw` read `acting`/`naming`/`editing` from React state inside a
callback that can never see them (a ref-contract error). The verifier then found nine
more: the frame loop ran forever, titles were never clipped once committed, the add menu
ringed nothing, a refused drag dropped its links, notes never wrapped, two paints per
frame, hover not restored after escape, seeded runs measured before the font loaded, and
the refusal drawing one lane. Of those nine, at most two are about derivation. The claim
is rhetoric, and it matters because the seven systems are being sold partly on it.

**Space claims to generate behaviour 82, and the design doc says it cannot.** The message
says the containment sentence generates "why a selection can't straddle". `grid.md:575-577`
says the opposite, in words the user supplied twenty minutes earlier: a selection must not
span worktrees, and "this is *not* the containment rule that governs moving". The
correction was recorded at 08:26 and then contradicted at 08:46.

**Space absorbs "the occupancy half of 93".** Behaviour 93 has since been marked as not
true of this grid at all. A system cannot absorb a behaviour the same author has disowned.

**"An occupant owns a region, not a cell."** The word already has two meanings in the
docs, and this makes a third. `model.md:93` uses *occupant* for the program inside a
terminal (a shell, Claude Code). `model.ts:22` uses it for a non-text tile and says the
opposite of the message: "it fills a cell, and one cell is all it ever wants". Choice 42
says the same. The message uses it for anything that owns cells. The verifier flagged the
`model.ts` collision independently. Pick a fourth word or fix the other two.

**Gesture describes the proposal, not the code.** "Click selects" is contradicted by
behaviours 11 and 12, both implemented; "shift-click acts" is proposed (19, 20). Only
"right-click opens the menu" and "drag moves" are true today. That is fine as a target,
but `ONBOARDING.md` asks a reviewer to check whether the systems generate the 101
behaviours, and the 101 are "implemented unless marked". Both cannot be checked against
the same list. Say which the systems describe.

**"Drag moves" has a collision the message does not name.** Behaviour 83, implemented:
dragging the background pans. So drag has two intrinsic meanings, and choosing between
them is exactly the "input × what is under the pointer" table the user pushed back on. The
correction says click-then-drag on a selection should move it. With d3-zoom owning every
non-shift drag on the viewport (`camera.ts:35`), that needs the camera filter to know what
is under the pointer, which the current camera deliberately does not.

**"Every input has exactly one owner at every moment"** has counterexamples in the code.
A press under 3px is both a d3 pan and a click (`Grid.tsx:580`; the verifier's finding
11). And the wheel over an open menu still zooms the canvas: `Popup.tsx` stops
`pointerdown` and `pointerup` only, the menu is rendered inside the viewport element that
d3 listens on, and the menu is `position: fixed`. So the canvas zooms while the menu
stays put, and behaviour 26 ("a menu opens at the pointer... about a cell") quietly
stops being true as the cell slides out from under it.

**"Selection should be almost free. No new machinery."** Eight minutes earlier the same
agent, asked how confident it was, said "moderate, and lower than I'd like", that it would
"build it in an hour and we'd spend three finding what it broke", and that the split
should come first. Both can be true: one is about the systems, the other about the code.
The message does not say which, and "no new machinery" will be read as a statement
about the code.

**Presentation's scale rule is not total.** "Quantities about the world scale; quantities
about the interface don't" does not place the legibility thresholds (74, 90, 91), which
are screen-pixel tests that gate world-scaled things. The verifier said this too. Add that
text is drawn at the ruling's alpha (`paint.ts`, the `globalAlpha = rule` block), so text
fades with the ruling, which no behaviour lists.

Minor: Gesture's list "11–25, 38, 16, 25" names 16 and 25 twice.

## 3. The code right now, beyond what the verifier found

**The fix for behaviour 101 deleted the canvas's other four reasons to repaint.** (Now
only on the `verifier-fixes` branch; see the update above.) Commit
`6bdcca3` replaced the always-on frame loop with a pump that runs only while something is
in flight. The same hunk removed four effects and put none of them back: the repaint on
scene change, the `onTheme` subscription, the repaint on `acting`/`naming`/`editing`, and
the window resize handler (`git show 6bdcca3 -- src/Grid.tsx`, the hunk at line 486).
`onTheme` is now imported at `Grid.tsx:24` and never called. `tsc` does not object because
the project does not set `noUnusedLocals`. The next commit's message says "scene changes
go through the same frame coalescing the camera uses"; there is no scene-change path at
all. Every repaint is now triggered by a pointer handler or the pump. Consequences, each
hidden by the fact that the next pointer move repaints:

- Pressing `t` recolours the DOM and not the canvas until the pointer moves. Behaviour 98
  is false for the canvas.
- Enter in a run or a name commits the model and unmounts the input, and the canvas does
  not draw the committed text until the pointer moves. The words vanish for a moment.
  Behaviour 67 ("Enter commits") is true of the model and false of the screen.
- Delete from the tile menu (`Grid.tsx:690`) removes the tile from the model and leaves
  it painted.
- The `fonts.ready` remeasure (`App.tsx`, `store.remeasure`) resizes the seeded runs in the
  model and paints nothing.
- Resizing the window leaves the canvas at its old size until something else draws.

This is one hunk to restore and should come before anything else.

**Two things in one cell is reachable through the interface, by a route the docs do not
name.** (Gone with the reset; the 4×3 note no longer exists.) The gap recorded at the end of `behaviours.md` (a run's span not being checked
on placement) is unreachable, as the verifier showed. But a note is created as a 4×3
block (`model.ts:152`), `addTile` checks only the origin cell (`model.ts:145`), the click
path checks only the clicked cell (`Grid.tsx`, the `cells.get(...)?.occupied` test), and
the editor ignores `room` for notes (`Grid.tsx:72`). Pick "note" on an empty cell beside
an agent and the block overlaps it.

**Text breaks the lightness channel.** Only `occupied` is filled (`paint.ts:292,306`),
and text tiles are excluded from it (`Grid.tsx:275`). A cell under a run is occupied and
drawn as tint or page. Behaviours 77 and 92 and choice 15 ("lightness says occupied or
not") are false for every text cell. Either text cells are not "occupied" in the sense the
colour system means, or the system has a hole. Worth deciding rather than recording.

**Escape may commit.** The editor's Escape calls `onDone` and unmounts the input
(`Grid.tsx:101`), and the input has `onBlur={commit}` (`Grid.tsx:98`). Whether a browser
fires `blur` on a focused element being removed varies. If it does, Escape commits the
draft and behaviour 67's "Escape abandons" is false for a run that already had text.
Undecidable by reading; easy to test.

**`choices.md` still states the experiment-4 colour rule.** Choices 16 and 17 ("an outline
means empty; a fill means occupied... an outline is always the hue of what it outlines")
are what behaviour 93 was corrected to disown and what behaviour 94 was rewritten to
qualify. The behaviours were fixed; the choices were not.

**The mock embeds the mistake `model.md` warns about.** `Tile.kind` is
`claude | codex | shell | browser` (`model.ts:31`). `model.md` says a terminal must not
carry a provider field. `model.ts` acknowledges the mock status for links but not for
kind. None of the seven systems touches identity, which the message itself notes for
deletion; the same gap covers what a tile *is*.

The verifier's twelve unlisted behaviours all check out on re-reading, and three are worth
lifting into `behaviours.md` as they stand: the world is 18×11 and cells beyond it accept a
hover, a plus, a menu and a drop, and then silently do nothing (`store.ts:43,84`);
right-button and middle-button drags pan; and deleting a tile leaves its links in the
model.

## 4. The verifier's second report, which the session had not yet read

Its coverage table puts 32 of the 91 implemented behaviours under no system, in five
clumps: the catalogue and list discipline of the menus, the animation clock, text
geometry, editing and naming, and the camera. It also finds that Room generates zero
behaviours, that Proposal covers one operation and computes its verdict twice
(`Grid.tsx`, two independent `proposeMove` calls in `onMove` and `onUp`), and that the
move colour is twelve units from the orange hue's edge in one channel (`theme.ts`), so
behaviour 96 fails against the orange region.

I agree with all of it. One addition: the clock clump should include *when the canvas
draws at all*, because section 3 shows that question has no owner in the code and just
lost four of its answers without anyone noticing.

## 5. Where the behaviours list stands

After the two correction commits, the unmarked behaviours I re-checked hold except:

| # | Status |
|---|---|
| 26 | Not while the wheel is used over an open menu (section 2) |
| 37 | A note can be placed over other tiles (section 3) |
| 67 | Enter leaves the canvas stale; Escape may commit (section 3) |
| 77, 92 | False for text-occupied cells (section 3) |
| 98 | True of the DOM, false of the canvas (section 3) |

## 6. Third-party claims

The transcript's evidence for "xterm's WebGL addon ignores `lineHeight`" was a search
result titled "Support lineHeight in DOM renderer · Issue #1700", which is about the DOM
renderer. I could not settle the WebGL claim from a search either. It belongs to
experiment 2 and does not touch anything here, but it is listed in `ONBOARDING.md` as
researched and it was not.

## 7. What to do with this

1. Restore the four effects deleted in `6bdcca3`. One hunk.
2. Decide what "occupant" means, once, and change the other two uses.
3. Decide whether the systems describe the code or the target, and say so at the top of
   whatever document they end up in. The verifier's coverage table is only meaningful
   against one of them.
4. Fix choices 16 and 17, or mark them as experiment 4 the way behaviour 93 was.
5. Add the note-placement hole and the text-lightness hole to the gaps at the end of
   `behaviours.md`, and remove the span-placement gap, which is not reachable.
