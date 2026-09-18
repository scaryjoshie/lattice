import type { Id } from "@pane/kernel/model";
import {
  Background,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bot, Cpu, FolderGit2, GitBranch, GitMerge, Plus, Trash2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../api/index.ts";
import { useStore } from "../store.ts";
import { ContextMenu, type MenuItem, type MenuState } from "./ContextMenu.tsx";
import { WireEdge } from "./edges/WireEdge.tsx";
import { type CanvasNode, layout, type WireData } from "./layout.ts";
import { AgentNode } from "./nodes/AgentNode.tsx";
import { PaneNode } from "./nodes/PaneNode.tsx";
import { RepositoryNode } from "./nodes/RepositoryNode.tsx";

const nodeTypes = { repository: RepositoryNode, pane: PaneNode, agent: AgentNode };
const edgeTypes = { wire: WireEdge };
const FIT = { duration: 400, padding: 0.2 };

function Inner() {
  const snapshot = useStore((s) => s.snapshot);
  const presence = useStore((s) => s.presence);
  const view = useStore((s) => s.view);
  const selection = useStore((s) => s.selection);
  const mode = useStore((s) => s.mode);
  const theme = useStore((s) => s.theme);
  const { setView, select, setPanel, openDrawer } = useStore.getState();
  const flow = useReactFlow();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

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
        const ids = nodes
          .filter((n) => n.id === view.id || n.parentId === view.id)
          .map((n) => ({ id: n.id }));
        void flow.fitView({ ...FIT, nodes: ids });
      } else void flow.fitView({ ...FIT, nodes: [{ id: view.id }] });
    }, 30);
    return () => clearTimeout(t);
  }, [view, projectId]);

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

  const menuFor = (node: CanvasNode): MenuItem[] => {
    const s = snapshot;
    if (!s) return [];
    if (node.type === "repository") {
      const main = s.worktrees.find((w) => w.repositoryId === node.id && w.isMain);
      return main ? [worktreeItem(node.id as Id<"repository">)] : [];
    }
    if (node.type === "pane") {
      const w = node.data.worktree;
      const parent = s.worktrees.find((p) => p.id === w.parentWorktreeId);
      const items: MenuItem[] = [
        {
          label: "Agent",
          icon: <Plus size={14} />,
          children: [
            {
              label: "Claude Code",
              icon: <Bot size={14} />,
              onClick: () =>
                void api.op("spawnAgent", { worktreeId: w.id, provider: "claude-code" }),
            },
            {
              label: "Codex",
              icon: <Cpu size={14} />,
              onClick: () => void api.op("spawnAgent", { worktreeId: w.id, provider: "codex" }),
            },
          ],
        },
      ];
      if (w.isMain) items.push(worktreeItem(w.repositoryId));
      if (parent) {
        items.push({
          label: `Merge into ${parent.name}`,
          icon: <GitMerge size={14} />,
          onClick: () => void api.op("mergeWorktree", { worktreeId: w.id }),
        });
        items.push({
          label: "Remove",
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => void api.op("removeWorktree", { worktreeId: w.id }),
        });
      }
      return items;
    }
    return [];
  };

  const worktreeItem = (repositoryId: Id<"repository">): MenuItem => ({
    label: "Worktree",
    icon: <GitBranch size={14} />,
    form: {
      fields: [
        { key: "name", placeholder: "name" },
        { key: "objective", placeholder: "objective" },
      ],
      onSubmit: (v) =>
        void api.op("createWorktree", { repositoryId, name: v.name ?? "", objective: v.objective }),
    },
  });

  const onNodeContextMenu = (e: ReactMouseEvent, node: Node) => {
    e.preventDefault();
    const items = menuFor(node as CanvasNode);
    if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const onPaneContextMenu = (e: ReactMouseEvent | MouseEvent) => {
    e.preventDefault();
    if (!snapshot) return;
    const projectId = snapshot.project.id;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Repository",
          icon: <FolderGit2 size={14} />,
          form: {
            fields: [{ key: "path", placeholder: "path" }],
            onSubmit: (v) => void api.op("addRepository", { projectId, path: v.path ?? "" }),
          },
        },
      ],
    });
  };

  return (
    <>
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
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
      >
        <Background gap={24} size={1} color="var(--border)" />
      </ReactFlow>
      <AnimatePresence>{menu && <ContextMenu menu={menu} close={closeMenu} />}</AnimatePresence>
    </>
  );
}

export function Canvas() {
  return (
    <div className="canvas">
      <ReactFlowProvider>
        <Inner />
      </ReactFlowProvider>
    </div>
  );
}
