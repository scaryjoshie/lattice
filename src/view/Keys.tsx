/**
 * What the keys and the pointer do right now, bottom left. This is the gesture table made
 * visible: one row per meaning, filtered by what the grid is in the middle of. Keys are
 * drawn as caps, the pointer as a mouse with the relevant part filled in the move colour,
 * and anything else as a plain word.
 */

export type Mode = "idle" | "selected" | "scope" | "invalid" | "moving" | "menu" | "list" | "typing";

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

export function Keys({ mode, hidden }: { mode: Mode; hidden?: boolean }) {
  return (
    <div className="keys" aria-hidden="true" data-hidden={hidden || undefined}>
      {ROWS[mode].map(([chord, means]) => (
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
  );
}
