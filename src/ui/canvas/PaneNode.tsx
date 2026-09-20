import type { NodeProps } from "@xyflow/react";
import type { PaneState } from "../../protocol.ts";
import { PROVIDER_LABEL, ProviderIcon } from "../icons.tsx";

/**
 * A closed pane: the screen, drawn small. It holds no terminal yet, so for now it shows
 * its mark and its name.
 *
 * The status dot and the close button have been taken out on purpose. Both were small
 * enough to be illegible at thumbnail scale, which is the only scale this is ever seen
 * at. How state and actions should be expressed instead is in ../docs/07-ui.md.
 */

export interface PaneNodeData extends Record<string, unknown> {
  pane: PaneState;
  hidden: boolean;
  width: number;
  height: number;
}

export function PaneNode({ data }: NodeProps & { data: PaneNodeData }) {
  const { pane, hidden, width, height } = data;

  return (
    <div
      className="pane"
      data-dead={pane.exit !== null || undefined}
      // While this pane is open, its place on the canvas is held but not drawn.
      style={{ width, height, opacity: hidden ? 0 : undefined }}
    >
      <ProviderIcon provider={pane.provider} className="pane-watermark" />
      <span className="pane-label">{PROVIDER_LABEL[pane.provider]}</span>
    </div>
  );
}
