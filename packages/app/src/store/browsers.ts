import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { type Engine, ENGINES, usePreferences } from "./preferences.ts";
import { useGrid } from "./store.ts";

/**
 * The browsers, as the app knows them: each browser tile's tabs and which is current, each
 * tab's page as the shell last said, and the shell's commands for them. A tab's page is a
 * native webview the shell holds, named for its tile and tab, so there are none outside
 * the shell: in a plain browser during development `available` is false and the panel says
 * so. A tab has no page until its first address or search: nothing is loaded for a tab
 * that has not been asked to show anything.
 */
export interface Tab {
  readonly id: string;
  /** Empty until the tab has been sent somewhere. */
  readonly url: string;
  readonly title: string;
  readonly loading: boolean;
}

export interface Tabs {
  readonly tabs: readonly Tab[];
  readonly current: string;
}

interface Store {
  available: boolean;
  browsers: Readonly<Record<string, Tabs>>;
}

export const useBrowsers = create<Store>(() => ({ available: isTauri(), browsers: {} }));

let count = 0;
const fresh = (): Tab => ({ id: `t${++count}`, url: "", title: "", loading: false });

/** A tab's page, as the shell names it. */
const pageOf = (host: string, tab: string) => `${host}-${tab}`;
/** Pages the shell has made, and whose they are, so its events and closes find them. */
const made = new Map<string, { host: string; tab: string }>();

const tabsOf = (host: string): Tabs | undefined => useBrowsers.getState().browsers[host];
const currentOf = (host: string): Tab | undefined => {
  const t = tabsOf(host);
  return t?.tabs.find((x) => x.id === t.current);
};
const put = (host: string, tabs: Tabs) => useBrowsers.setState((s) => ({ browsers: { ...s.browsers, [host]: tabs } }));
const change = (host: string, tab: string, patch: Partial<Tab>) => {
  const t = tabsOf(host);
  if (t) put(host, { ...t, tabs: t.tabs.map((x) => (x.id === tab ? { ...x, ...patch } : x)) });
};
const shut = (page: string) => {
  made.delete(page);
  void invoke("browser_close", { page }).catch(() => {});
};

export const browsers = {
  /** A tile's tabs, made with one empty tab the first time it is opened. */
  ensure(host: string): void {
    if (tabsOf(host)) return;
    const tab = fresh();
    put(host, { tabs: [tab], current: tab.id });
  },

  /** Show a tile's current tab over a rectangle in window pixels, making its page the first
   *  time. A tab not yet sent anywhere has no page to show. */
  show(host: string, at: { x: number; y: number; width: number; height: number }): void {
    const tab = currentOf(host);
    if (!useBrowsers.getState().available || !tab?.url) return;
    const page = pageOf(host, tab.id);
    made.set(page, { host, tab: tab.id });
    // With how tall the page is as the app sees it, so the shell can find where it starts.
    void invoke("browser_show", { page, url: tab.url, ...at, seen: window.innerHeight }).catch(() => {});
  },

  hide(host: string, tab: string): void {
    const page = pageOf(host, tab);
    if (made.has(page)) void invoke("browser_hide", { page }).catch(() => {});
  },

  /** Go to what was typed, in the current tab: the first time, that is where its page is made. */
  go(host: string, input: string): void {
    const tab = currentOf(host);
    const url = addressOf(input, usePreferences.getState().preferences.search);
    if (!tab || !url) return;
    if (!tab.url) change(host, tab.id, { url, loading: true });
    else void invoke("browser_go", { page: pageOf(host, tab.id), url }).catch(() => {});
  },

  step(host: string, step: "back" | "forward" | "reload"): void {
    const tab = currentOf(host);
    if (tab?.url) void invoke("browser_step", { page: pageOf(host, tab.id), step }).catch(() => {});
  },

  /** A new tab beside the current one, current, empty or already sent to `url`. */
  open(host: string, url = ""): void {
    const t = tabsOf(host);
    if (!t) return;
    const tab = { ...fresh(), url, loading: url !== "" };
    const at = t.tabs.findIndex((x) => x.id === t.current);
    put(host, { tabs: [...t.tabs.slice(0, at + 1), tab, ...t.tabs.slice(at + 1)], current: tab.id });
  },

  select(host: string, tab: string): void {
    const t = tabsOf(host);
    if (t?.tabs.some((x) => x.id === tab)) put(host, { ...t, current: tab });
  },

  /** Close a tab and its page. The one beside it becomes current; the last leaves an empty
   *  tab rather than no browser. */
  close(host: string, tab: string): void {
    const t = tabsOf(host);
    if (!t) return;
    if (made.has(pageOf(host, tab))) shut(pageOf(host, tab));
    const at = t.tabs.findIndex((x) => x.id === tab);
    const rest = t.tabs.filter((x) => x.id !== tab);
    if (rest.length === 0) {
      const empty = fresh();
      put(host, { tabs: [empty], current: empty.id });
      return;
    }
    const current = t.current === tab ? rest[Math.min(at, rest.length - 1)]!.id : t.current;
    put(host, { tabs: rest, current });
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
  // What the shell says about a page, merged into its tab.
  void listen<{ page: string; url?: string; title?: string; loading?: boolean }>("browser", ({ payload }) => {
    const whose = made.get(payload.page);
    const tab = whose && tabsOf(whose.host)?.tabs.find((x) => x.id === whose.tab);
    if (!whose || !tab) return;
    change(whose.host, whose.tab, {
      url: payload.url ?? tab.url,
      // A new address is a new page: its title is not the last one's.
      title: payload.title ?? (payload.url && payload.url !== tab.url ? "" : tab.title),
      loading: payload.loading ?? tab.loading,
    });
  });
  // A page asked for a new window: a new tab beside it, in the same tile.
  void listen<{ from: string; url: string }>("browser-tab", ({ payload }) => {
    const whose = made.get(payload.from);
    if (whose) browsers.open(whose.host, payload.url);
  });
  // A browser tile that leaves the grid takes its tabs and their pages with it.
  useGrid.subscribe(({ grid }) => {
    const here = new Set(grid.tiles.map((t) => t.id));
    for (const [page, { host }] of made) if (!here.has(host)) shut(page);
    const gone = Object.keys(useBrowsers.getState().browsers).filter((host) => !here.has(host));
    if (gone.length === 0) return;
    useBrowsers.setState((s) => ({ browsers: Object.fromEntries(Object.entries(s.browsers).filter(([host]) => !gone.includes(host))) }));
  });
}
