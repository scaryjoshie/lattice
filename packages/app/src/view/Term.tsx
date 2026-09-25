import { type ITheme, Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { onTheme, type Theme, theme } from "../paint/theme.ts";
import { client } from "../store/client.ts";
import { route } from "./terminalKeys.ts";

/** Type inside a terminal: the size experiment 2 settled on, and a line height of one,
 *  which is the only one every renderer honours. Nerd Font icons fall back to the bundled
 *  symbols font, after the letters' face and before the system's. */
const SIZE = 15;
const FACE = "'Geist Mono', 'Symbols Nerd Font Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const LINE_HEIGHT = 1;
/** Room between the grid and the panel's edge. */
export const TERM_PAD = 22;

/** The terminal's colours from the theme, on no background: the panel shows through. */
function colours(t: Theme): ITheme {
  const [black, red, green, yellow, blue, magenta, cyan, white, brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] = t.terminal.ansi;
  return {
    background: "rgba(0, 0, 0, 0)",
    foreground: t.terminal.foreground,
    cursor: t.terminal.cursor,
    cursorAccent: t.page,
    selectionBackground: t.terminal.selection,
    black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
  };
}

/**
 * A terminal host's terminal, live, in the opened panel. From experiment 2: xterm's own
 * renderer, since the WebGL one ignores line height; the web font waited for, since xterm
 * measures a cell the moment it opens; and the grid taken from a cell as rendered, since a
 * cell is never the font size tall. The daemon resizes the process to that grid and hands
 * back the screen already laid out for it, then its output until the panel closes.
 */
export function Term({ host, width, height }: { host: string; width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useRef({ width, height });
  size.current = { width, height };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let disposed = false;
    let stop: (() => void) | null = null;

    const start = (): (() => void) => {
      const term = new Terminal({
        fontFamily: FACE,
        fontSize: SIZE,
        lineHeight: LINE_HEIGHT,
        cursorBlink: true,
        allowTransparency: true,
        allowProposedApi: true,
        scrollback: 5000,
        // Option is Meta, so Option-key sends what a line editor expects rather than the
        // character macOS would compose.
        macOptionIsMeta: true,
        theme: colours(theme()),
      });
      term.open(el);

      // Returning false stops xterm handling the key; the event still bubbles, so the
      // panel's own close chord is seen at the window.
      term.attachCustomKeyEventHandler((e) => {
        const r = route(e);
        if (r.to === "xterm") return true;
        if (r.to === "terminal") {
          e.preventDefault();
          void client.call("input", { host, data: r.bytes }).catch(() => {});
        }
        return false;
      });

      const typed = term.onData((data) => void client.call("input", { host, data }).catch(() => {}));
      const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const heard = client.on("output", (p) => {
        if (p.host === host) term.write(bytes(p.data));
      });
      const ended = client.on("exited", (p) => {
        if (p.host === host) term.write(`\r\n\x1b[2m[exit ${p.code ?? "?"}]\x1b[0m\r\n`);
      });
      const recolour = onTheme(() => {
        term.options.theme = colours(theme());
      });

      // One frame, so xterm has rendered something to measure; offsetWidth rather than a
      // bounding rect, since the panel is under a scale while it opens.
      requestAnimationFrame(() => {
        if (disposed) return;
        const box = el.querySelector<HTMLElement>(".xterm-screen");
        const cw = box && box.offsetWidth ? box.offsetWidth / term.cols : 0;
        const ch = box && box.offsetHeight ? box.offsetHeight / term.rows : 0;
        const { width: w, height: h } = size.current;
        const cols = cw ? Math.max(20, Math.floor((w - TERM_PAD * 2) / cw)) : 80;
        const rows = ch ? Math.max(6, Math.floor((h - TERM_PAD * 2) / ch)) : 24;
        term.resize(cols, rows);
        // Grid first, screen second: the daemon resizes the process, then serialises the
        // screen for exactly this grid.
        void client
          .call("attach", { host, cols, rows })
          .then((r) => {
            if (disposed || !r.ok) return;
            term.reset();
            if (r.screen) term.write(r.screen);
            term.focus();
          })
          .catch(() => {});
      });

      return () => {
        void client.call("detach", { host }).catch(() => {});
        heard();
        ended();
        recolour();
        typed.dispose();
        term.dispose();
      };
    };

    void Promise.all([document.fonts.load(`${SIZE}px 'Geist Mono'`), document.fonts.load(`${SIZE}px 'Symbols Nerd Font Mono'`, "\uf113")]).then(() => {
      if (!disposed) stop = start();
    });
    return () => {
      disposed = true;
      stop?.();
    };
    // The size is read once, through a ref: resizing the window while a panel is open does
    // not reflow a running program; closing and opening again picks up the new size.
  }, [host]);

  return <div className="term" ref={ref} />;
}
