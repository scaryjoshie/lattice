import { create } from "zustand";
import { PROVIDERS, type ProviderId } from "../providers/index.ts";

/**
 * The app's settings (docs/settings.md), as the settings panel reads them. A mock for now:
 * held here and lost on reload. When the daemon owns them this store is fed by it the way
 * the grid store is, and nothing that reads it changes.
 */
export type ThemeChoice = "system" | "light" | "dark";

export interface Provider {
  readonly enabled: boolean;
  /** The command that starts it. Found on the path when there is one. */
  readonly command: string;
}

export interface Preferences {
  readonly theme: ThemeChoice;
  /** The key panel, bottom left. */
  readonly keys: boolean;
  readonly providers: Readonly<Record<ProviderId, Provider>>;
}

interface Store {
  preferences: Preferences;
  prefer(patch: Partial<Preferences>): void;
  preferProvider(id: ProviderId, patch: Partial<Provider>): void;
}

const providers = Object.fromEntries(
  Object.keys(PROVIDERS).map((id) => [id, { enabled: true, command: id }]),
) as Record<ProviderId, Provider>;

export const usePreferences = create<Store>((set) => ({
  preferences: { theme: "system", keys: true, providers },
  prefer(patch) {
    set((s) => ({ preferences: { ...s.preferences, ...patch } }));
  },
  preferProvider(id, patch) {
    set((s) => ({
      preferences: {
        ...s.preferences,
        providers: { ...s.preferences.providers, [id]: { ...s.preferences.providers[id], ...patch } },
      },
    }));
  },
}));
