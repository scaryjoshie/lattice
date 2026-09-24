import { type ReactNode, useMemo, useRef, useState } from "react";

/**
 * A list at the pointer, driven by the keyboard as much as the mouse. Both menus use it,
 * so they cannot end up behaving differently from each other.
 *
 * One selection, owned by whichever device spoke last: hovering moves it rather than
 * competing with it, which is how a menu ends up with two highlights and enter taking the
 * wrong one.
 */

export interface Choice {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface Group {
  heading?: string;
  items: readonly Choice[];
}

export function Popup({
  x,
  y,
  groups,
  search,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  groups: readonly Group[];
  /** Typing filters. Off for short menus, where a list is faster to read than to type at. */
  search?: boolean;
  onPick(id: string): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = search ? query.trim().toLowerCase() : "";
    if (!q) return groups;
    return groups
      .map((group) => ({
        heading: group.heading,
        items: group.heading?.includes(q)
          ? group.items
          : group.items.filter((item) => item.label.includes(q)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query, search]);

  const flat = useMemo(() => shown.flatMap((group) => group.items), [shown]);
  const selected = Math.min(index, Math.max(flat.length - 1, 0));

  return (
    <div
      className="menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <input
        ref={input}
        className="menu-query"
        data-open={(search && query.length > 0) || undefined}
        value={query}
        autoFocus
        spellCheck={false}
        onChange={(e) => {
          if (!search) return;
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
            const item = flat[selected];
            if (item) onPick(item.id);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      {shown.map((group, n) => (
        <div className="menu-group" key={group.heading ?? n}>
          {group.heading && <div className="menu-heading">{group.heading}</div>}
          {group.items.map((item) => (
            <button
              className="menu-item"
              type="button"
              key={item.id}
              data-selected={flat[selected] === item || undefined}
              onPointerEnter={() => setIndex(flat.indexOf(item))}
              onClick={() => onPick(item.id)}
            >
              {item.icon && <span className="menu-mark">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      ))}
      {flat.length === 0 && <div className="menu-heading">no matches</div>}
    </div>
  );
}
