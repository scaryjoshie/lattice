import type { NodeProps } from "@xyflow/react";
import type { PaneState } from "../../protocol.ts";
import { PROVIDER_LABEL, ProviderIcon } from "../icons.tsx";
import { useStore } from "../store.ts";

/**
 * A closed pane: the screen, drawn small. It holds no terminal yet, so for now it shows
 * its mark and whether anything is happening inside it.
 */

const IDLE_AFTER_MS = 2500;

export interface PaneNodeData extends Record<string, unknown> {
  pane: PaneState;
  hidden: boolean;
  width: number;
  height: number;
}

export function PaneNode({ data }: NodeProps & { data: PaneNodeData }) {
  const { pane, hidden, width, height } = data;
  const remove = useStore((s) => s.remove);
  const dead = pane.exit !== null;
  const busy = !dead && Date.now() - pane.lastOutputAt < IDLE_AFTER_MS;

  return (
    <div
      className="pane"
      data-dead={dead || undefined}
      // While this pane is open, its place on the canvas is held but not drawn.
      style={{ width, height, opacity: hidden ? 0 : undefined }}
    >
      <ProviderIcon provider={pane.provider} className="pane-watermark" />
      <span className="pane-label">{PROVIDER_LABEL[pane.provider]}</span>
      <span className="pane-dot" data-state={dead ? "dead" : busy ? "busy" : "idle"} />
      <button
        className="pane-close"
        type="button"
        aria-label="close"
        onClick={(e) => {
          e.stopPropagation();
          remove(pane.id);
        }}
      >
        ×
      </button>
    </div>
  );
}
