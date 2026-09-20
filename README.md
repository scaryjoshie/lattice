# Pane, experiment 2

One question: **does entering a pane feel good?**

A blank canvas. Right-click to add a Claude Code or Codex pane. Each pane is a real
process in a real PTY. Click a pane and the camera flies into it at 1:1, where it becomes
an interactive TUI. `⌘↑` or a click outside flies back out.

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
src/server/pty.ts     one process in a PTY, scrollback, fan-out
src/server/main.ts    the whole daemon: spawn, attach, input, remove
src/ui/metrics.ts     pane size derived from measured font cells
src/ui/store.ts       socket + view state; the canvas owns position, nothing else does
src/ui/canvas/camera.ts   zoom levels, durations, easing curves
src/ui/canvas/Canvas.tsx  React Flow, context menu, enter/exit, shortcuts
src/ui/canvas/PaneNode.tsx  the pane: closed is empty on purpose, entered is the TUI
src/ui/terminal/Term.tsx    xterm at fixed geometry, WebGL, Cmd passed through
```

## Rules this experiment holds to

- **Fixed geometry.** The PTY is 120x36 and never resizes. No fit addon: a TUI must not
  reflow because the camera moved. Pane size is derived from measured font cells.
- **Cmd is the application layer.** `attachCustomKeyEventHandler` returns `false` for
  `metaKey`, so every other key reaches the TUI untouched. Escape is never taken —
  Claude Code uses it for interrupt and `Esc Esc` for rewind.
- **Entered, the pane owns the wheel.** Canvas zoom and pan are off while inside, so
  scrollback cannot move the camera.
- **A closed pane is empty on purpose.** Not a placeholder for a missing feature. What it
  could show later (serialized framebuffer snapshots, hook-driven status) is researched
  in `../docs/11-ui-tooling.md` and deliberately not built here.
- **Position is a surface concern.** The daemon has no opinion about layout.

## Known gaps

- The Codex icon is a placeholder ring, not OpenAI's mark, which is absent from
  simple-icons. Replace it from OpenAI's brand assets before showing this to anyone.
- Panes do not survive a daemon restart. That is the point: identity and persistence are
  experiment 1's job, not this one's.
