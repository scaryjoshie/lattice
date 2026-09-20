import type { NodeProps } from "@xyflow/react";
import type { PaneState } from "../../protocol.ts";
import { PROVIDER_LABEL, ProviderIcon } from "../icons.tsx";
import { HEADER_H, PANE_H, PANE_W } from "../metrics.ts";
import { useStore } from "../store.ts";
import { Term } from "../terminal/Term.tsx";

/**
 * A pane is a fixed box the size of one terminal. Closed, it is deliberately empty:
 * a mark and a status, nothing pretending to be work. Entered, it is the TUI.
 */

const IDLE_AFTER_MS = 2500;

export interface PaneNodeData extends Record<string, unknown> {
  pane: PaneState;
  entered: boolean;
}

export function PaneNode({ data }: NodeProps & { data: PaneNodeData }) {
  const { pane, entered } = data;
  const remove = useStore((s) => s.remove);
  const dead = pane.exit !== null;
  const busy = !dead && Date.now() - pane.lastOutputAt < IDLE_AFTER_MS;

  return (
    <div
      className="pane"
      data-entered={entered || undefined}
      data-dead={dead || undefined}
      style={{ width: PANE_W, height: PANE_H }}
    >
      <header className="pane-head" style={{ height: HEADER_H }}>
        <ProviderIcon provider={pane.provider} className="pane-mark" />
        <span className="pane-name">{PROVIDER_LABEL[pane.provider]}</span>
        <span className="pane-dot" data-state={dead ? "dead" : busy ? "busy" : "idle"} />
        <span className="pane-pid">{dead ? `exit ${pane.exit}` : pane.pid}</span>
        <button
          className="pane-close"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            remove(pane.id);
          }}
        >
          ×
        </button>
      </header>
      <div className="pane-body">
        {entered ? (
          <Term id={pane.id} />
        ) : (
          <ProviderIcon provider={pane.provider} className="pane-watermark" />
        )}
      </div>
    </div>
  );
}
