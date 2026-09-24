import { useEffect } from "react";
import { Grid } from "./Grid.tsx";
import { useGrid } from "../store/store.ts";
import { dark, followSystem, light, setTheme, theme } from "../paint/theme.ts";

export function App() {
  useEffect(() => {
    void document.fonts.ready.then(() => useGrid.getState().remeasure());
  }, []);

  useEffect(() => {
    const stop = followSystem();
    // `t` flips it, so both can be seen without changing the system appearance.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "t" || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      setTheme(theme().name === "dark" ? light : dark);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stop();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return <Grid />;
}
