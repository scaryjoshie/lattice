import type { Id } from "@pane/kernel/model";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { providerIcon } from "../canvas/nodes/AgentNode.tsx";
import { useStore } from "../store.ts";
import { Button } from "../ui/Button.tsx";
import { Term } from "./Term.tsx";

export function Drawer({ tabs, active }: { tabs: Id<"agent">[]; active: Id<"agent"> }) {
  const snapshot = useStore((s) => s.snapshot);
  const { openDrawer, closeDrawer } = useStore.getState();
  const name = (id: Id<"agent">) => snapshot?.agents.find((a) => a.id === id);
  return (
    <motion.div
      className="drawer"
      initial={{ height: 0 }}
      animate={{ height: 320 }}
      exit={{ height: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="drawer-tabs">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            className={`tab${id === active ? " active" : ""}`}
            onClick={() => openDrawer(tabs, id)}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {providerIcon(name(id)?.provider ?? "", 12)}
              {name(id)?.name ?? id}
            </span>
          </button>
        ))}
        <span className="spacer" />
        <Button variant="ghost" size="sm" onClick={closeDrawer}>
          <X size={14} />
        </Button>
      </div>
      <div className="drawer-body">
        <Term key={active} agentId={active} />
      </div>
    </motion.div>
  );
}
