import type { Id } from "@pane/kernel/model";
import type { NodeProps } from "@xyflow/react";
import { FolderGit2, Plus } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Tip } from "../../components/ui/tooltip.tsx";
import { useStore } from "../../store.ts";
import type { RepositoryNode as RepoNode } from "../layout.ts";

export function RepositoryNode({ id, data }: NodeProps<RepoNode>) {
  const openDialog = useStore((s) => s.openDialog);
  return (
    <div className="repo">
      <div
        className="flex h-9 items-center gap-2 px-3.5 text-[13px] font-semibold"
        data-repo-header
      >
        <FolderGit2 size={14} />
        <span>{data.name}</span>
        <span className="font-mono text-[12px] font-normal text-muted">{data.branch}</span>
        <span className="flex-1" />
        <Tip label="Worktree">
          <Button
            variant="ghost"
            size="icon"
            className="nodrag nopan h-6 w-6 text-muted hover:text-text"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openDialog({ kind: "newWorktree", repositoryId: id as Id<"repository"> });
            }}
          >
            <Plus size={14} />
          </Button>
        </Tip>
      </div>
    </div>
  );
}
