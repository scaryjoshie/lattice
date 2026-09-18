import type { NodeProps } from "@xyflow/react";
import { FolderGit2 } from "lucide-react";
import type { RepositoryNode as RepoNode } from "../layout.ts";

export function RepositoryNode({ data }: NodeProps<RepoNode>) {
  return (
    <div className="repo">
      <div className="repo-header" data-repo-header>
        <FolderGit2 size={14} />
        <span>{data.name}</span>
        <span className="branch">{data.branch}</span>
      </div>
    </div>
  );
}
