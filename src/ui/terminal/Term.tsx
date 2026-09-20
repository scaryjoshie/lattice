import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { SPAWN_COLS, SPAWN_ROWS } from "../../protocol.ts";
import { route } from "../keys.ts";
import { FONT_FAMILY, FONT_SIZE, LINE_HEIGHT, TERM_PAD } from "../metrics.ts";
import { useStore } from "../store.ts";
import { terminalBus } from "./bus.ts";

const THEME = {
  background: "#0e0e12",
  foreground: "#e4e4e8",
  cursor: "#e4e4e8",
  cursorAccent: "#0e0e12",
  selectionBackground: "rgba(255,255,255,0.18)",
};

/**
 * Measure a cell from what xterm actually rendered.
 *
 * Deriving it from the font size instead is where the previous version went wrong: a
 * cell is never `fontSize` tall. Its height comes from the font's own ascent, descent
 * and line gap, which for most monospace faces lands nearer 1.3x. A grid computed from
 * the font size therefore overflows its box by about a third, and because the terminal
 * is centred, it loses rows off the top and the bottom at the same time.
 */
function measureCell(host: HTMLElement, term: Terminal): { w: number; h: number } | null {
  const box =
    host.querySelector<HTMLElement>(".xterm-screen") ??
    host.querySelector<HTMLElement>(".xterm-rows");
  if (!box) return null;
  const r = box.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { w: r.width / term.cols, h: r.height / term.rows };
}

/**
 * The live terminal, mounted once a pane has finished expanding.
 *
 * The grid is taken from the space available, which is what every terminal emulator
 * does; the daemon resizes the process to match and hands back a snapshot already laid
 * out for it. The default renderer is deliberate: the WebGL addon ignores lineHeight and
 * has known long-buffer faults, and only one terminal is ever on screen.
 */
export function Term({ id, width, height }: { id: string; width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const send = useStore((s) => s.send);
  const size = useRef({ width, height });
  size.current = { width, height };

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let disposed = false;
    let stop: (() => void) | null = null;

    function start(): () => void {
      const term = new Terminal({
        cols: SPAWN_COLS,
        rows: SPAWN_ROWS,
        theme: THEME,
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        cursorBlink: true,
        allowProposedApi: true,
        scrollback: 5000,
        // Option is Meta, so Option+key produces ESC-prefixed sequences instead of the
        // composed character macOS would otherwise insert.
        macOptionIsMeta: true,
      });
      term.open(host as HTMLElement);

      // See keys.ts. Returning false stops xterm handling the key; the event still
      // bubbles, so the application's own shortcuts are seen at the window.
      term.attachCustomKeyEventHandler((e) => {
        const r = route(e);
        if (r.to === "xterm") return true;
        if (r.to === "app") return false;
        e.preventDefault();
        send({ t: "input", id, data: r.bytes });
        return false;
      });

      const input = term.onData((data) => send({ t: "input", id, data }));
      const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const unsubscribe = terminalBus.subscribe(id, {
        snapshot: (data) => {
          term.reset();
          term.write(data);
        },
        data: (b64) => term.write(bytes(b64)),
        exit: (code) => term.write(`\r\n\x1b[2m[exit ${code ?? "?"}]\x1b[0m\r\n`),
      });

      // One frame, so xterm has rendered something to measure.
      requestAnimationFrame(() => {
        if (disposed) return;
        const cell = measureCell(host as HTMLElement, term);
        const { width: w, height: h } = size.current;
        const cols = cell ? Math.max(20, Math.floor((w - TERM_PAD * 2) / cell.w)) : SPAWN_COLS;
        const rows = cell ? Math.max(6, Math.floor((h - TERM_PAD * 2) / cell.h)) : SPAWN_ROWS;
        term.resize(cols, rows);
        // Grid first, snapshot second: the daemon resizes the process, then serializes
        // the screen for exactly this grid.
        send({ t: "attach", id, cols, rows });
        term.focus();
      });

      return () => {
        send({ t: "detach", id });
        unsubscribe();
        input.dispose();
        term.dispose();
      };
    }

    // Wait for the web font. xterm measures a cell the moment it opens, and measuring
    // against the fallback face sizes the grid for a font that is about to be replaced.
    void document.fonts.load(`${FONT_SIZE}px ${FONT_FAMILY}`).then(() => {
      if (!disposed) stop = start();
    });

    return () => {
      disposed = true;
      stop?.();
    };
    // Size is read once, through a ref. Resizing the window while a pane is open must
    // not reflow a running TUI; closing and reopening picks up the new size.
  }, [id, send]);

  return <div className="term" ref={ref} />;
}
