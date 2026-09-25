import { useCallback, useEffect, useState } from "react";
import { dark, followSystem, light, setTheme } from "../paint/theme.ts";
import { usePreferences } from "../store/preferences.ts";
import { Grid } from "./Grid.tsx";
import { Settings } from "./Settings.tsx";

export function App() {
  // The theme is a setting: the system's, or one chosen.
  const choice = usePreferences((s) => s.preferences.theme);
  useEffect(() => {
    if (choice === "system") return followSystem();
    setTheme(choice === "dark" ? dark : light);
  }, [choice]);

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
