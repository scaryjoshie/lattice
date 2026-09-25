import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { OCCUPANTS } from "../occupants/index.ts";
import { browsers, type Tab, useBrowsers } from "../store/browsers.ts";
import { Mark } from "./Menu.tsx";

/**
 * A browser tile's tabs, in its opened panel: a row of tabs with a new-tab button, a bar
 * with back, forward, reload and the current tab's address, and below them the area the
 * shell's native page is placed over. Each tab is its own page; the current one is shown
 * and the rest hidden, so each keeps its place. Native, a page cannot scale or be frosted,
 * so it is shown once the panel has landed and hidden the moment the panel starts back;
 * while it is up it follows the window's size. A tab not yet sent anywhere has no page:
 * the bar is empty and has the keys, and the area is grey with the browser's mark. Outside
 * the shell there are no browsers, and the area says so.
 */
export function Browser({ host, shown }: { host: string; shown: boolean }) {
  const available = useBrowsers((s) => s.available);
  const tabs = useBrowsers((s) => s.browsers[host]);
  const area = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => browsers.ensure(host), [host]);
  const current = tabs?.tabs.find((t) => t.id === tabs.current);
  const started = Boolean(current?.url);

  // A tab with nothing in it is waiting to be told where to go.
  useEffect(() => {
    setDraft(null);
    if (shown && current && !started) bar.current?.focus();
  }, [shown, current?.id, started]);

  // The current tab's page, over the area, while the panel is still; hidden when the panel
  // goes, or when another tab becomes current.
  useEffect(() => {
    const el = area.current;
    const tab = current?.id;
    if (!el || !shown || !tab || !started) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      browsers.show(host, { x: r.left, y: r.top, width: r.width, height: r.height });
    };
    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      browsers.hide(host, tab);
    };
  }, [host, shown, current?.id, started]);

  // The menu's New Tab, which reaches here even while a page has the keys.
  useEffect(() => {
    if (!isTauri() || !shown) return;
    const stop = listen("new-tab", () => browsers.open(host));
    return () => void stop.then((unlisten) => unlisten());
  }, [host, shown]);

  const address = draft ?? current?.url ?? "";
  return (
    <div className="browser">
      <div className="browser-tabs">
        {tabs?.tabs.map((tab) => (
          <TabButton key={tab.id} tab={tab} current={tab.id === tabs.current} onSelect={() => browsers.select(host, tab.id)} onClose={() => browsers.close(host, tab.id)} />
        ))}
        <Glyph label="new tab" onClick={() => browsers.open(host)}>
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </Glyph>
      </div>
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
          data-loading={current?.loading || undefined}
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

/** A tab: its page's title, or where it is, or "new tab"; a close on hover. */
function TabButton({ tab, current, onSelect, onClose }: { tab: Tab; current: boolean; onSelect(): void; onClose(): void }) {
  const name = tab.title || (tab.url ? hostOf(tab.url) : "new tab");
  return (
    <span className="browser-tab" data-current={current || undefined} onPointerDown={onSelect} title={tab.title || tab.url}>
      <span className="browser-tab-name">{name}</span>
      <button type="button" className="browser-tab-close" aria-label="close tab" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </span>
  );
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

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
