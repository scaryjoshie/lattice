import type { AttentionRequest, Id, Project, ProjectSnapshot } from "@pane/kernel/model";
import type { AgentPresence, AskAnswer, ProviderStatus, ServerFrame } from "@pane/protocol";
import { create } from "zustand";
import { api, type Connection } from "./api/index.ts";
import { terminalBus } from "./terminal/bus.ts";

export type View =
  | { level: "project" }
  | { level: "repository"; id: Id<"repository"> }
  | { level: "worktree"; id: Id<"worktree"> };

export type Panel =
  | { kind: "detail"; id: Id<"worktree"> }
  | { kind: "agent"; id: Id<"agent"> }
  | { kind: "chat"; id: Id<"conversation"> }
  | { kind: "ask" }
  | { kind: "needsYou" }
  | null;

export type Theme = "light" | "dark";

interface State {
  projects: Project[];
  projectId: Id<"project"> | null;
  snapshot: ProjectSnapshot | null;
  presence: Record<string, AgentPresence>;
  providers: ProviderStatus[];
  needsYou: AttentionRequest[];
  selection: string[];
  view: View;
  panel: Panel;
  mode: "normal" | "ask";
  theme: Theme;
  drawer: { tabs: Id<"agent">[]; active: Id<"agent"> } | null;
  askAnswer: AskAnswer | null;
  connection: Connection | null;

  boot(): Promise<void>;
  selectProject(id: Id<"project">): Promise<void>;
  refresh(): Promise<void>;
  refreshNeedsYou(): Promise<void>;
  setView(view: View): void;
  select(ids: string[]): void;
  setPanel(panel: Panel): void;
  setMode(mode: "normal" | "ask"): void;
  toggleTheme(): void;
  openDrawer(tabs: Id<"agent">[], active?: Id<"agent">): void;
  closeDrawer(): void;
  setAskAnswer(a: AskAnswer | null): void;
}

const systemTheme = (): Theme =>
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  projects: [],
  projectId: null,
  snapshot: null,
  presence: {},
  providers: [],
  needsYou: [],
  selection: [],
  view: { level: "project" },
  panel: null,
  mode: "normal",
  theme: systemTheme(),
  drawer: null,
  askAnswer: null,
  connection: null,

  async boot() {
    document.documentElement.dataset.theme = get().theme;
    const onFrame = (f: ServerFrame) => {
      switch (f.type) {
        case "event": {
          if (f.event.projectId && f.event.projectId !== get().projectId) return;
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => void get().refresh(), 100);
          if (f.event.kind.startsWith("attention.")) void get().refreshNeedsYou();
          if (f.event.kind === "project.created")
            void api.projects().then((projects) => set({ projects }));
          break;
        }
        case "presence":
          set({ presence: Object.fromEntries(f.agents.map((a) => [a.agentId, a])) });
          break;
        case "terminal":
          terminalBus.data(f.agentId, f.data);
          break;
        case "terminal.exit":
          terminalBus.exit(f.agentId, f.code);
          break;
      }
    };
    set({ connection: api.connect(onFrame) });
    const [projects, providers, needsYou, presence] = await Promise.all([
      api.projects(),
      api.providers(),
      api.needsYou(),
      api.presence(),
    ]);
    set({
      projects,
      providers,
      needsYou,
      presence: Object.fromEntries(presence.map((a) => [a.agentId, a])),
    });
    const first = projects[0];
    if (first) await get().selectProject(first.id);
  },

  async selectProject(id) {
    set({ projectId: id, view: { level: "project" }, selection: [], panel: null, drawer: null });
    await get().refresh();
  },

  async refresh() {
    const id = get().projectId;
    if (!id) return;
    const snapshot = await api.snapshot(id);
    if (get().projectId === id) set({ snapshot });
  },

  async refreshNeedsYou() {
    set({ needsYou: await api.needsYou() });
  },

  setView: (view) => set({ view }),
  select: (selection) => set({ selection }),
  setPanel: (panel) => set({ panel }),
  setMode: (mode) => set(mode === "normal" ? { mode, askAnswer: null } : { mode }),
  toggleTheme() {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  openDrawer(tabs, active) {
    if (!tabs.length) return;
    set({ drawer: { tabs, active: active ?? (tabs[0] as Id<"agent">) } });
  },
  closeDrawer: () => set({ drawer: null }),
  setAskAnswer: (askAnswer) => set({ askAnswer, panel: askAnswer ? { kind: "ask" } : get().panel }),
}));
