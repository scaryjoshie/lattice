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
