/**
 * Who gets a keystroke while a terminal is open. From experiment 2, where it was proved.
 *
 * On a Mac, Cmd is also where text editing lives, so the app claims a named few chords,
 * the clipboard stays with the browser, and the rest are translated into what a line
 * editor in a terminal understands. Escape is never taken: Claude Code interrupts with it
 * and rewinds with Esc Esc.
 */

/** The parts of a keyboard event routing reads, so it can be tested without a browser. */
export interface Key {
  readonly type: string;
  readonly key: string;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

/** The app's chords while a terminal is open: closing it. Everything else reaches it. */
const isAppChord = (e: Key): boolean => e.metaKey && (e.key === "Escape" || e.key === ".");

/** Left to the browser and xterm, which handle the clipboard through native events. */
const isClipboard = (e: Key): boolean => e.metaKey && ["c", "v", "x", "a"].includes(e.key.toLowerCase());

/**
 * Keys a Mac user expects that a terminal sends nothing useful for on its own. The bytes
 * to send, or null to let xterm handle the key itself.
 */
function editingKey(e: Key): string | null {
  const { key, metaKey: cmd, altKey: alt, ctrlKey: ctrl, shiftKey: shift } = e;
  // A newline without submitting. Claude Code reads ESC CR as "insert a newline"; it is
  // what its /terminal-setup configures other terminals to send, and xterm has no CSI u
  // support to produce anything else.
  if (key === "Enter" && shift && !cmd && !ctrl) return "\x1b\r";
  if (key === "Backspace") {
    if (cmd) return "\x15"; // delete to the start of the line (Ctrl-U)
    if (alt || ctrl) return "\x1b\x7f"; // delete the previous word
  }
  if (key === "Delete") {
    if (cmd) return "\x0b"; // delete to the end of the line (Ctrl-K)
    if (alt || ctrl) return "\x1bd"; // delete the next word
  }
  if (key === "ArrowLeft") {
    if (cmd) return "\x01"; // start of line (Ctrl-A)
    if (alt) return "\x1bb"; // back a word
  }
  if (key === "ArrowRight") {
    if (cmd) return "\x05"; // end of line (Ctrl-E)
    if (alt) return "\x1bf"; // forward a word
  }
  return null;
}

/** app: the app handles it. terminal: send these bytes. xterm: let xterm decide. */
export type Routing = { to: "app" } | { to: "terminal"; bytes: string } | { to: "xterm" };

export function route(e: Key): Routing {
  if (e.type !== "keydown") return { to: "xterm" };
  if (isAppChord(e)) return { to: "app" };
  if (isClipboard(e)) return { to: "xterm" };
  const bytes = editingKey(e);
  return bytes === null ? { to: "xterm" } : { to: "terminal", bytes };
}
