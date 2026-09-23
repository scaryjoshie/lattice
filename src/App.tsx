import { useEffect } from "react";
import { Grid } from "./Grid.tsx";
import { dark, followSystem, light, setTheme, theme } from "./theme.ts";

export function App() {
  useEffect(() => {
    const stop = followSystem();
    // `t` flips it, so both can be seen without changing the system appearance.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "t" || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT") return;
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
