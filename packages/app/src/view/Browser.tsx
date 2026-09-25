import { type ReactNode, useEffect, useRef, useState } from "react";
import { browsers, useBrowsers } from "../store/browsers.ts";
import { OCCUPANTS } from "../occupants/index.ts";
import { Mark } from "./Menu.tsx";

/**
 * A browser tile's page, in its opened panel: a bar with back, forward, reload and the
 * address, and below it the area the shell's native webview is placed over. Native, the
 * page cannot scale or be frosted, so it is shown once the panel has landed and hidden the
 * moment the panel starts back; while it is up it follows the window's size. Before its
 * first address there is no page: the bar is empty and has the keys, and the area is grey
 * with the browser's mark. Outside the shell there are no browsers, and the area says so.
 */
export function Browser({ host, shown }: { host: string; shown: boolean }) {
  const available = useBrowsers((s) => s.available);
  const page = useBrowsers((s) => s.pages[host]);
  const area = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const bar = useRef<HTMLInputElement>(null);
  const started = page !== undefined;

  // A browser with nothing in it is waiting to be told where to go.
  useEffect(() => {
    if (shown && !started) bar.current?.focus();
  }, [shown, started]);

  useEffect(() => {
    const el = area.current;
    if (!el || !shown || !started) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      browsers.show(host, { x: r.left, y: r.top, width: r.width, height: r.height });
    };
    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      browsers.hide(host);
    };
  }, [host, shown, started]);

  const address = draft ?? page?.url ?? "";
  return (
    <div className="browser">
      <div className="browser-bar">
        <Glyph label="back" onClick={() => browsers.step(host, "back")}>
          <path d="m15 18-6-6 6-6" />
        </Glyph>
        <Glyph label="forward" onClick={() => browsers.step(host, "forward")}>
          <path d="m9 18 6-6-6-6" />
        </Glyph>
        <Glyph label="reload" onClick={() => browsers.step(host, "reload")}>
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </Glyph>
        <input
          ref={bar}
          className="browser-address"
          spellCheck={false}
          value={address}
          data-loading={page?.loading || undefined}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              browsers.go(host, address);
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      <div className="browser-page" ref={area} data-empty={!started || undefined}>
        {!started && available && (
          <span className="browser-mark">
            <Mark mark={OCCUPANTS.browser.mark} />
          </span>
        )}
        {!available && <span className="browser-none">browsers run in the app window</span>}
      </div>
    </div>
  );
}

/** A bar button: one of Lucide's glyphs (ISC), in the toolbar's stroke. */
function Glyph({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" className="browser-button" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
