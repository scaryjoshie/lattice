import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Background,
  BackgroundVariant,
  type NodeChange,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Provider } from "../../protocol.ts";
import { PROVIDER_LABEL, ProviderIcon } from "../icons.tsx";
import { PANE_H, PANE_W } from "../metrics.ts";
import { isAppChord } from "../keys.ts";
import { useStore } from "../store.ts";
import { Expanded } from "./Expanded.tsx";
import { PaneNode, type PaneNodeData } from "./PaneNode.tsx";
import type { Rect } from "./transition.ts";

const nodeTypes = { pane: PaneNode };
const PROVIDERS: Provider[] = ["claude", "codex"];

function rectOf(id: string, fallback?: Element | null): Rect | null {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) ?? fallback;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

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
  /** The rectangle the open pane grew out of, and will shrink back into. */
  const [from, setFrom] = useState<Rect | null>(null);

  const nodes = useMemo(
    () =>
      panes.map((pane) => ({
        id: pane.id,
        type: "pane",
        position: positions[pane.id] ?? { x: 0, y: 0 },
        draggable: entered === null,
        data: { pane, hidden: entered === pane.id } satisfies PaneNodeData,
        width: PANE_W,
        height: PANE_H,
      })),
    [panes, positions, entered],
  );

  const open = useCallback(
    (id: string, el?: Element | null) => {
      if (useStore.getState().entered !== null) return;
      const rect = rectOf(id, el);
      if (!rect) return;
      setFrom(rect);
      enter(id);
    },
    [enter],
  );

  const close = useCallback(() => {
    if (useStore.getState().entered === null) return;
    exit();
  }, [exit]);

  // D-45: the application lives behind Cmd, so nothing is taken away from the TUI.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isAppChord(e)) return;
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) move(c.id, c.position);
      }
    },
    [move],
  );

  const openPane = panes.find((p) => p.id === entered) ?? null;

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
            onNodeClick={(e, node) => open(node.id, e.currentTarget)}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.2}
            maxZoom={1.6}
            zoomOnScroll={entered === null}
            panOnDrag={entered === null}
            zoomOnDoubleClick={false}
            panOnScroll={false}
            nodesConnectable={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1} />
          </ReactFlow>
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
      <Expanded pane={openPane} from={from} onClose={close} />
    </ContextMenu.Root>
  );
}
