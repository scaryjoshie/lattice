import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Browser } from "./Browser.tsx";
import { Term } from "./Term.tsx";

/**
 * A tile opened: the same rectangle, drawn bigger. The panel lives at its full size and is
 * shown scaled down to the tile's own rectangle, then scaled up to 1 — a transform and
 * nothing else, so nothing reflows and nothing inside is measured on the way. What is
 * inside fades in once the panel has arrived, because a card and a terminal are different
 * representations rather than two sizes of one thing. A terminal host holds its terminal;
 * anything else, nothing yet. Cmd-Escape or Cmd-period closes it: Escape itself is the
 * agent's.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Opened({
  name,
  terminal,
  browser,
  from,
  to,
  pulse,
  onLeave,
  onClose,
}: {
  name?: string;
  /** The host whose terminal this shows, when it is a terminal host. */
  terminal?: string;
  /** The host whose page this shows, when it is a browser host. */
  browser?: string;
  from: Rect;
  to: Rect;
  /** The tile's edge colour, which its outline is drawn in. */
  pulse: string;
  /** Closing has begun: the panel is on its way back. */
  onLeave(): void;
  onClose(): void;
}) {
  const [arrived, setArrived] = useState(false);
  /** The opening has finished: the panel is still, and may be frosted. */
  const [settled, setSettled] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** The panel has shrunk back into its tile, whose outline then fades. */
  const [absorbed, setAbsorbed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Where it starts: the tile's rectangle, as a transform of the full-size panel.
  const start = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w}, ${from.h / to.h})`;

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    el.style.transform = start;
    // Next frame, so the start is painted before the transition begins.
    // The panel's own transform, not a transition inside it bubbling up.
    const done = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== "transform") return;
      el.removeEventListener("transitionend", done);
      setSettled(true);
    };
    el.addEventListener("transitionend", done);
    const frame = requestAnimationFrame(() => {
      el.style.transform = "translate(0, 0) scale(1, 1)";
      setArrived(true);
    });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("transitionend", done);
    };
  }, [start]);

  const close = () => {
    const el = panel.current;
    if (!el || leaving) return;
    setLeaving(true);
    onLeave();
    el.style.transform = start;
    // The panel's own transform, not the fade inside it, which can end first.
    const back = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== "transform") return;
      el.removeEventListener("transitionend", back);
      setAbsorbed(true);
    };
    el.addEventListener("transitionend", back);
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

  // In the shell, Cmd-Escape is also the menu's Close Panel, which reaches here even while a
  // browser's native page has the keys.
  useEffect(() => {
    if (!isTauri()) return;
    const stop = listen("close-panel", () => close());
    return () => void stop.then((unlisten) => unlisten());
  });

  return (
    <div className="opened" data-overlay data-absorbed={absorbed || undefined} onPointerDown={close}>
      {/* The tile the panel came from, outlined in its edge colour and nothing else: behind
          the panel while it is open, in front as it goes back, then fading once it is in. */}
      <div
        className="opened-ring"
        data-phase={absorbed ? "gone" : leaving ? "closing" : arrived ? "open" : undefined}
        style={{ left: from.x, top: from.y, width: from.w, height: from.h, color: pulse }}
        onAnimationEnd={(e) => {
          if (e.animationName === "ring-out") onClose();
        }}
      />
      <div
        ref={panel}
        className="opened-panel"
        data-settled={(settled && !leaving) || undefined}
        data-leaving={leaving || undefined}
        style={{ left: to.x, top: to.y, width: to.w, height: to.h }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="opened-body" data-shown={(arrived && !leaving) || undefined}>
          {terminal && <Term host={terminal} width={to.w} height={to.h} />}
          {browser && <Browser host={browser} shown={settled && !leaving} />}
        </div>
      </div>
    </div>
  );
}
