import type { WorktreeGit } from "@pane/protocol";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { AlertTriangle, ArrowDown, ArrowUp, Bell, CheckSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/index.ts";
import type { PaneNode as PaneNodeType } from "../layout.ts";

const GIT_REFRESH_MS = 15_000;

export function PaneNode({ data }: NodeProps<PaneNodeType>) {
  const { worktree: w, stats } = data;
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
  return (
    <div className={`pane${data.selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="title">{w.name}</div>
      <div className="objective">{w.objective}</div>
      <div className="stats">
        {stats.tasksTotal > 0 && (
          <span>
            <CheckSquare size={12} />
            {stats.tasksDone}/{stats.tasksTotal}
          </span>
        )}
        {stats.problems > 0 && (
          <span className="warn">
            <AlertTriangle size={12} />
            {stats.problems}
          </span>
        )}
        {stats.attention > 0 && (
          <span className="danger">
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
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
