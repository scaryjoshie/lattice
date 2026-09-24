import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MARKS } from "./marks.ts";
import type { OccupantKind } from "./model.ts";

/**
 * A tile opened: the same rectangle, drawn bigger. The panel lives at its full size and is
 * shown scaled down to the tile's own rectangle, then scaled up to 1 — a transform and
 * nothing else, so nothing reflows and nothing inside is measured on the way. What is
 * inside fades in once the panel has arrived, because a card and a terminal are different
 * representations rather than two sizes of one thing. For now what is inside is nothing.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Opened({
  kind,
  name,
  from,
  to,
  onClose,
}: {
  kind: OccupantKind;
  name?: string;
  from: Rect;
  to: Rect;
  onClose(): void;
}) {
  const [arrived, setArrived] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Where it starts: the tile's rectangle, as a transform of the full-size panel.
  const start = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w}, ${from.h / to.h})`;

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    el.style.transform = start;
    // Next frame, so the start is painted before the transition begins.
    const frame = requestAnimationFrame(() => {
      el.style.transform = "translate(0, 0) scale(1, 1)";
      setArrived(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [start]);

  const close = () => {
    const el = panel.current;
    if (!el || leaving) return;
    setLeaving(true);
    el.style.transform = start;
    el.addEventListener("transitionend", onClose, { once: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="opened" onPointerDown={close}>
      <div
        ref={panel}
        className="opened-panel"
        style={{ left: to.x, top: to.y, width: to.w, height: to.h }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="opened-body" data-shown={(arrived && !leaving) || undefined}>
          <div className="opened-head">
            <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
              {MARKS[kind].map((s) => (
                <path
                  key={s.d}
                  d={s.d}
                  fill={s.width === undefined ? "currentColor" : "none"}
                  fillRule="evenodd"
                  stroke={s.width === undefined ? "none" : "currentColor"}
                  strokeWidth={s.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
            {name && <span>{name}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
