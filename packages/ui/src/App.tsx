import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { Canvas } from "./canvas/Canvas.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { Dialogs } from "./dialogs/Dialogs.tsx";
import { AgentCard } from "./panels/AgentCard.tsx";
import { AskBar, AskPanel } from "./panels/Ask.tsx";
import { Chat } from "./panels/Chat.tsx";
import { Detail } from "./panels/Detail.tsx";
import { NeedsYou } from "./panels/NeedsYou.tsx";
import { Sidebar } from "./sidebar/Sidebar.tsx";
import { type Panel, useStore } from "./store.ts";
import { Drawer } from "./terminal/Drawer.tsx";

function PanelBody({ panel }: { panel: NonNullable<Panel> }) {
  switch (panel.kind) {
    case "detail":
      return <Detail id={panel.id} />;
    case "agent":
      return <AgentCard id={panel.id} />;
    case "chat":
      return <Chat id={panel.id} />;
    case "ask":
      return <AskPanel />;
    case "needsYou":
      return <NeedsYou />;
  }
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.isContentEditable ||
      !!t.closest(".xterm") ||
      !!t.closest("[role=dialog]"))
  );
};

export function App() {
  const panel = useStore((s) => s.panel);
  const mode = useStore((s) => s.mode);
  const drawer = useStore((s) => s.drawer);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    void useStore.getState().boot();
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.dialog) return;
      if (e.key === "/" && !typing(e)) {
        e.preventDefault();
        s.setMode(s.mode === "ask" ? "normal" : "ask");
      } else if (e.key === "Escape" && !typing(e)) {
        if (s.mode === "ask") s.setMode("normal");
        else if (s.panel) s.setPanel(null);
        else if (s.view.level !== "project") s.setView({ level: "project" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const key = panel ? `${panel.kind}:${"id" in panel ? panel.id : ""}` : "";
  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full overflow-hidden">
        <Sidebar />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <Canvas />
          <AnimatePresence>
            {panel && (
              <motion.div
                key={key}
                className="absolute inset-y-0 right-0 z-10 flex w-[340px] flex-col border-l border-border bg-surface"
                initial={{ x: 340 }}
                animate={{ x: 0 }}
                exit={{ x: 340 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <PanelBody panel={panel} />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>{mode === "ask" && <AskBar key="askbar" />}</AnimatePresence>
          <AnimatePresence>
            {drawer && <Drawer key="drawer" tabs={drawer.tabs} active={drawer.active} />}
          </AnimatePresence>
        </div>
      </div>
      <Dialogs />
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{ className: "!rounded-md !border-border !bg-surface !text-text !shadow-md" }}
      />
    </TooltipProvider>
  );
}
