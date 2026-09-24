import { describe, expect, test } from "bun:test";
import type { Grid } from "@lattice/model";
import { type Effect, type Input, react } from "./react.ts";
import { initial, reduce, type Session, type SessionCommand } from "./session.ts";

/** One scope with an occupant and a two-cell run in it, and a loose occupant beside. */
function world(): Grid {
  const columns = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}` }));
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: `y${i}` }));
  return {
    columns,
    rows,
    tiles: [
      { id: "a", family: "host", surface: "terminal", columnId: "x3", rowId: "y2" },
      { id: "run", family: "text", style: "title", text: "auth", columnId: "x2", rowId: "y1", cap: { span: 2, rows: 1 } },
      { id: "b", family: "host", surface: "terminal", columnId: "x8", rowId: "y4" },
    ],
    scopes: [{ id: "auth", name: "auth", hue: 0, columnStart: "x2", columnEnd: "x4", rowStart: "y1", rowEnd: "y4" }],
    links: [],
  };
}

/** Run inputs through react and the reducer, the way the view does, minus the document. */
function drive(grid: Grid, inputs: Input[], from: Session = initial): { session: Session; commands: Effect[] } {
  let session = from;
  const commands: Effect[] = [];
  for (const input of inputs) {
    for (const effect of react(grid, session, input)) {
      if (["select", "point", "shiftKey", "gesture", "overlay", "open", "shift"].includes(effect.kind)) {
        session = reduce(session, effect as SessionCommand);
      } else commands.push(effect);
    }
  }
  return { session, commands };
}

const cell = (ci: number, ri: number) => ({ kind: "cell", ci, ri }) as const;
const press = (ci: number, ri: number, shift = false, button = 0): Input => ({ type: "press", target: cell(ci, ri), cell: [ci, ri], shift, button });
const release = (ci: number, ri: number, travelled = false, shift = false, button = 0): Input => ({
  type: "release", target: cell(ci, ri), cell: [ci, ri], travelled, shift, button, client: { x: 0, y: 0 },
});
const move = (ci: number, ri: number): Input => ({ type: "move", target: cell(ci, ri), cell: [ci, ri], world: { x: ci + 0.5, y: ri + 0.5 } });
const click = (ci: number, ri: number, shift = false): Input[] => [press(ci, ri, shift), release(ci, ri, false, shift)];

describe("selecting", () => {
  test("click selects a tile, a cell, and the whole scope by its handle; clicking inside clears", () => {
    const g = world();
    expect(drive(g, click(3, 2)).session.selection).toEqual({ tile: "a" });
    expect(drive(g, click(6, 6)).session.selection).toEqual({ region: { ci: 6, ri: 6, span: 1, rows: 1 } });
    const handle: Input[] = [
      { type: "press", target: { kind: "handle", scope: "auth" }, cell: [2, 1], shift: false, button: 0 },
      { type: "release", target: { kind: "handle", scope: "auth" }, cell: [2, 1], travelled: false, shift: false, button: 0, client: { x: 0, y: 0 } },
    ];
    expect(drive(g, handle).session.selection).toEqual({ scope: "auth" });
    expect(drive(g, [...click(3, 2), ...click(3, 2)]).session.selection).toBeNull();
  });

  test("a right-button press is not a click and selects nothing", () => {
    const g = world();
    const { session } = drive(g, [press(6, 6, false, 2), release(6, 6, false, false, 2)]);
    expect(session.selection).toBeNull();
    expect(session.gesture).toBeNull();
  });

  test("shift-click with a selection extends it, closed; without one it acts", () => {
    const g = world();
    const extended = drive(g, [...click(6, 6), ...click(3, 2, true)]).session.selection;
    // From (6,6) out to (3,2) meets the scope and the run, and closes over both.
    expect(extended).toEqual({ region: { ci: 2, ri: 1, span: 5, rows: 6 } });
    const opened = drive(g, click(3, 2, true)).session;
    expect(opened.opened).toEqual({ id: "a", leaving: false });
    const menu = drive(g, click(6, 6, true)).session;
    expect(menu.overlay?.kind).toBe("add");
  });

  test("escape clears the selection, and cancels a gesture first", () => {
    const g = world();
    const esc: Input = { type: "key", key: "Escape", down: true };
    expect(drive(g, [...click(3, 2), esc]).session.selection).toBeNull();
    const mid = drive(g, [...click(3, 2), press(3, 2), move(5, 2), esc]).session;
    expect(mid.gesture).toBeNull();
    expect(mid.selection).toEqual({ tile: "a" });
  });
});

describe("gestures", () => {
  test("a press inside the selection carries it; the move proposes; the release runs the same command", () => {
    const g = world();
    const { session, commands } = drive(g, [...click(3, 2), press(3, 2), move(4, 3), release(4, 3, true)]);
    expect(session.gesture).toBeNull();
    expect(commands).toEqual([{ kind: "move", from: { ci: 3, ri: 2, span: 1, rows: 1 }, to: { ci: 4, ri: 3, span: 1, rows: 1 } }]);
  });

  test("a press outside the selection is the camera's: no gesture", () => {
    const g = world();
    expect(drive(g, [...click(3, 2), press(8, 4)]).session.gesture).toBeNull();
    expect(drive(g, [press(8, 4)]).session.gesture).toBeNull();
  });

  test("a refused move is previewed and not run", () => {
    const g = world();
    // The run is two cells; dropping it half over the scope's edge is refused.
    const { session, commands } = drive(g, [...click(2, 1), press(2, 1), move(4, 1)]);
    expect(session.gesture?.kind).toBe("carry");
    expect(session.gesture?.kind === "carry" && session.gesture.verdict?.ok).toBe(false);
    expect(drive(g, [release(4, 1, true)], session).commands).toEqual([]);
    expect(commands).toEqual([]);
  });

  test("a region selection is told where it went before the move runs", () => {
    const g = world();
    const { commands } = drive(g, [...click(6, 6), press(6, 6), move(7, 7), release(7, 7, true)]);
    expect(commands.map((c) => c.kind)).toEqual(["move"]);
    // The select happened in the session; the command list holds only the document's.
    const { session } = drive(g, [...click(6, 6), press(6, 6), move(7, 7), release(7, 7, true)]);
    expect(session.selection).toEqual({ region: { ci: 7, ri: 7, span: 1, rows: 1 } });
  });

  test("a press on a lit line stretches, and the release runs the resize", () => {
    const g = world();
    const line: Input = { type: "press", target: { kind: "line", owner: "auth", c: 5, r: null }, cell: [5, 2], shift: false, button: 0 };
    const { session, commands } = drive(g, [line, { type: "move", target: cell(6, 2), cell: [6, 2], world: { x: 6.1, y: 2.5 } }, release(6, 2, true)]);
    expect(session.gesture).toBeNull();
    expect(commands).toEqual([{ kind: "resize", owner: "auth", col: { line: 5, n: 1 } }]);
  });

  test("shift-drag sweeps a closed rectangle and selects it on release", () => {
    const g = world();
    const { session } = drive(g, [press(6, 6, true), move(3, 2), release(3, 2, true, true)]);
    expect(session.selection).toEqual({ region: { ci: 2, ri: 1, span: 5, rows: 6 } });
  });
});

describe("overlays", () => {
  test("a press with a menu open is spent closing it", () => {
    const g = world();
    const open = drive(g, [{ type: "context", cell: [6, 6], client: { x: 0, y: 0 } }]).session;
    expect(open.overlay?.kind).toBe("add");
    const { session } = drive(g, [press(3, 2), release(3, 2)], open);
    expect(session.overlay).toBeNull();
    expect(session.selection).toBeNull();
  });

  test("choosing text places a named run and opens it for typing as the selection", () => {
    const g = world();
    const open = drive(g, [{ type: "context", cell: [6, 6], client: { x: 0, y: 0 } }]).session;
    const { session, commands } = drive(g, [{ type: "choose", choice: { family: "text", style: "note" } }], open);
    expect(commands).toHaveLength(1);
    const place = commands[0];
    expect(place?.kind).toBe("place");
    const id = place?.kind === "place" ? place.id : undefined;
    expect(id).toBeDefined();
    expect(session.selection).toEqual({ tile: id as string });
    expect(session.overlay).toEqual({ kind: "edit", id: id as string, draft: "" });
  });

  test("delete from the tile menu removes and deselects", () => {
    const g = world();
    const open = drive(g, [...click(3, 2), { type: "context", cell: [3, 2], client: { x: 0, y: 0 } }]).session;
    expect(open.overlay).toEqual({ kind: "tile", at: { x: 0, y: 0 }, id: "a" });
    const { session, commands } = drive(g, [{ type: "act", action: "delete" }], open);
    expect(commands).toEqual([{ kind: "remove", id: "a" }]);
    expect(session.selection).toBeNull();
    expect(session.overlay).toBeNull();
  });

  test("an opened tile owns the keys", () => {
    const g = world();
    const open = drive(g, click(3, 2, true)).session;
    expect(react(g, open, { type: "key", key: "Escape", down: true })).toEqual([]);
    expect(react(g, open, { type: "key", key: "Undo", down: true })).toEqual([]);
    expect(react(g, initial, { type: "key", key: "Undo", down: true })).toEqual([{ kind: "undo" }]);
  });
});
