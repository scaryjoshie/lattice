import { Bell, Moon, Plus, Sun } from "lucide-react";
import { Badge } from "../components/ui/badge.tsx";
import { Tip } from "../components/ui/tooltip.tsx";
import { cn } from "../lib/utils.ts";
import { useStore } from "../store.ts";

const row =
  "flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-[13px] transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

function Heading({ children }: { children: string }) {
  return (
    <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
      {children}
    </div>
  );
}

export function Sidebar() {
  const projects = useStore((s) => s.projects);
  const projectId = useStore((s) => s.projectId);
  const providers = useStore((s) => s.providers);
  const needsYou = useStore((s) => s.needsYou);
  const theme = useStore((s) => s.theme);
  const panel = useStore((s) => s.panel);
  const { selectProject, setPanel, toggleTheme, openDialog } = useStore.getState();
  return (
    <div className="flex w-[220px] flex-none flex-col gap-5 border-r border-border bg-surface p-3">
      <div>
        <Heading>Projects</Heading>
        <div className="flex flex-col gap-px">
          {projects.map((p) => (
            <button
              type="button"
              key={p.id}
              className={cn(
                row,
                p.id === projectId && "bg-accent-soft text-accent hover:bg-accent-soft",
              )}
              onClick={() => void selectProject(p.id)}
            >
              <span className="flex-1 truncate">{p.name}</span>
            </button>
          ))}
          <button
            type="button"
            className={cn(row, "text-muted")}
            onClick={() => openDialog({ kind: "newProject" })}
          >
            <Plus size={14} />
            <span>New project</span>
          </button>
        </div>
      </div>
      <div>
        <Heading>Providers</Heading>
        <div className="flex flex-col gap-px">
          {providers.map((p) => (
            <Tip
              key={p.name}
              side="right"
              label={
                p.loggedIn ? (p.account ?? p.label) : p.installed ? p.loginCommand : "Not installed"
              }
            >
              <div className={cn(row, "cursor-default hover:bg-transparent")}>
                <span className={`dot ${p.installed && p.loggedIn !== false ? "ok" : "danger"}`} />
                <span className="flex-1 truncate">{p.label}</span>
              </div>
            </Tip>
          ))}
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex flex-col gap-px">
        <button
          type="button"
          className={cn(row, panel?.kind === "needsYou" && "bg-accent-soft text-accent")}
          onClick={() => setPanel(panel?.kind === "needsYou" ? null : { kind: "needsYou" })}
        >
          <Bell size={14} />
          <span className="flex-1">Needs you</span>
          {needsYou.length > 0 && <Badge tone="count">{needsYou.length}</Badge>}
        </button>
        <button type="button" className={row} onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          <span className="flex-1">{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>
    </div>
  );
}
