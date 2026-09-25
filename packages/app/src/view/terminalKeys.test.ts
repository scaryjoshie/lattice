import { describe, expect, test } from "bun:test";
import { type Key, route } from "./terminalKeys.ts";

const key = (k: string, mods: Partial<Omit<Key, "key" | "type">> = {}, type = "keydown"): Key => ({
  type,
  key: k,
  metaKey: false,
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
});

describe("terminal keys", () => {
  test("shift-enter is a newline without submitting", () => {
    expect(route(key("Enter", { shiftKey: true }))).toEqual({ to: "terminal", bytes: "\x1b\r" });
    expect(route(key("Enter"))).toEqual({ to: "xterm" });
  });

  test("the Mac editing chords become what a line editor understands", () => {
    expect(route(key("Backspace", { metaKey: true }))).toEqual({ to: "terminal", bytes: "\x15" });
    expect(route(key("Backspace", { altKey: true }))).toEqual({ to: "terminal", bytes: "\x1b\x7f" });
    expect(route(key("ArrowLeft", { metaKey: true }))).toEqual({ to: "terminal", bytes: "\x01" });
    expect(route(key("ArrowRight", { altKey: true }))).toEqual({ to: "terminal", bytes: "\x1bf" });
    expect(route(key("Delete", { metaKey: true }))).toEqual({ to: "terminal", bytes: "\x0b" });
  });

  test("closing is the app's; Escape and the clipboard are not", () => {
    expect(route(key("Escape", { metaKey: true }))).toEqual({ to: "app" });
    expect(route(key(".", { metaKey: true }))).toEqual({ to: "app" });
    expect(route(key("Escape"))).toEqual({ to: "xterm" });
    expect(route(key("c", { metaKey: true }))).toEqual({ to: "xterm" });
    expect(route(key("v", { metaKey: true }))).toEqual({ to: "xterm" });
  });

  test("only a key going down is routed", () => {
    expect(route(key("Enter", { shiftKey: true }, "keyup"))).toEqual({ to: "xterm" });
  });
});
