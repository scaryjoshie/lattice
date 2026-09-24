import "@fontsource/geist-mono/400.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./view/App.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("no #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
