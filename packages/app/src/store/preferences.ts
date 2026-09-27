import { DEFAULT_PREFERENCES, type Engine, type Patch, type Preferences } from "@lattice/protocol";
import { create } from "zustand";
import { client } from "./client.ts";

/**
 * The app's settings (docs/settings.md), as the daemon last sent them, and the defaults
 * until it has. The daemon owns them, in `~/.lattice/preferences.json`; `prefer` sends a
 * change and the settings come back, to this window and every other. Nothing is applied
 * here, as nothing is in the grid's store.
 */
export type { Engine, Preferences, Theme } from "@lattice/protocol";
export { providerOf } from "@lattice/protocol";

/** Where each search engine sends what was typed. The names are the protocol's. */
export const ENGINES = {
  google: { search: "https://www.google.com/search?q=" },
  duckduckgo: { search: "https://duckduckgo.com/?q=" },
  bing: { search: "https://www.bing.com/search?q=" },
  kagi: { search: "https://kagi.com/search?q=" },
} as const satisfies Record<Engine, { search: string }>;

interface Store {
  preferences: Preferences;
  /** A change; the answer is the settings as they now are, or as they were if it failed. */
  prefer(patch: Patch): Promise<Preferences>;
}

export const usePreferences = create<Store>((_set, get) => ({
  preferences: DEFAULT_PREFERENCES,
  async prefer(patch) {
    try {
      return (await client.call("prefer", { patch })).preferences;
    } catch {
      return get().preferences;
    }
  },
}));

client.on("preferences", ({ preferences }) => usePreferences.setState({ preferences }));
