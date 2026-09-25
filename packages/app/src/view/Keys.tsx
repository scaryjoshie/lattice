import { useLayoutEffect, useRef, useState } from "react";
/**
 * What the keys and the pointer do right now, bottom left. This is the gesture table made
 * visible: one row per meaning, filtered by what the grid is in the middle of. Keys are
 * drawn as caps, the pointer as a mouse with the relevant part filled in the move colour,
 * and anything else as a plain word.
 */

import type { Mode } from "../scene/scene.ts";

/** A chord is keys, pointer parts and words in order. */
type Row = readonly [chord: readonly string[], means: string];

const KEYS = new Set(["shift", "⌘", "z", "enter", "esc", "↑", "↓"]);
const MOUSE = { click: "left", "right-click": "right", wheel: "wheel", drag: "left" } as const;

const ROWS: Record<Mode, readonly Row[]> = {
  idle: [
    [["click"], "select"],
    [["drag"], "pan"],
    [["shift", "drag"], "select area"],
    [["shift", "click"], "add"],
    [["right-click"], "menu"],
    [["wheel"], "zoom"],
    [["⌘", "z"], "undo"],
  ],
  selected: [
    [["shift", "click"], "open"],
    [["drag"], "move"],
    [["shift", "drag"], "extend"],
    [["shift", "click"], "extend"],
    [["click"], "deselect"],
    [["right-click"], "menu"],
    [["esc"], "clear"],
  ],
  scope: [
    [["drag"], "move"],
    [["drag", "line"], "resize"],
    [["shift", "drag"], "extend"],
    [["click"], "deselect"],
    [["esc"], "clear"],
  ],
  invalid: [
    [["shift", "click"], "extend"],
    [["click"], "select"],
    [["esc"], "clear"],
  ],
  moving: [
    [["release"], "place"],
    [["esc"], "cancel"],
  ],
  menu: [
    [["type"], "search"],
    [["↑", "↓"], "choose"],
    [["enter"], "pick"],
    [["esc"], "close"],
  ],
  list: [
    [["↑", "↓"], "choose"],
    [["enter"], "pick"],
    [["esc"], "close"],
  ],
  typing: [
    [["enter"], "commit"],
    [["esc"], "cancel"],
  ],
};

/** A mouse, 16 by 22, with one part filled: a button, or the wheel. */
function Mouse({ part }: { part: "left" | "right" | "wheel" }) {
  const body = "M1.5 8a6.5 6.5 0 0 1 13 0v6a6.5 6.5 0 0 1-13 0z";
  return (
    <svg className="keys-mouse" viewBox="0 0 16 22" aria-hidden="true">
      <defs>
        <clipPath id={`mouse-${part}`}>
          <path d={body} />
        </clipPath>
      </defs>
      {part === "left" && (
        <rect className="keys-part" x="1.5" y="1.5" width="6.5" height="7.5" clipPath={`url(#mouse-${part})`} />
      )}
      {part === "right" && (
        <rect className="keys-part" x="8" y="1.5" width="6.5" height="7.5" clipPath={`url(#mouse-${part})`} />
      )}
      {part === "wheel" && <rect className="keys-part" x="6.9" y="4" width="2.2" height="4.4" rx="1.1" />}
      <path d={body} fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.5v7.5M1.5 9h13" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function Token({ k }: { k: string }) {
  if (KEYS.has(k)) return <kbd>{k}</kbd>;
  const part = (MOUSE as Record<string, "left" | "right" | "wheel" | undefined>)[k];
  if (part) {
    return (
      <span className="keys-pointer">
        <Mouse part={part} />
        {k === "drag" && <span className="keys-verb">drag</span>}
      </span>
    );
  }
  return <span className="keys-verb">{k}</span>;
}

export function Keys({
  mode,
  hidden,
  offline,
  collapsed,
  onToggle,
}: {
  mode: Mode;
  hidden?: boolean;
  offline?: boolean;
  /** Folded into its "i". */
  collapsed?: boolean;
  onToggle(): void;
}) {
  // With no daemon there is nothing to do to the grid, and the panel says so in place of
  // the keys rather than listing keys that would do nothing.
  const rows: readonly Row[] = offline ? [[["daemon"], "offline"]] : ROWS[mode];
  // The frame is sized from the keys, so it can spring between that and a circle: a width
  // and height to move between, which a size from the layout would not give it.
  const inner = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setSize({ width: el.offsetWidth + 2, height: el.offsetHeight + 2 });
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return (
    <div
      className="keys"
      data-overlay
      data-hidden={hidden || undefined}
      data-collapsed={collapsed || undefined}
      style={collapsed ? { width: 34, height: 34 } : (size ?? undefined)}
      role="button"
      aria-label={collapsed ? "show keys" : "hide keys"}
      onClick={onToggle}
    >
      <div className="keys-inner" ref={inner}>
        {rows.map(([chord, means]) => (
          <div className="keys-row" key={means + chord.join()}>
            <span className="keys-chord">
              {chord.map((k, i) => (
                <Token k={k} key={`${k}${i}`} />
              ))}
            </span>
            <span className="keys-means">{means}</span>
          </div>
        ))}
      </div>
      <span className="keys-info" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </span>
    </div>
  );
}
