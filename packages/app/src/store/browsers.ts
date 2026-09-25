import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { type Engine, ENGINES, usePreferences } from "./preferences.ts";
import { useGrid } from "./store.ts";

/**
 * The browsers, as the app knows them: each browser tile's page, as the shell last said,
 * and the shell's commands for them. A browser is a native webview the shell holds, so
 * there are none outside the shell: in a plain browser during development `available` is
 * false and the panel says so. A browser has no page until its first address or search:
 * nothing is loaded for a tile that has not been asked to show anything.
 */
export interface Page {
  readonly url: string;
  readonly title: string;
  readonly loading: boolean;
}

interface Store {
  available: boolean;
  pages: Readonly<Record<string, Page>>;
}

export const useBrowsers = create<Store>(() => ({ available: isTauri(), pages: {} }));

/** Browsers the shell has made, so one can be closed when its tile leaves the grid. */
const made = new Set<string>();

export const browsers = {
  /** Show a tile's browser over a rectangle in window pixels, making it at its first page
   *  the first time. A tile with no page yet has no browser to show. */
  show(host: string, at: { x: number; y: number; width: number; height: number }): void {
    const page = useBrowsers.getState().pages[host];
    if (!useBrowsers.getState().available || !page) return;
    made.add(host);
    // With how tall the page is as the app sees it, so the shell can find where it starts.
    void invoke("browser_show", { host, url: page.url, ...at, seen: window.innerHeight }).catch(() => {});
  },
  hide(host: string): void {
    if (made.has(host)) void invoke("browser_hide", { host }).catch(() => {});
  },
  /** Go to what was typed: the first time, that is the page the browser is made at. */
  go(host: string, input: string): void {
    const url = addressOf(input, usePreferences.getState().preferences.search);
    if (!url) return;
    if (!useBrowsers.getState().pages[host]) {
      useBrowsers.setState((s) => ({ pages: { ...s.pages, [host]: { url, title: "", loading: true } } }));
      return;
    }
    void invoke("browser_go", { host, url }).catch(() => {});
  },
  step(host: string, step: "back" | "forward" | "reload"): void {
    void invoke("browser_step", { host, step }).catch(() => {});
  },
};

/**
 * What an address bar entry means: an address as typed if it has a scheme, the same with
 * https if it looks like a host, and otherwise a search with the chosen engine.
 */
export function addressOf(input: string, engine: Engine): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith("about:")) return text;
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(text)) {
    return `${/^localhost|^\d+\.\d+\.\d+\.\d+/.test(text) ? "http" : "https"}://${text}`;
  }
  return `${ENGINES[engine].search}${encodeURIComponent(text)}`;
}

if (useBrowsers.getState().available) {
  // What the shell says about a page, merged into what is known.
  void listen<{ host: string; url?: string; title?: string; loading?: boolean }>("browser", ({ payload }) => {
    useBrowsers.setState((s) => {
      const was = s.pages[payload.host] ?? { url: "", title: "", loading: true };
      return {
        pages: {
          ...s.pages,
          [payload.host]: {
            url: payload.url ?? was.url,
            // A new address is a new page: its title is not the last one's.
            title: payload.title ?? (payload.url && payload.url !== was.url ? "" : was.title),
            loading: payload.loading ?? was.loading,
          },
        },
      };
    });
  });
  // A browser tile that leaves the grid takes its browser with it.
  useGrid.subscribe(({ grid }) => {
    const here = new Set(grid.tiles.map((t) => t.id));
    for (const host of made) {
      if (here.has(host)) continue;
      made.delete(host);
      void invoke("browser_close", { host }).catch(() => {});
    }
  });
}
