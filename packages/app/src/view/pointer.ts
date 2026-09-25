/**
 * Who owns the pointer.
 *
 * The grid owns every input that lands on the grid. Anything drawn over it that takes the
 * pointer, a menu, the editor, the opened panel, the toolbar, says so on its own element
 * with `data-overlay`, and an input that lands inside one is that surface's alone: neither
 * the camera nor the grid sees it. This is the one answer every handler asks, so a new
 * surface is covered by marking itself, not by being added to a list somewhere else.
 *
 * And when the grid does not own the pointer, it points at nothing: moving onto a surface
 * clears the grid's hover rather than leaving the last cell lit beneath it.
 */
export const claimed = (target: EventTarget | null): boolean =>
  Boolean((target as Element | null)?.closest?.("[data-overlay]"));
