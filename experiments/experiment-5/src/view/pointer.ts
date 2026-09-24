/**
 * Who owns the pointer.
 *
 * Anything that takes over the pointer while it is open says so here, once. A gesture that
 * begins inside one of these belongs to it, and neither the camera nor the grid sees it —
 * which is what stops dragging inside a text field from panning the world, and stops
 * clicking into a text field from being read as a click on the cell behind it.
 *
 * This was previously three separate answers: the menu stopped propagation itself, the
 * camera tested a selector of its own, and the grid's handlers tested nothing at all.
 */
export const OVERLAY = ".editor, .namer, .menu, .opened";

export const claimed = (target: EventTarget | null): boolean =>
  Boolean((target as Element | null)?.closest?.(OVERLAY));
