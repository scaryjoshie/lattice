/**
 * Who gets a keystroke.
 *
 * D-45 said Cmd is the application layer and everything else belongs to the TUI. That
 * was too absolute: on a Mac, Cmd is also where text editing lives, so swallowing every
 * Cmd chord silently broke Cmd+Backspace and friends. The application claims a named
 * few, the clipboard stays with the browser, and the rest are translated into what a
 * line editor in a PTY actually understands.
 */

/** Chords the application owns. Everything not listed here reaches the pane. */
export function isAppChord(e: KeyboardEvent): boolean {
  return e.metaKey && e.key === "ArrowUp";
}

/** Left to the browser and xterm, which handle the clipboard through native events. */
function isClipboard(e: KeyboardEvent): boolean {
  return e.metaKey && ["c", "v", "x", "a"].includes(e.key.toLowerCase());
}

/**
 * Keys a Mac user expects that a terminal sends nothing useful for on its own.
 * Returns the bytes to send, or null to let xterm handle the key itself.
 */
function editingKey(e: KeyboardEvent): string | null {
  const { key, metaKey: cmd, altKey: alt, ctrlKey: ctrl, shiftKey: shift } = e;

  // Newline without submitting. Claude Code reads ESC+CR as "insert a newline"; it is
  // what /terminal-setup configures other terminals to send. xterm has no CSI u support,
  // so nothing produces this on its own.
  if (key === "Enter" && shift && !cmd && !ctrl) return "\x1b\r";

  if (key === "Backspace") {
    if (cmd) return "\x15"; // delete to start of line (Ctrl+U)
    if (alt || ctrl) return "\x1b\x7f"; // delete previous word (meta backspace)
  }
  if (key === "Delete") {
    if (cmd) return "\x0b"; // delete to end of line (Ctrl+K)
    if (alt || ctrl) return "\x1bd"; // delete next word (meta d)
  }
  if (key === "ArrowLeft") {
    if (cmd) return "\x01"; // start of line (Ctrl+A)
    if (alt) return "\x1bb"; // back one word
  }
  if (key === "ArrowRight") {
    if (cmd) return "\x05"; // end of line (Ctrl+E)
    if (alt) return "\x1bf"; // forward one word
  }
  return null;
}

/** app: the canvas handles it. terminal: send these bytes. xterm: let xterm decide. */
export type KeyRouting = { to: "app" } | { to: "terminal"; bytes: string } | { to: "xterm" };

export function route(e: KeyboardEvent): KeyRouting {
  if (e.type !== "keydown") return { to: "xterm" };
  if (isAppChord(e)) return { to: "app" };
  if (isClipboard(e)) return { to: "xterm" };
  const bytes = editingKey(e);
  if (bytes !== null) return { to: "terminal", bytes };
  return { to: "xterm" };
}
