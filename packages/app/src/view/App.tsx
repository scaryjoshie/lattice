import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isRun } from "@lattice/model";
import { useCallback, useEffect, useState } from "react";
import { dark, followSystem, light, setTheme } from "../paint/theme.ts";
import { browsers, useBrowsers } from "../store/browsers.ts";
import { usePreferences } from "../store/preferences.ts";
import { useSession } from "../store/session.ts";
import { useGrid } from "../store/store.ts";
import { Grid } from "./Grid.tsx";
import { Settings } from "./Settings.tsx";

export function App() {
  // The theme is a setting: the system's, or one chosen.
  const choice = usePreferences((s) => s.preferences.theme);
  useEffect(() => {
    // The window's appearance too, which a browser's pages follow for light and dark.
    if (isTauri()) void invoke("appearance", { theme: choice }).catch(() => {});
    if (choice === "system") return followSystem();
    setTheme(choice === "dark" ? dark : light);
  }, [choice]);

  // The menu's Close, Cmd-W: the current tab when a browser is open, the window otherwise,
  // which goes through the same ask as its close button.
  useEffect(() => {
    if (!isTauri()) return;
    const stop = listen("close", () => {
      const opened = useSession.getState().session.opened;
      const tile = opened && useGrid.getState().grid.tiles.find((t) => t.id === opened.id);
      const tabs = tile && !isRun(tile) && tile.surface === "webview" ? useBrowsers.getState().browsers[tile.id] : undefined;
      if (tile && tabs) browsers.close(tile.id, tabs.current);
      else void invoke("close_window").catch(() => {});
    });
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  const [settings, setSettings] = useState(false);
  const toggle = useCallback(() => setSettings((open) => !open), []);
  const close = useCallback(() => setSettings(false), []);

  return (
    <>
      <Grid onSettings={() => setSettings(true)} />
      <Settings open={settings} onToggle={toggle} onClose={close} />
    </>
  );
}
