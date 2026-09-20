import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { COLS, ROWS } from "../../protocol.ts";
import { FONT_FAMILY, FONT_SIZE, LINE_HEIGHT } from "../metrics.ts";
import { useStore } from "../store.ts";
import { terminalBus } from "./bus.ts";

const THEME = {
  background: "#0b0b0e",
  foreground: "#e4e4e8",
  cursor: "#e4e4e8",
  selectionBackground: "rgba(255,255,255,0.18)",
};

/**
 * The live terminal, mounted only while its pane is entered. Geometry is fixed at
 * COLS x ROWS: there is no fit addon, because a TUI must never reflow just because
 * someone moved the camera.
 */
export function Term({ id }: { id: string }) {
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
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 0,
    });
    term.open(el);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      /* software renderer is a fine fallback */
    }

    // D-45: Cmd belongs to the application. Returning false hands the event back to the
    // document, where the shortcut layer sees it; everything else reaches the TUI.
    term.attachCustomKeyEventHandler((e) => !e.metaKey);

    const input = term.onData((data) => send({ t: "input", id, data }));
    const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const unsubscribe = terminalBus.subscribe(id, {
      replay: (b64) => {
        term.reset();
        term.write(bytes(b64));
      },
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
  }, [id, send]);

  return <div className="term" ref={ref} />;
}
