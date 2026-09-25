import type { ReactNode, RefObject } from "react";

/**
 * Quick actions, top right, in the key panel's surface: undo and redo, the way home and
 * the zoom, and settings. Icons only; the zoom is a number, written straight into its
 * label by the camera, since the camera never touches React.
 */
export function Toolbar({
  zoom,
  hidden,
  onUndo,
  onRedo,
  onHome,
  onActualSize,
  onSettings,
}: {
  zoom: RefObject<HTMLSpanElement | null>;
  /** While a tile is open, as the key panel does. */
  hidden?: boolean;
  onUndo(): void;
  onRedo(): void;
  onHome(): void;
  onActualSize(): void;
  onSettings(): void;
}) {
  return (
    <div className="toolbar" data-hidden={hidden || undefined}>
      <Button label="undo" onClick={onUndo}>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </Button>
      <Button label="redo" onClick={onRedo}>
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
      </Button>
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
