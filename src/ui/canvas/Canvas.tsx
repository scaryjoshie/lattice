import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Background,
  BackgroundVariant,
  type NodeChange,
  ReactFlow,
  type Viewport,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Provider } from "../../protocol.ts";
import { PROVIDER_LABEL, ProviderIcon } from "../icons.tsx";
import { PANE_H, PANE_W } from "../metrics.ts";
import { useStore } from "../store.ts";
import {
  ENTERED_ZOOM,
  ENTER_MS,
  EXIT_MS,
  easeEnter,
  easeExit,
  paneCenter,
  RESTING_ZOOM,
} from "./camera.ts";
import { PaneNode, type PaneNodeData } from "./PaneNode.tsx";

const nodeTypes = { pane: PaneNode };
const PROVIDERS: Provider[] = ["claude", "codex"];

export function Canvas() {
  const flow = useReactFlow();
  const panes = useStore((s) => s.panes);
  const positions = useStore((s) => s.positions);
  const entered = useStore((s) => s.entered);
  const enter = useStore((s) => s.enter);
  const exit = useStore((s) => s.exit);
  const move = useStore((s) => s.move);
  const spawn = useStore((s) => s.spawn);

  const [menuAt, setMenuAt] = useState({ x: 0, y: 0 });
  /** Where the camera was before entering, so leaving returns you where you were. */
  const resting = useRef<Viewport | null>(null);

  const nodes = useMemo(
    () =>
      panes.map((pane) => ({
        id: pane.id,
        type: "pane",
        position: positions[pane.id] ?? { x: 0, y: 0 },
        draggable: entered === null,
        data: { pane, entered: entered === pane.id } satisfies PaneNodeData,
        width: PANE_W,
        height: PANE_H,
      })),
    [panes, positions, entered],
  );

  const goInto = useCallback(
    (id: string) => {
      const at = useStore.getState().positions[id];
      if (!at || useStore.getState().entered === id) return;
      resting.current = flow.getViewport();
      const c = paneCenter(at);
      enter(id);
      flow.setCenter(c.x, c.y, { zoom: ENTERED_ZOOM, duration: ENTER_MS, ease: easeEnter });
    },
    [enter, flow],
  );

  const goOut = useCallback(() => {
    if (useStore.getState().entered === null) return;
    exit();
    const back = resting.current;
    if (back) flow.setViewport(back, { duration: EXIT_MS, ease: easeExit });
    else flow.zoomTo(RESTING_ZOOM, { duration: EXIT_MS, ease: easeExit });
    resting.current = null;
  }, [exit, flow]);

  // D-45: the application lives behind Cmd, so nothing here is taken from the TUI.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        goOut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goOut]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) move(c.id, c.position);
      }
    },
    [move],
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className="canvas"
          onContextMenu={(e) =>
            setMenuAt(flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
          }
        >
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => goInto(node.id)}
            onPaneClick={goOut}
            defaultViewport={{ x: 0, y: 0, zoom: RESTING_ZOOM }}
            minZoom={0.1}
            maxZoom={1.5}
            // Entered, the pane owns the wheel: scrollback must not move the camera.
            zoomOnScroll={entered === null}
            panOnDrag={entered === null}
            zoomOnDoubleClick={false}
            panOnScroll={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: false }}
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1} />
          </ReactFlow>
          {entered !== null && <div className="hint">⌘↑</div>}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu">
          {PROVIDERS.map((provider) => (
            <ContextMenu.Item
              key={provider}
              className="menu-item"
              onSelect={() =>
                spawn(provider, { x: menuAt.x - PANE_W / 2, y: menuAt.y - PANE_H / 2 })
              }
            >
              <ProviderIcon provider={provider} className="menu-mark" />
              {PROVIDER_LABEL[provider]}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
