import type { Id } from "@pane/kernel/model";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useStore } from "../store.ts";
import { terminalBus } from "./bus.ts";

const THEME = {
  background: "#0d0d10",
  foreground: "#e6e6ea",
  cursor: "#e6e6ea",
  selectionBackground: "rgba(255,255,255,0.2)",
};

/**
 * One agent's terminal. Attaches over the socket whenever the agent's process is
 * running, and again after a restart; shows a dim line while it is not.
 */
export function Term({ agentId }: { agentId: Id<"agent"> }) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<{ term: Terminal; fit: FitAddon } | null>(null);
  const connection = useStore((s) => s.connection);
  // A new pid is a new process: attach again and start from its own scrollback.
  const pid = useStore((s) => s.presence[agentId]?.pid ?? null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !connection) return;
    const term = new Terminal({
      theme: THEME,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12,
      cursorBlink: true,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    termRef.current = { term, fit };
    const input = term.onData((data) => connection.send({ type: "terminal.input", agentId, data }));
    const unsub = terminalBus.subscribe(agentId, {
      data: (b64) => term.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))),
      exit: (code) => term.write(`\r\n\x1b[2m[exit ${code ?? "?"}]\x1b[0m\r\n`),
    });
    const ro = new ResizeObserver(() => {
      fit.fit();
      connection.send({ type: "terminal.resize", agentId, cols: term.cols, rows: term.rows });
    });
    ro.observe(el);
    term.focus();
    return () => {
      ro.disconnect();
      input.dispose();
      unsub();
      connection.send({ type: "terminal.close", agentId });
      term.dispose();
      termRef.current = null;
    };
  }, [agentId, connection]);

  useEffect(() => {
    const t = termRef.current;
    if (!t || !connection) return;
    t.term.reset();
    if (pid !== null) {
      t.fit.fit();
      connection.send({ type: "terminal.open", agentId, cols: t.term.cols, rows: t.term.rows });
    } else {
      t.term.write("\x1b[2moffline\x1b[0m");
    }
  }, [agentId, connection, pid]);

  return <div className="term" ref={ref} />;
}
