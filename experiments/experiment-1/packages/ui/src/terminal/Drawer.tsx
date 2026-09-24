import type { Id } from "@pane/kernel/model";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { providerIcon } from "../canvas/nodes/AgentNode.tsx";
import { Button } from "../components/ui/button.tsx";
import { cn } from "../lib/utils.ts";
import { useStore } from "../store.ts";
import { Term } from "./Term.tsx";

export function Drawer({ tabs, active }: { tabs: Id<"agent">[]; active: Id<"agent"> }) {
  const snapshot = useStore((s) => s.snapshot);
  const { openDrawer, closeDrawer } = useStore.getState();
  const name = (id: Id<"agent">) => snapshot?.agents.find((a) => a.id === id);
  return (
    <motion.div
      className="flex flex-none flex-col overflow-hidden border-t border-border bg-surface"
      initial={{ height: 0 }}
      animate={{ height: 320 }}
      exit={{ height: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-0.5 border-b border-border px-2 py-1">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            className={cn(
              "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-2 py-1.5 text-[12px] text-muted hover:text-text",
              id === active && "border-accent text-text",
            )}
            onClick={() => openDrawer(tabs, id)}
          >
            {providerIcon(name(id)?.provider ?? "", 12)}
            {name(id)?.name ?? id}
          </button>
        ))}
        <span className="flex-1" />
        <Button variant="ghost" size="icon" onClick={closeDrawer} aria-label="Close">
          <X size={14} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 bg-[#0d0d10] p-1.5">
        <Term key={active} agentId={active} />
      </div>
    </motion.div>
  );
}
