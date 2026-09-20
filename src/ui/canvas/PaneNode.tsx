import type { NodeProps } from "@xyflow/react";
import type { PaneState } from "../../protocol.ts";
import { PROVIDER_LABEL, ProviderIcon } from "../icons.tsx";
import { PANE_H, PANE_W } from "../metrics.ts";
import { useStore } from "../store.ts";

/**
 * A closed pane. A rectangle, its mark, and whether anything is happening inside it.
 * There is no terminal here: the terminal exists only once the pane has been opened.
 */

const IDLE_AFTER_MS = 2500;

export interface PaneNodeData extends Record<string, unknown> {
  pane: PaneState;
  hidden: boolean;
}

export function PaneNode({ data }: NodeProps & { data: PaneNodeData }) {
  const { pane, hidden } = data;
  const remove = useStore((s) => s.remove);
  const dead = pane.exit !== null;
  const busy = !dead && Date.now() - pane.lastOutputAt < IDLE_AFTER_MS;

  return (
    <div
      className="pane"
      data-dead={dead || undefined}
      // While this pane is expanded, its place on the canvas is held but not drawn.
      style={{ width: PANE_W, height: PANE_H, opacity: hidden ? 0 : undefined }}
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
