/**
 * Editing keys a Mac user expects, translated to what line editors in a PTY
 * understand. xterm sends nothing useful for these on its own. Returns the bytes to
 * send, or null to let xterm handle the key.
 */
export function editingKey(e: KeyboardEvent): string | null {
  const { key, metaKey: cmd, altKey: alt, ctrlKey: ctrl, shiftKey: shift } = e;
  if (key === "Enter" && shift && !cmd && !ctrl) return "\n"; // newline without submitting (Ctrl+J)
  if (key === "Backspace") {
    if (cmd) return "\x15"; // delete to start of line (Ctrl+U)
    if (alt || ctrl) return "\x17"; // delete previous word (Ctrl+W)
  }
  if (key === "Delete") {
    if (cmd) return "\x0b"; // delete to end of line (Ctrl+K)
    if (alt || ctrl) return "\x1bd"; // delete next word (Meta+D)
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
