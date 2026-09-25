import { describe, expect, test } from "bun:test";
import { CELL, framing } from "./geometry.ts";

describe("framing", () => {
  test("what fits is shown at the drawn size, centred", () => {
    const cam = framing([{ ci: 2, ri: 1, span: 3, rows: 2 }], 1000, 800, 50);
    expect(cam.k).toBe(1);
    // The middle of the regions sits at the middle of the viewport.
    expect(cam.x + (2 + 1.5) * CELL * cam.k).toBeCloseTo(500);
    expect(cam.y + (1 + 1) * CELL * cam.k).toBeCloseTo(400);
  });

  test("what does not fit is zoomed out until it does, margin kept", () => {
    const cam = framing([{ ci: 0, ri: 0, span: 1, rows: 1 }, { ci: 29, ri: 5, span: 1, rows: 1 }], 1000, 800, 50);
    // 30 columns wide: the width is the limit.
    expect(cam.k).toBeCloseTo(900 / (30 * CELL));
    expect(cam.x).toBeCloseTo(50);
  });

  test("an empty grid is the drawn size about the origin", () => {
    expect(framing([], 1000, 800, 50)).toEqual({ x: 500, y: 400, k: 1 });
  });
});
