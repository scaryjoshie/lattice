import type { Id } from "@pane/kernel/model";
import {
  Background,
  BackgroundVariant,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Download, FolderGit2, GitBranch, GitMerge, LayoutGrid, Plus, Trash2 } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../components/ui/context-menu.tsx";
import { Tip } from "../components/ui/tooltip.tsx";
import { run, useStore } from "../store.ts";
import { WireEdge } from "./edges/WireEdge.tsx";
import { type CanvasNode, layout, type WireData } from "./layout.ts";
import { AgentNode, providerIcon } from "./nodes/AgentNode.tsx";
import { PaneNode } from "./nodes/PaneNode.tsx";
import { RepositoryNode } from "./nodes/RepositoryNode.tsx";

const nodeTypes = { repository: RepositoryNode, pane: PaneNode, agent: AgentNode };
const edgeTypes = { wire: WireEdge };
const FIT = { duration: 400, padding: 0.2 };

type MenuTarget = { kind: "canvas" } | { kind: "node"; node: CanvasNode };

function Inner() {
  const snapshot = useStore((s) => s.snapshot);
  const presence = useStore((s) => s.presence);
  const providers = useStore((s) => s.providers);
  const view = useStore((s) => s.view);
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  const theme = useStore((s) => s.theme);
  const { setView, select, setPanel, openDrawer, openDialog } = useStore.getState();
  const flow = useReactFlow();
  const [target, setTarget] = useState<MenuTarget>({ kind: "canvas" });

  const { nodes, edges } = useMemo(
    () => layout(snapshot, presence, view, selection, mode === "ask"),
    [snapshot, presence, view, selection, mode],
  );
  const shown = useMemo(
    () =>
      nodes.map((n) =>
        mode === "ask" && selection.includes(n.id)
          ? { ...n, className: `${n.className ?? ""} ask-target`.trim() }
          : n,
      ),
    [nodes, mode, selection],
  );

  // The viewport follows the view level.
  const projectId = snapshot?.project.id;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the view and project move the camera
  useEffect(() => {
    if (!projectId) return;
    const t = setTimeout(() => {
      if (view.level === "project") void flow.fitView(FIT);
      else if (view.level === "repository") {
        const ids = nodesRef.current
          .filter((n) => n.id === view.id || n.parentId === view.id)
          .map((n) => ({ id: n.id }));
        void flow.fitView({ ...FIT, nodes: ids });
      } else void flow.fitView({ ...FIT, nodes: [{ id: view.id }] });
    }, 30);
    return () => clearTimeout(t);
  }, [view, projectId, nodes.length]);

  const toggleSelect = (id: string, additive: boolean) =>
    select(
      additive
        ? selection.includes(id)
          ? selection.filter((x) => x !== id)
          : [...selection, id]
        : [id],
    );

  const onNodeClick = (e: ReactMouseEvent, node: Node) => {
    const n = node as CanvasNode;
    if (mode === "ask") {
      toggleSelect(n.id, e.shiftKey || e.metaKey);
      return;
    }
    if (n.type === "repository") {
      if ((e.target as HTMLElement).closest("[data-repo-header]"))
        setView({ level: "repository", id: n.id as Id<"repository"> });
      return;
    }
    if (n.type === "pane") {
      select([n.id]);
      setPanel({ kind: "detail", id: n.id as Id<"worktree"> });
    } else if (n.type === "agent") {
      select([n.id]);
      setPanel({ kind: "agent", id: n.id as Id<"agent"> });
      openDrawer([n.id as Id<"agent">]);
    }
  };

  const onNodeDoubleClick = (_e: ReactMouseEvent, node: Node) => {
    const n = node as CanvasNode;
    if (n.type !== "pane" || mode === "ask") return;
    setView({ level: "worktree", id: n.id as Id<"worktree"> });
    const agents = nodes
      .filter((x) => x.type === "agent" && x.parentId === n.id)
      .map((x) => x.id as Id<"agent">);
    if (agents.length) openDrawer(agents);
  };

  const onEdgeClick = (_e: ReactMouseEvent, edge: Edge) => {
    const data = edge.data as WireData | undefined;
    if (!data) return;
    select([data.conversationId]);
    setPanel({ kind: "chat", id: data.conversationId });
  };

  const onPaneClick = () => {
    if (mode === "ask") return;
    if (view.level !== "project") setView({ level: "project" });
    select([]);
    setPanel(null);
  };

  const menu = () => {
    const s = snapshot;
    if (!s) return null;
    if (target.kind === "canvas") {
      return (
        <>
          <ContextMenuItem onSelect={() => openDialog({ kind: "addRepository" })}>
            <FolderGit2 size={14} /> Repository
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => openDialog({ kind: "clone" })}>
            <Download size={14} /> Clone
          </ContextMenuItem>
        </>
      );
    }
    const n = target.node;
    if (n.type === "repository") {
      return (
        <ContextMenuItem
          onSelect={() =>
            openDialog({ kind: "newWorktree", repositoryId: n.id as Id<"repository"> })
          }
        >
          <GitBranch size={14} /> Worktree
        </ContextMenuItem>
      );
    }
    if (n.type === "pane") {
      const w = n.data.worktree;
      const parent = s.worktrees.find((p) => p.id === w.parentWorktreeId);
      return (
        <>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Plus size={14} /> Agent
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {providers.map((p) => (
                <ContextMenuItem
                  key={p.name}
                  disabled={!p.installed || p.loggedIn === false}
                  onSelect={() => void run("spawnAgent", { worktreeId: w.id, provider: p.name })}
                >
                  {providerIcon(p.name, 14)} {p.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {w.isMain && (
            <ContextMenuItem
              onSelect={() => openDialog({ kind: "newWorktree", repositoryId: w.repositoryId })}
            >
              <GitBranch size={14} /> Worktree
            </ContextMenuItem>
          )}
          {parent && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() =>
                  void run("mergeWorktree", { worktreeId: w.id }).then((r) => {
                    if (r?.merged) return;
                    if (r) useStore.getState().setPanel({ kind: "detail", id: w.id });
                  })
                }
              >
                <GitMerge size={14} /> Merge into {parent.name}
              </ContextMenuItem>
              <ContextMenuItem
                destructive
                onSelect={() => void run("removeWorktree", { worktreeId: w.id })}
              >
                <Trash2 size={14} /> Remove
              </ContextMenuItem>
            </>
          )}
        </>
      );
    }
    return null;
  };

  const items = menu();
  const empty = snapshot && snapshot.repositories.length === 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative flex-1">
          <ReactFlow
            nodes={shown}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode={theme}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnScroll
            zoomOnDoubleClick={false}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeContextMenu={(_e, node) => setTarget({ kind: "node", node: node as CanvasNode })}
            onPaneContextMenu={() => setTarget({ kind: "canvas" })}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--dots)" />
          </ReactFlow>
          {snapshot && (
            <div className="absolute left-3 top-3 z-[4] flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 shadow-sm">
              <Tip label="Repository">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openDialog({ kind: "addRepository" })}
                >
                  <FolderGit2 size={15} />
                </Button>
              </Tip>
              <Tip label="Clone">
                <Button variant="ghost" size="icon" onClick={() => openDialog({ kind: "clone" })}>
                  <Download size={15} />
                </Button>
              </Tip>
            </div>
          )}
          {!snapshot && (
            <Empty icon={<LayoutGrid size={24} />} noun="No projects">
              <Button variant="primary" onClick={() => openDialog({ kind: "newProject" })}>
                <Plus size={14} /> New project
              </Button>
            </Empty>
          )}
          {empty && (
            <Empty icon={<FolderGit2 size={24} />} noun="No repositories">
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => openDialog({ kind: "addRepository" })}>
                  <FolderGit2 size={14} /> Add repository
                </Button>
                <Button onClick={() => openDialog({ kind: "clone" })}>
                  <Download size={14} /> Clone
                </Button>
              </div>
            </Empty>
          )}
        </div>
      </ContextMenuTrigger>
      {items && <ContextMenuContent>{items}</ContextMenuContent>}
    </ContextMenu>
  );
}

function Empty({
  icon,
  noun,
  children,
}: {
  icon: React.ReactNode;
  noun: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center">
      <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-10 py-8">
        <span className="text-muted">{icon}</span>
        <span className="text-[13px] text-muted">{noun}</span>
        {children}
      </div>
    </div>
  );
}

export function Canvas() {
  return (
    <div className="relative flex flex-1 flex-col">
      <ReactFlowProvider>
        <Inner />
      </ReactFlowProvider>
    </div>
  );
}
