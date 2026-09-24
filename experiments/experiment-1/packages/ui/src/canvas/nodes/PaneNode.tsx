import type { WorktreeGit } from "@pane/protocol";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { AlertTriangle, ArrowDown, ArrowUp, Bell, CheckSquare, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/index.ts";
import { Button } from "../../components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { Tip } from "../../components/ui/tooltip.tsx";
import { run, useStore } from "../../store.ts";
import type { PaneNode as PaneNodeType } from "../layout.ts";
import { providerIcon } from "./AgentNode.tsx";

const GIT_REFRESH_MS = 15_000;

export function PaneNode({ data }: NodeProps<PaneNodeType>) {
  const { worktree: w, stats } = data;
  const providers = useStore((s) => s.providers);
  const [git, setGit] = useState<WorktreeGit | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .worktreeGit(w.id)
        .then((g) => alive && setGit(g))
        .catch(() => undefined);
    load();
    const t = setInterval(load, GIT_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [w.id]);
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
  return (
    <div className={`pane${data.selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight">
        {w.name}
      </div>
      <div className="min-h-[17px] truncate text-[12px] text-muted">{w.objective}</div>
      <div className="tnum flex items-center gap-2.5 font-mono text-[11px] text-muted [&>span]:inline-flex [&>span]:items-center [&>span]:gap-[3px]">
        {stats.tasksTotal > 0 && (
          <span>
            <CheckSquare size={12} />
            {stats.tasksDone}/{stats.tasksTotal}
          </span>
        )}
        {stats.problems > 0 && (
          <span className="text-warn">
            <AlertTriangle size={12} />
            {stats.problems}
          </span>
        )}
        {stats.attention > 0 && (
          <span className="text-danger">
            <Bell size={12} />
            {stats.attention}
          </span>
        )}
        {git && !w.isMain && (git.ahead > 0 || git.behind > 0) && (
          <span>
            {git.ahead > 0 && (
              <>
                <ArrowUp size={12} />
                {git.ahead}
              </>
            )}
            {git.behind > 0 && (
              <>
                <ArrowDown size={12} />
                {git.behind}
              </>
            )}
          </span>
        )}
      </div>
      <div className="nodrag nopan absolute bottom-2 right-2">
        <DropdownMenu>
          <Tip label="Agent">
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted hover:text-text"
                onClick={stop}
                onPointerDown={stop}
                onMouseDown={stop}
                onDoubleClick={stop}
              >
                <Plus size={14} />
              </Button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Agent</DropdownMenuLabel>
            {providers.map((p) => (
              <DropdownMenuItem
                key={p.name}
                disabled={!p.installed || p.loggedIn === false}
                title={p.loggedIn === false ? p.loginCommand : undefined}
                onSelect={() => void run("spawnAgent", { worktreeId: w.id, provider: p.name })}
              >
                {providerIcon(p.name, 14)} {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
