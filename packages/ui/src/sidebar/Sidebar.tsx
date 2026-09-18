import { Bell, Moon, Plus, Sun } from "lucide-react";
import { useState } from "react";
import { api } from "../api/index.ts";
import { useStore } from "../store.ts";
import { Input } from "../ui/Input.tsx";

export function Sidebar() {
  const projects = useStore((s) => s.projects);
  const projectId = useStore((s) => s.projectId);
  const providers = useStore((s) => s.providers);
  const needsYou = useStore((s) => s.needsYou);
  const theme = useStore((s) => s.theme);
  const panel = useStore((s) => s.panel);
  const { selectProject, setPanel, toggleTheme } = useStore.getState();
  const [adding, setAdding] = useState(false);
  return (
    <div className="sidebar">
      <div>
        <h3>Projects</h3>
        <div className="list">
          {projects.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`row${p.id === projectId ? " active" : ""}`}
              onClick={() => void selectProject(p.id)}
            >
              <span className="grow">{p.name}</span>
            </button>
          ))}
          {adding ? (
            <Input
              placeholder="name"
              onSubmit={(name) => {
                setAdding(false);
                void api.op("createProject", { name }).then((p) => selectProject(p.id));
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button type="button" className="row muted" onClick={() => setAdding(true)}>
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>
      <div>
        <h3>Providers</h3>
        <div className="list">
          {providers.map((p) => (
            <div
              key={p.name}
              className="row"
              style={{ cursor: "default" }}
              title={
                p.loggedIn ? (p.account ?? p.label) : p.installed ? p.loginCommand : "Not installed"
              }
            >
              <span className={`dot ${p.installed && p.loggedIn !== false ? "ok" : "danger"}`} />
              <span className="grow">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
      <span className="spacer" />
      <button
        type="button"
        className={`row${panel?.kind === "needsYou" ? " active" : ""}`}
        onClick={() => setPanel(panel?.kind === "needsYou" ? null : { kind: "needsYou" })}
      >
        <Bell size={14} />
        <span className="grow">Needs you</span>
        {needsYou.length > 0 && <span className="badge">{needsYou.length}</span>}
      </button>
      <button type="button" className="row" onClick={toggleTheme}>
        {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        <span className="grow">{theme === "dark" ? "Light" : "Dark"}</span>
      </button>
    </div>
  );
}
