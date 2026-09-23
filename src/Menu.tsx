import type { TextStyle, TileKind } from "./model.ts";
import { MARKS } from "./marks.ts";

/**
 * What can go in a cell, grouped by what it is rather than by what it does. The menu is
 * the only place the two families are named, so adding a kind is one row here.
 */
interface Item {
  kind: TileKind;
  label: string;
  style?: TextStyle;
}

const GROUPS: readonly { heading: string; items: readonly Item[] }[] = [
  {
    heading: "text",
    items: [
      { kind: "text", label: "title", style: "title" },
      { kind: "text", label: "note", style: "note" },
    ],
  },
  {
    heading: "utilities",
    items: [
      { kind: "shell", label: "terminal" },
      { kind: "browser", label: "browser" },
    ],
  },
  {
    heading: "agents",
    items: [
      { kind: "claude", label: "claude code" },
      { kind: "codex", label: "codex" },
    ],
  },
];

export function Menu({
  x,
  y,
  onPick,
}: {
  x: number;
  y: number;
  onPick(kind: TileKind, style?: TextStyle): void;
}) {
  return (
    <div className="menu" style={{ left: x, top: y }}>
      {GROUPS.map((group) => (
        <div className="menu-group" key={group.heading}>
          <div className="menu-heading">{group.heading}</div>
          {group.items.map((item) => (
            <button
              className="menu-item"
              type="button"
              key={item.label}
              onClick={() => onPick(item.kind, item.style)}
            >
              <span className="menu-mark">
                {item.kind === "text" ? <TextMark style={item.style} /> : <Mark kind={item.kind} />}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The same path data the canvas draws, rendered as SVG for the menu. */
function Mark({ kind }: { kind: Exclude<TileKind, "text"> }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      {MARKS[kind].map((stroke) => (
        <path
          key={stroke.d}
          d={stroke.d}
          fill={stroke.width === undefined ? "currentColor" : "none"}
          fillRule="evenodd"
          stroke={stroke.width === undefined ? "none" : "currentColor"}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** A serif T for a title; stacked lines for a note. The shapes say which is which. */
function TextMark({ style }: { style?: TextStyle }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      {style === "note" ? (
        <path
          d="M4.5 7h15M4.5 12h15M4.5 17h9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M5.5 6.4h13M12 6.4v11.2M9.2 17.6h5.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
