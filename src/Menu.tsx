import type { TileKind } from "./model.ts";
import { Mark } from "./marks.tsx";

/**
 * What can go in a cell, grouped by what it is rather than by what it does. The menu is
 * the only place the two families are named, so adding a kind is one row here.
 */
const GROUPS: readonly { heading: string; items: readonly { kind: TileKind; label: string }[] }[] = [
  {
    heading: "utilities",
    items: [
      { kind: "text", label: "text" },
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
  onPick(kind: TileKind): void;
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
              key={item.kind}
              onClick={() => onPick(item.kind)}
            >
              <span className="menu-mark">
                {item.kind === "text" ? <TextMark /> : <Mark kind={item.kind} />}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function TextMark() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5.5 6.4h13M12 6.4v11.2M9.2 17.6h5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
