import { useMemo, useRef, useState } from "react";
import { MARKS } from "./marks.ts";
import type { TextStyle, TileKind } from "./model.ts";

/**
 * What can go in a cell, grouped by what a thing is rather than by what it does. This is
 * the only place the families are named, so adding a kind is one row.
 *
 * Typing filters. The input is there from the moment the menu opens so that keystrokes are
 * never lost, but stays invisible until there is something to show — the menu is a list
 * until you treat it as a search, and then it is a search.
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
  onClose,
}: {
  x: number;
  y: number;
  onPick(kind: TileKind, style?: TextStyle): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // The heading matches too, so "agents" finds both of them.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((group) => ({
      heading: group.heading,
      items: group.heading.includes(q)
        ? group.items
        : group.items.filter((item) => item.label.includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const selected = Math.min(index, Math.max(flat.length - 1, 0));

  const pick = (item: Item | undefined) => {
    if (item) onPick(item.kind, item.style);
  };

  return (
    <div
      className="menu"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <input
        ref={input}
        className="menu-query"
        data-open={query.length > 0 || undefined}
        value={query}
        autoFocus
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onBlur={() => input.current?.focus()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((n) => (n + 1) % Math.max(flat.length, 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((n) => (n - 1 + flat.length) % Math.max(flat.length, 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(flat[selected]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      {groups.map((group) => (
        <div className="menu-group" key={group.heading}>
          <div className="menu-heading">{group.heading}</div>
          {group.items.map((item) => (
            <button
              className="menu-item"
              type="button"
              key={item.label}
              data-selected={flat[selected] === item || undefined}
              onPointerEnter={() => setIndex(flat.indexOf(item))}
              onClick={() => pick(item)}
            >
              <span className="menu-mark">
                {item.kind === "text" ? <TextMark style={item.style} /> : <Mark kind={item.kind} />}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
      {flat.length === 0 && <div className="menu-heading">no matches</div>}
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

/** A T for a title; stacked lines for a note. The shapes say which is which. */
function TextMark({ style }: { style?: TextStyle }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={
          style === "note"
            ? "M4.5 7h15M4.5 12h15M4.5 17h9"
            : "M5.5 6.4h13M12 6.4v11.2M9.2 17.6h5.6"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth={style === "note" ? 2 : 2.1}
        strokeLinecap="round"
      />
    </svg>
  );
}
