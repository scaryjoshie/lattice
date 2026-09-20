# Pane, experiment 2

One question: **does entering a pane feel good?**

A blank canvas. Right-click to add a Claude Code or Codex pane. Each pane is a real
process in a real PTY. Click a pane and it grows out of wherever it sits into the window,
where it becomes an interactive TUI. `⌘↑` or a click outside settles it back into place.

Nothing else. No kernel, no database, no git, no worktrees, no MCP, no communication
between panes. A pane lives exactly as long as its process. See `../docs/11-ui-tooling.md`
for why each tool was chosen and `../docs/09-decisions.md` D-45 for the keyboard model.

## Run

```sh
bun install
bun run server     # daemon on :7778
bun run ui         # canvas on :5273
```

| Variable | Default | Meaning |
|---|---|---|
| `PANE2_PORT` | `7778` | Daemon port |
| `PANE2_CWD` | `$HOME` | Where panes run |

Panes use your own `claude` and `codex` logins.

## Shape

```
src/protocol.ts       wire types, COLS x ROWS
src/server/pty.ts     one process in a PTY, its headless mirror, snapshots, fan-out
src/server/main.ts    the whole daemon: spawn, attach, input, remove
src/ui/metrics.ts     pane size, and the font size that fits COLS x ROWS in a space
src/ui/store.ts       socket + view state; the canvas owns position, nothing else does
src/ui/canvas/transition.ts  the two springs the whole feel lives in
src/ui/canvas/Canvas.tsx     React Flow, context menu, open/close, shortcuts
src/ui/canvas/PaneNode.tsx   the closed pane: a rectangle and its mark
src/ui/canvas/Expanded.tsx   the pane lifted off the canvas, grown into the window
src/ui/terminal/Term.tsx     xterm at fixed COLS x ROWS, Cmd passed through
```

## Rules this experiment holds to

- **The grid follows the space.** A pane opens into whatever room it has, measures a real
  rendered cell, and the daemon resizes the process to match. Attach order is resize,
  snapshot, subscribe, against a server-side `@xterm/headless` mirror — raw scrollback
  replay is wrong the moment the grid changes. See `../docs/09-decisions.md` D-47.
- **Opening expands the pane; it never moves the camera.** See `../docs/09-decisions.md`
  D-46. The rect is measured with `getBoundingClientRect()` so the growth starts exactly
  where the pane was, at whatever zoom the canvas happens to be.
- **Cmd is the application layer.** `attachCustomKeyEventHandler` returns `false` for
  `metaKey`, so every other key reaches the TUI untouched. Escape is never taken —
  Claude Code uses it for interrupt and `Esc Esc` for rewind.
- **Open, the pane owns the wheel.** The scrim sits above the canvas, so scrollback
  cannot reach the camera.
- **A closed pane is empty on purpose.** Not a placeholder for a missing feature. What it
  could show later (serialized framebuffer snapshots, hook-driven status) is researched
  in `../docs/11-ui-tooling.md` and deliberately not built here.
- **xterm's default renderer, bounded scrollback, `lineHeight: 1`.** The WebGL addon
  ignores `lineHeight` and has known long-buffer faults; with one terminal on screen it
  buys nothing.
- **Measure the cell, wait for the font.** A cell is never `fontSize` tall, and xterm
  measures one the instant it opens. Both mistakes clip the grid by about a third.
- **Position is a surface concern.** The daemon has no opinion about layout.

## Known gaps

- The Codex icon is a placeholder ring, not OpenAI's mark, which is absent from
  simple-icons. Replace it from OpenAI's brand assets before showing this to anyone.
- Panes do not survive a daemon restart. That is the point: identity and persistence are
  experiment 1's job, not this one's.
