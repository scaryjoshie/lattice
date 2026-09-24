import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A tile opened: the same rectangle, drawn bigger. The panel lives at its full size and is
 * shown scaled down to the tile's own rectangle, then scaled up to 1 — a transform and
 * nothing else, so nothing reflows and nothing inside is measured on the way. What is
 * inside fades in once the panel has arrived, because a card and a terminal are different
 * representations rather than two sizes of one thing. For now what is inside is nothing.
 * Cmd-period closes it: Escape itself is the agent's.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Opened({
  name,
  from,
  to,
  onLeave,
  onClose,
}: {
  name?: string;
  from: Rect;
  to: Rect;
  /** Closing has begun: the panel is on its way back. */
  onLeave(): void;
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
    onLeave();
    el.style.transform = start;
    el.addEventListener("transitionend", onClose, { once: true });
  };

  // Cmd is the application layer; every other key belongs to what is inside, and Escape
  // in particular belongs to the agent. Cmd-Escape leaves. Cmd-period, the Mac's own
  // cancel chord, leaves too: a browser can take Cmd-Escape before the page sees it, which
  // Aside did mid-session. In the Tauri shell the webview is ours and this goes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && (e.key === "Escape" || e.key === ".")) {
        e.preventDefault();
        close();
      }
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
          {/* The terminal, once there is one. */}
        </div>
      </div>
    </div>
  );
}
