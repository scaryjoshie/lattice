# 11. UI tooling

What the canvas and terminal surfaces are built out of, why, and what was rejected.
Researched September 2026. Versions are what was current then; the reasoning outlives
them.

This doc exists because "we wrapped it ourselves" is the most expensive kind of mistake
to find late. Where a standard tool exists, use it.

## Chosen

| Concern | Tool | Version | License | Why |
|---|---|---|---|---|
| Canvas | `@xyflow/react` | 12.11.6 | MIT | See below |
| Node chrome | React Flow UI (shadcn CLI) | — | MIT | `BaseNode`, `NodeHeader`, `NodeStatusIndicator`, `LabeledGroupNode`. Source-owned, not a dependency |
| Design system | shadcn/ui + Radix + Tailwind | 4.x | MIT | Already the experiment-1 stack |
| Terminal (live) | `@xterm/xterm` | 6.0.0 | MIT | The only real option |
| Terminal renderer | xterm's default | — | MIT | See below. The WebGL addon was tried and removed |
| Terminal state | `@xterm/headless` | 6.0.0 | MIT | Deferred; see below |
| Snapshots | `@xterm/addon-serialize` | 0.14.0 | MIT | Deferred; see below |
| PTY | `Bun.Terminal` | Bun 1.4 | — | Built in: `cols`/`rows`, `data` callback, `write`, `resize`, `setRawMode`, `close`. No native module to compile |
| Brand icons | `simple-icons` | 16.32.0 | CC0-1.0 | Has `claude`, `claudecode`, `anthropic` |
| Transitions | `motion` | 13.4.0 | MIT | See below |

## Canvas: React Flow, with an honest caveat

React Flow is a node-**graph** library. Experiment 2 has no edges, no handles and no
connections, so in isolation it is over-tooled: `react-zoom-pan-pinch` or plain `d3-zoom`
would cover pan and zoom in far less.

It is still correct, because of where this goes rather than where it starts:

- The destination has wires between agent panes ([ui.md](07-ui.md)), which is exactly
  what the library is for.
- Semantic zoom is a first-class pattern, not something to invent: subscribe to zoom via
  `useStore` and swap node content. React Flow ships this as the *contextual zoom*
  example.
- Worktree containers are `LabeledGroupNode` with child nodes, already solved.
- The camera API is the one we need (below).

Choosing something lighter now means throwing the camera and node layer away the first
time an edge appears.

**tldraw was seriously considered and rejected.** It has the better canvas feel and the
better-designed SDK, but since SDK 4.0 (September 2025) production use requires a
commercial licence — reported around $6k/year for small teams — with the free tier
non-commercial and watermarked. That is a product-level blocker, not a budget question.

## Opening a pane is not a camera move

First attempt flew the camera to the pane and zoomed to 1:1. Wrong: it moves the world to
reach one object, so everything else slides away and the pane never actually becomes the
thing you are looking at. What it should do is leave the canvas alone and let the pane
grow out of wherever it sits into the window, and settle back into the same place.

That is a shared-element transition, and `motion` is the tool: `layout`/`layoutId` do
FLIP automatically, and layout animations are the one thing it does better than anything
else available.

**Why not the View Transitions API.** It is the browser-native answer and right for
route-level shared elements, but it is *not interruptible*, and during the transition the
animating snapshot overlays the real page and swallows pointer events. Opening a pane must
be reversible mid-flight, so that rules it out here.

**Why not `layoutId` specifically.** A pane lives inside React Flow's viewport, which is a
`translate(...) scale(...)` transform, and layout projection through a transformed ancestor
that Motion does not control is exactly where `layoutId` gets unreliable. So the rect is
measured with `getBoundingClientRect()` — which already includes the canvas transform — and
handed to a portalled element explicitly. Motion still provides the spring and the
interruptibility; it just is not asked to guess the geometry.

### Scale the screen; never resize it

The first working version animated `width` and `height` and mounted the terminal once the
box had arrived. That is wrong, and it reads as wrong: the terminal relayouts on every
frame, so opening is a box growing *and then* a terminal appearing — two events — and
closing is worse, because the thing being read is destroyed before the box has stopped
moving.

**There is one screen size in the application: the rectangle an open pane occupies.** Every
terminal is built at that size. A pane on the canvas is the same screen drawn smaller, and
opening one animates `transform` from a thumbnail scale up to 1. Nothing is resized, no
grid changes, no PTY resize on open. The text simply gets closer, which is the whole
effect.

It is also cheaper: one composited layer, transform-only, rasterized at 1:1 and displayed
smaller — the good direction for a scale, since the raster is never magnified past its
native resolution.

Everything scales together, chrome included: border, radius and shadow all shrink with it.
That is deliberate. Compensating them to hold a constant apparent weight would look like a
box resizing, which is exactly the thing being avoided.

**The cost, accepted knowingly: a pane cannot have its own aspect ratio.** It is a view of
the screen, so it has the screen's shape, and a differently shaped window gives differently
shaped panes. Acceptable while this is one person on one Mac. If panes ever need a fixed
card shape, the honest version is to crop the screen to that shape rather than distort it —
at which point opening is a scale *and* a reveal, and needs designing rather than falling
out of the geometry.

A consequence for measurement: while a pane is opening it sits under a CSS scale, so
`getBoundingClientRect()` reports the scaled size. Use `offsetWidth`/`offsetHeight`, which
are layout values and ignore transforms, or the grid comes out a fraction of what it
should be.

React Flow's `setViewport`, `fitView` and `zoomTo` do each take `duration` **and `ease`**
(`(t: number) => number`, verified in the 12.11.6 typings). Still true, still useful for
ordinary camera work; just not what opening a pane is.

## Rendering someone else's TUI

A TUI draws onto a grid of `cols` x `rows` that it learns from the PTY. That grid is the
contract, and there are only two honest ways to put it on screen:

| | What gives | Cost |
|---|---|---|
| **Fit the grid to the box** | `cols`/`rows` change | The app reflows. Normal: it is what every terminal emulator does, and what SIGWINCH is for |
| **Fix the grid, scale the pixels** | Font size or a CSS transform | Nothing reflows, but text softens under non-integer scaling |

There is no third option. Anything that presents a grid the process does not believe it
has will clip, and because a centred terminal overflows symmetrically, it clips the top
and the bottom at once.

**Pane fits the grid to the box.** An earlier version fixed the grid at 120x36 on the
grounds that a TUI must never reflow. That rule was written for a design where shrunken
live terminals sat on the canvas, where a reflow storm during a camera move would have
been intolerable. In the design that actually exists, a terminal is only ever instantiated
once, at one size, inside an opened pane — so the rule protected nothing and cost
clipping. Recorded so the reasoning is not rediscovered the hard way.

### Measure the cell; never derive it

The clipping had one direct cause: computing the grid from the font size.

**A cell is not `fontSize` tall.** Its height comes from the font's ascent, descent and
line gap, which for most monospace faces lands nearer 1.3x. `lineHeight: 1` means "do not
scale the font's natural line box", not "make cells one em tall". A grid derived from the
font size therefore overflows its container by roughly a third.

On `master` xterm exposes `terminal.dimensions.css.cell`, which is what `FitAddon` reads,
but it is **not in the released 6.0.0 typings**. Until it is, measure the rendered
`.xterm-screen` and divide by `cols`/`rows`. Public, exact, no internals.

### Wait for the web font

xterm measures a cell the moment it opens. If the web font has not loaded it measures the
fallback, and every subsequent number is wrong in exactly the same way. `await
document.fonts.load(...)` before constructing the terminal.

### Attach: resize, then snapshot, then subscribe

Order is load-bearing.

1. **Resize** the PTY and the server's mirror to the grid the client is opening into.
2. **Snapshot** the mirror, so the screen is serialized *for that grid*.
3. **Subscribe** to live bytes.

A snapshot taken before the resize is laid out for the old grid. Live bytes delivered
before the snapshot get overwritten by it. And replaying raw scrollback instead of a
snapshot is simply wrong whenever the grid has changed, because those bytes were wrapped
for a width that no longer exists — the classic multiplexer reattach bug.

## Renderer: xterm's default, not WebGL

The WebGL addon was chosen on reasoning and then removed on evidence. Two faults:

- **It ignores `lineHeight`.** That option is honoured by the canvas and DOM renderers
  only. Setting a line height *and* loading WebGL produces exactly the glitching you would
  expect from two components disagreeing about how tall a cell is.
- **Known long-buffer faults**, where a write can drop the pane to a blank ☹ state.

The GPU path buys throughput across many terminals. Only one terminal is ever on screen
here, so there is nothing to buy. Also: bound `scrollback` explicitly. `scrollback: 0` is
not "no history", it is a renderer edge case.

## Keyboard

`attachCustomKeyEventHandler` runs before xterm processes a key; returning `false` stops
xterm handling it while the event still bubbles, so the application's own shortcuts are
seen at the window. That is the whole mechanism; nothing needs patching or wrapping.

Every keystroke goes to one of three places (D-48):

| Route | Keys | Why |
|---|---|---|
| Application | A named list, currently `⌘↑` | Everything not listed reaches the pane |
| Browser / xterm | `⌘C` `⌘V` `⌘X` `⌘A` | xterm does the clipboard through native events, not keydown |
| Translated to the PTY | The table below | A terminal sends nothing useful for these on its own |

```
Shift+Enter       ESC CR    \x1b\r     newline without submitting
Cmd+Backspace     Ctrl+U    \x15       delete to start of line
Opt+Backspace     ESC DEL   \x1b\x7f   delete previous word
Cmd+Delete        Ctrl+K    \x0b       delete to end of line
Opt+Delete        ESC d     \x1bd      delete next word
Cmd+Left          Ctrl+A    \x01       start of line
Cmd+Right         Ctrl+E    \x05       end of line
Opt+Left/Right    ESC b/f   \x1bb/f    word left / right
```

Also set **`macOptionIsMeta: true`**, so Option+key produces an ESC-prefixed sequence
rather than the composed character macOS would otherwise insert.

**Shift+Enter is the interesting one.** Modern terminals distinguish it through the Kitty
keyboard protocol / CSI u encoding (`CSI 13;2u`), which xterm.js does not implement — so
plain `Enter` and `Shift+Enter` are indistinguishable and both send `\r`. Claude Code also
recognises `ESC CR` as "insert a newline", which is what `/terminal-setup` configures
other terminals to send, and which we can produce directly. Verified against a live
session: every row of the table above behaves correctly.

Browser caveat: Chrome reserves `⌘W`, `⌘T`, `⌘L`, `⌘1`–`⌘9` (tabs) and `⌘0`/`⌘+`/`⌘-`
(zoom). `⌘↑`/`⌘↓`, `⌘⏎` and `⌘.` are free. A desktop shell later frees the rest,
including `⌘1`–`⌘9` for jumping between panes.

## The server-side mirror

`@xterm/headless` is the full VT/ANSI emulator with no DOM, so the daemon runs one per
PTY, fed the same bytes as the process writes. It holds the *screen* rather than the
byte history, which is what makes a correct attach possible at all (above).
`@xterm/addon-serialize` emits it: `serialize()` for a replayable escape-sequence string,
`serializeAsHTML()` for styled HTML, both accepting a row range.

This was originally researched as a deferred idea for what a *closed* pane might show.
It turned out to be load-bearing for opening one, and is in use.

Verified working under Bun, including resize-then-serialize and replay into a fresh
emulator of the new size.

## Still deferred: what a closed pane can show

Experiment 2 leaves closed panes empty on purpose. The mirror already makes the hard part
free: `serializeAsHTML()` over a row range renders the last N rows of *output* rather than
the TUI's input chrome, as text in the DOM that stays crisp at any zoom, with no terminal
instance in the browser.

Consequences worth keeping in mind:

- No xterm instance in the browser until a pane is entered. No per-pane GPU context.
- A snapshot is text in the DOM, so it stays crisp at any zoom, unlike a scaled canvas.
- The styling is entirely ours.

**Status without scraping the TUI.** Claude Code's hook system (`PreToolUse`,
`PostToolUse`, `Notification`, `Stop`, `TeammateIdle`, `FileChanged`,
`PermissionRequest`, and ~20 more) pipes JSON to a command on each lifecycle event. A
card can therefore say *editing `src/auth.ts`* or *waiting on you* from a real signal
rather than a regex over ANSI. It is configuration, not a protocol to design.

## Notes

- `simple-icons` files are CC0, but the marks remain trademarks of their owners; normal
  brand-usage rules apply. OpenAI's icon is absent from the set, so Codex needs its mark
  from OpenAI's own brand assets.
- `node-pty` (1.1.0) is the usual answer for PTYs and is what VS Code uses. It is not
  needed here: `Bun.Terminal` covers the same ground with no native build step, and is
  already proven in experiment 1.
