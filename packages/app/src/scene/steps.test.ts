import { describe, expect, test } from "bun:test";
import type { Step } from "@lattice/protocol";
import { viewOf } from "./steps.ts";

const host = { id: "h", family: "host", surface: "terminal", columnId: "x", rowId: "y", span: 1, rows: 1 } as const;
const run = { id: "r", family: "text", style: "title", text: "auth service", columnId: "x", rowId: "y", span: 3, rows: 1 } as const;
const scope = { id: "s", name: "infra", hue: 1, columnStart: "a", columnEnd: "b", rowStart: "c", rowEnd: "d" };
const none = { hosting: {} };

describe("history rows", () => {
  test("a placed host is named by what it holds, or its surface's idle occupant", () => {
    const step: Step = { command: { kind: "place", ci: 0, ri: 0, what: { family: "host", surface: "terminal" } }, subject: host, carried: 1 };
    expect(viewOf(step, none)).toEqual({ act: "place", label: "terminal" });
    expect(viewOf(step, { hosting: { h: "claude" } })).toEqual({ act: "place", label: "claude code" });
  });

  test("text is its words, a rename its new name, a worktree its name", () => {
    expect(viewOf({ command: { kind: "setText", id: "r", text: "auth service" }, subject: run, carried: 1 }, none)).toEqual({ act: "text", label: '"auth service"' });
    expect(viewOf({ command: { kind: "setName", id: "h", name: "ada" }, subject: { ...host, name: "ada" }, carried: 1 }, none)).toEqual({ act: "name", label: "ada" });
    expect(viewOf({ command: { kind: "move", from: { ci: 0, ri: 0, span: 2, rows: 2 }, to: { ci: 5, ri: 0, span: 2, rows: 2 } }, subject: scope, carried: 1 }, none)).toEqual({ act: "move", label: "infra" });
  });

  test("a move of several says how many, and a long label is cut", () => {
    expect(viewOf({ command: { kind: "move", from: { ci: 0, ri: 0, span: 2, rows: 1 }, to: { ci: 5, ri: 0, span: 2, rows: 1 } }, subject: null, carried: 2 }, none)).toEqual({ act: "move", label: "2 items" });
    const long = viewOf({ command: { kind: "setText", id: "r", text: "x".repeat(40) }, subject: { ...run, text: "x".repeat(40) }, carried: 1 }, none);
    expect(long.label.length).toBe(22);
    expect(long.label.endsWith("…")).toBe(true);
  });
});
