# The data layer

Written from scratch. This is the part that has to be right before anything is built on
top of it.

## The mistake to avoid

Experiment 2 spawned `claude` as the process inside the PTY. So the tile *was* the agent,
and the consequences were not subtle:

- Ctrl-C out of Claude Code exits the process, the PTY closes, and **the tile is dead
  permanently**. There is nothing underneath it to type to. Verified: the daemon reports
  `exit 0` and every keystroke after that goes nowhere.
- The tile shows a provider mark forever, because "which provider" was a property of the
  tile. If the thing running changes, the mark lies.
- An agent could never move, be resumed elsewhere, or exist while not on screen, because
  it had no identity apart from the tile that happened to be showing it.

All three are the same error: **conflating a place to run things with a thing that is
running.**

## Three concepts, not one

| | What it is | Lifetime |
|---|---|---|
| **Terminal** | A PTY with an identity, a working directory, a grid position and scrollback. A *place*. | Until you close the tile |
| **Program** | Whatever is in the terminal's foreground right now — a shell, Claude Code, `vim`. | Seconds to hours. Changes constantly |
| **Agent** | A persistent logical identity: a provider, a resumable session, a history. | Independent of any terminal |

A tile is a **terminal**. Not an agent, not a provider.

## A terminal runs a shell

The terminal's process is the user's shell. Agents run *inside* it.

This one decision buys everything above. Ctrl-C out of Claude Code returns you to a
prompt, because the prompt was always there. The tile survives its occupants. You can
start something else, or the same thing again, or nothing. It is how a terminal has always
worked, and there was never a reason to depart from it.

## What is running is observed, never declared

Because the user can type `claude` themselves, and because a program can exit without
telling anyone, a terminal's current program cannot be a field somebody sets. It is a fact
to be read: the foreground process of the PTY, found by walking the process tree from the
shell's pid.

Anything derived from it — a provider mark, a label, whether an agent is alive — is derived
from that observation, so it cannot drift from reality. A mark that lies is worse than no
mark.

## Agents are hosted, not contained

```
Agent  --hosted_by-->  Terminal      current, mutable, may be absent
Terminal               hosts 0 or 1 agent at a time
```

An agent with no host is not gone; it is offline, with a session that can be resumed into
whatever terminal you like. The identity is the agent's, not the tile's, and it is what
messages, provenance and history refer to. Moving an agent is a change of host, not a new
agent.

Discreteness and monitoring follow from this: an agent is one row with one id and an
append-only history of what it did and where, rather than something inferred from whatever
is on screen.

## Avoiding the decision tree

The failure mode to design against is not a bug, it is a shape. Left alone, this grows a
conditional matrix: *if the program is Claude do this, if it is Codex do that, if it is a
shell do the other, if it was Claude and now is a shell then clean these things up.* Every
new provider multiplies it, and every transition adds a branch nobody tests.

Two rules remove it. Neither is a tidier decision tree; both mean there is no tree.

### Derived state has no transitions

If the occupant of a terminal is a **pure function of what is observed** — the foreground
process, plus the sessions we know about — then "what happens when the user Ctrl-Cs out of
Claude Code" is not a code path at all. It is just the next observation returning something
different.

There is no exit handler, no teardown sequence, no transition table, because nothing is
being transitioned. Anything cached from the old occupant was derived, so it is simply
recomputed.

The bug in experiment 2 is the shape this prevents: the tile had to *handle* its agent
exiting, and it handled it by dying.

### "Nothing special" is an occupant, not an else-branch

Every terminal always has exactly one occupant. A plain shell is an occupant like any
other, with its own mark, label and controls — not the absence of one.

```
Occupant {
  mark            what the tile shows
  label           what it is called
  controls        the actions offered, as data
  ops             interrupt, resume, fork, ... as the occupant supports them
}
```

The tile renders `occupant.mark` and `occupant.controls`. It never asks what kind of
occupant it has, because that question has no consumer. Adding Codex adds a descriptor;
adding a shell adds a descriptor; neither adds a branch.

This is also what makes the behaviour the philosophy asks for fall out for free: a terminal
hosting an agent offers agent controls, and the moment the agent is gone it offers terminal
controls — not because anything switched, but because the occupant is re-derived and the
controls are its data.

The general form: **capabilities as data, not types as conditions.** A control exists
because an occupant declares it, never because the UI recognised a provider.

### Where edge cases are allowed

Some will be real — a provider that cannot be resumed, one that needs a different interrupt
sequence. Those belong inside that provider's descriptor, where they are one object's
problem. They must not reach the tile, the grid, or the daemon's core, because that is how
a local quirk becomes a global conditional.

## What the first version models

**Terminals only.** Tiles you can start terminal instances in. That is the whole thing.

Agents are not modelled yet, because nothing yet needs them. What matters is that
terminals are modelled *correctly*, so that adding agents later is additive:

- A terminal must not carry a provider field. Provider belongs to an agent, or to an
  observation of what is running.
- A terminal must not die when a program inside it exits.
- A terminal's identity must not be its position, since tiles move.

The seam where agents attach is a nullable `hosted_by`. One field. That is the difference
between a model that extends and one that gets rewritten.

```
Terminal {
  id
  cwd
  cols, rows
  status      live | exited
  created_at
}
```

Position lives beside it, owned by the layout, not by the terminal.

## Events

Every state change is recorded rather than only applied: terminal opened, terminal closed,
program started, program exited, and later agent started, agent exited, agent moved. This
is what "very monitored" has to mean concretely — current state says what is true, history
says how it got that way.

Cheap to add now, and close to impossible to reconstruct later.

## Who owns a terminal

The daemon owns the terminal. The browser renders it.

There is a test that settles every case, and it is worth applying rather than arguing:

> **Would this still be true with no browser open?**

If yes, it belongs to the daemon. If it only matters while somebody is looking, it belongs
to the client.

| Daemon | Client |
|---|---|
| The PTY, the process, the shell | Font rasterisation |
| Scrollback and the screen's current state | Scroll position, selection |
| The occupant, and the cwd | Which tile is currently open |
| Lifecycle: open, close, exit | Camera: pan and zoom |
| Grid position | |
| The authoritative `cols` x `rows` | |

Everything in the left column survives a closed laptop lid. Everything in the right is
recreated from scratch on the next page load and nobody notices.

### Why the screen exists in two places

The daemon runs a headless emulator per terminal; the browser runs an xterm. That is not
duplication, it is the split working correctly: the daemon's emulator is **authoritative
state**, the browser's is a **projection** that can be thrown away and rebuilt from a
snapshot at any moment. Attaching already does exactly that.

Input goes the other way and does not blur it either. Keystrokes *originate* at the client
because that is where the keyboard is; they are *applied* by the daemon, which is where the
PTY is. Originating is not owning.

### The one place this is currently violated

Size. Today the browser measures its own font, computes the `cols` x `rows` that fit its
pane, and tells the daemon to resize. The daemon obeys. So a terminal's true dimensions are
set by whichever view spoke last — which fails the test above, and would fail outright the
moment two clients with different window sizes attach to the same terminal. It is the
classic multiplexer problem, imported for no reason.

**Size is the daemon's, derived from things the daemon already owns.** A terminal's grid
follows from its tile's span in cells, which is layout, which lives in the daemon. The one
piece the daemon cannot know is how large a character actually renders, since that depends
on the font and the display.

So: a client reports its cell metric **once, per client, at connect** — not per terminal,
not per resize. The daemon combines that with the tile span it already owns and decides.
The client contributes a measurement; the daemon makes the decision. When several clients
disagree, the daemon arbitrates, exactly as a multiplexer does.

This also removes the attach dance. The daemon does not need to be told a grid and then
serialise for it, because it already knew the grid.

## Resizing

Resizing a terminal *is* resizing its tile. One concept, not two.

Dragging a tile's edge changes its span in cells; the daemon recomputes `cols` x `rows`
from the new span, sets the PTY's window size, and the program is told by `SIGWINCH` and
redraws. The ordinary path every terminal emulator walks. Because room can always be made
(see grid.md), a resize never fails and needs no "not enough space" case.

**The grid is kinder to TUIs than a normal emulator.** A conventional terminal resizes by
pixel drag and fires `SIGWINCH` continuously, which is where TUIs glitch. A grid changes
only at cell boundaries, and committing on drop rather than during the drag makes it
exactly one `SIGWINCH` per gesture: preview the span while dragging, apply once when
released.

**What does not resize anything.** Resizing the browser window does not change a grid — the
tile's span *is* the grid, and the window only shows it at a different scale. Zooming the
canvas likewise. Only an explicit tile resize touches the PTY. That is the payoff of the
daemon owning size and deriving it from layout rather than from a view.

Caveats are real but small and not ours: a program mid-render can flicker on `SIGWINCH`;
some applications in an alternate screen lose scrollback across a resize; layouts that
assume about eighty columns break in a very small grid, so a minimum tile span is worth
enforcing.
