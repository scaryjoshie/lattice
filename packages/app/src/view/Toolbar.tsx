import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StepView } from "../scene/steps.ts";

/**
 * Quick actions, top right, in the key panel's surface: undo and redo, the way home and
 * the zoom, and settings. Icons only; the zoom is a number, written straight into its
 * label by the camera, since the camera never touches React. Hovering undo or redo lists
 * the steps it would take, and a row goes that many at once, as Word's undo list and
 * Photoshop's history do.
 */
export function Toolbar({
  zoom,
  hidden,
  history,
  onUndo,
  onRedo,
  onHome,
  onActualSize,
  onSettings,
}: {
  zoom: RefObject<HTMLSpanElement | null>;
  /** While a tile is open, as the key panel does. */
  hidden?: boolean;
  /** The steps undo would take back, newest first, and redo would do again, next first. */
  history: { undo: readonly StepView[]; redo: readonly StepView[] };
  onUndo(steps?: number): void;
  onRedo(steps?: number): void;
  onHome(): void;
  onActualSize(): void;
  onSettings(): void;
}) {
  return (
    <div className="toolbar" data-overlay data-hidden={hidden || undefined}>
      <Stepping which="undo" steps={history.undo} onGo={onUndo}>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </Stepping>
      <Stepping which="redo" steps={history.redo} onGo={onRedo}>
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
      </Stepping>
      <span className="toolbar-divider" />
      <Button label="home" onClick={onHome}>
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </Button>
      <button type="button" className="toolbar-button toolbar-zoom" aria-label="actual size" onClick={onActualSize}>
        <span ref={zoom}>100%</span>
      </button>
      <span className="toolbar-divider" />
      <Button label="settings" onClick={onSettings}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </Button>
    </div>
  );
}

/** One action, as a glyph. The glyphs are Lucide's (ISC): one stroke weight, no fill. */
function Button({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" className="toolbar-button" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

/** How far a resting pointer scrolls a list, in pixels per frame. */
const DRIFT = 5;
/** How long the pointer may be between the button and its list before the list goes. */
const LINGER_MS = 160;

/**
 * Undo or redo, and the list that hovering it opens: one row per step, the nearest first,
 * or "none". The row under the pointer is lit; the rows above it, which a click there would
 * also take, are tinted, and every row it would take carries the button's own arrow.
 * Clicking the button still takes one. The list is rendered into the page rather than the
 * toolbar: a blur inside a blurred element blurs only that element, which left the list a
 * flat, lighter shade than the pill it hangs from.
 */
function Stepping({ which, steps, onGo, children }: { which: string; steps: readonly StepView[]; onGo(steps?: number): void; children: ReactNode }) {
  const [at, setAt] = useState<{ x: number; y: number; width: number } | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  /** Rows out of sight below, as the "+N" at the bottom says, and whether it scrolls at all. */
  const [hidden, setHidden] = useState({ below: 0, overflows: false });
  const anchor = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const drift = useRef(0);
  const count = () => {
    const el = list.current;
    if (!el) return;
    // Row positions are from the list's box, not the scrolling part of it inside.
    const rows = [...el.querySelectorAll<HTMLElement>(".history-row")].map((r) => r.offsetTop - el.offsetTop + r.offsetHeight / 2);
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    setHidden({
      below: rows.filter((mid) => mid > bottom).length,
      overflows: el.scrollHeight > el.clientHeight,
    });
  };
  // Resting on the "+N" scrolls down until the end or until the pointer leaves it; the
  // wheel scrolls either way.
  const scroll = () => {
    const step = () => {
      const el = list.current;
      if (!el) return;
      el.scrollTop += DRIFT;
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 1) drift.current = requestAnimationFrame(step);
    };
    drift.current = requestAnimationFrame(step);
  };
  const still = () => cancelAnimationFrame(drift.current);
  useLayoutEffect(count, [at, steps]);
  const leave = useRef(0);
  const stay = () => {
    clearTimeout(leave.current);
    // Directly under the pill and as wide as it, the same place for undo and redo: the
    // rows' arrows say which it is, and the lit button says it again.
    const box = anchor.current?.closest(".toolbar")?.getBoundingClientRect();
    if (box && !at) setAt({ x: box.left, y: box.bottom + 8, width: box.width });
  };
  const go = () => {
    leave.current = window.setTimeout(() => {
      setAt(null);
      setHot(null);
    }, LINGER_MS);
  };
  const glyph = (
    <svg className="history-go" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
  return (
    <span className="stepping" ref={anchor} data-open={at !== null || undefined} onPointerEnter={stay} onPointerLeave={go}>
      <Button label={which} onClick={() => onGo()}>
        {children}
      </Button>
      {at &&
        createPortal(
          // No handlers of its own: React counts a portal's contents as inside the element that
          // rendered it, so the button's enter and leave already cover the list, and a second
          // pair started a close on the way back to the button that nothing cancelled.
          <div className="history" style={{ left: at.x, top: at.y, width: at.width }}>
            {steps.length === 0 && <span className="history-none">none</span>}
            <div className="history-rows" ref={list} onScroll={count}>
              {steps.map((step, i) => (
                <button
                  type="button"
                  // A row is a position in the list: the step that many back.
                  key={i}
                  className="history-row"
                  data-hot={hot === i || undefined}
                  data-taken={(hot !== null && i < hot) || undefined}
                  onPointerEnter={() => setHot(i)}
                  onPointerLeave={() => setHot(null)}
                  onClick={() => {
                    onGo(i + 1);
                    setHot(null);
                  }}
                >
                  <Act act={step.act} />
                  <span className="history-label">{step.label}</span>
                  {glyph}
                </button>
              ))}
            </div>
            {/* Kept, blank, once the end is reached, so the list does not shrink under a
                pointer resting on it. */}
            {hidden.overflows && (
              <span className="history-more" onPointerEnter={scroll} onPointerLeave={still}>
                {hidden.below > 0 ? `+${hidden.below}` : ""}
              </span>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

/** The act a step was, as a glyph in the toolbar's stroke. */
function Act({ act }: { act: StepView["act"] }) {
  const paths: Record<StepView["act"], ReactNode> = {
    place: (
      <>
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </>
    ),
    remove: (
      <>
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </>
    ),
    move: (
      <>
        <path d="m5 9-3 3 3 3" />
        <path d="m9 5 3-3 3 3" />
        <path d="m15 19-3 3-3-3" />
        <path d="m19 9 3 3-3 3" />
        <path d="M2 12h20" />
        <path d="M12 2v20" />
      </>
    ),
    resize: (
      <>
        <path d="M15 3h6v6" />
        <path d="M9 21H3v-6" />
        <path d="m21 3-7 7" />
        <path d="m3 21 7-7" />
      </>
    ),
    text: (
      <>
        <path d="M4 7V4h16v3" />
        <path d="M9 20h6" />
        <path d="M12 4v16" />
      </>
    ),
    name: <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />,
  };
  return (
    <svg className="history-act" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[act]}
    </svg>
  );
}
