import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { COLS, ROWS } from "../../protocol.ts";
import { FONT_FAMILY, fontSizeFor, LINE_HEIGHT } from "../metrics.ts";
import { useStore } from "../store.ts";
import { terminalBus } from "./bus.ts";

const THEME = {
  background: "#0b0b0e",
  foreground: "#e4e4e8",
  cursor: "#e4e4e8",
  cursorAccent: "#0b0b0e",
  selectionBackground: "rgba(255,255,255,0.18)",
};

/**
 * The live terminal, mounted only once a pane has finished expanding.
 *
 * Geometry is fixed at COLS x ROWS and the font is sized to the space instead, so a TUI
 * never reflows. The default renderer is deliberate: the WebGL addon ignores lineHeight
 * and has known long-buffer faults, and there is only ever one terminal on screen.
 */
export function Term({ id, width, height }: { id: string; width: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const send = useStore((s) => s.send);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const term = new Terminal({
      cols: COLS,
      rows: ROWS,
      theme: THEME,
      fontFamily: FONT_FAMILY,
      fontSize: fontSizeFor(width, height),
      lineHeight: LINE_HEIGHT,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    });
    term.open(el);

    // D-45: Cmd belongs to the application. Returning false hands the event back to the
    // document, where the shortcut layer sees it; every other key reaches the TUI.
    term.attachCustomKeyEventHandler((e) => !e.metaKey);

    const input = term.onData((data) => send({ t: "input", id, data }));
    const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const unsubscribe = terminalBus.subscribe(id, {
      replay: (b64) => term.write(bytes(b64)),
      data: (b64) => term.write(bytes(b64)),
      exit: (code) => term.write(`\r\n\x1b[2m[exit ${code ?? "?"}]\x1b[0m\r\n`),
    });
    send({ t: "attach", id });
    term.focus();

    return () => {
      send({ t: "detach", id });
      unsubscribe();
      input.dispose();
      term.dispose();
    };
    // Font size is read once: resizing the window while inside a pane must not reflow
    // a running TUI. Leaving and re-entering picks up the new size.
  }, [id, send]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="term" ref={ref} />;
}
