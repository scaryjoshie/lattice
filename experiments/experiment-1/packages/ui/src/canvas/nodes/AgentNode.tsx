import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Bot, CircleDashed, Cpu, MapPin } from "lucide-react";
import type { AgentNode as AgentNodeType } from "../layout.ts";

export function providerIcon(provider: string, size = 16) {
  if (provider === "claude-code") return <Bot size={size} />;
  if (provider === "codex") return <Cpu size={size} />;
  return <CircleDashed size={size} />;
}

export function AgentNode({ data }: NodeProps<AgentNodeType>) {
  const { agent, presence } = data;
  const busy = presence?.status === "busy";
  const dot =
    agent.lifecycle === "online"
      ? busy
        ? "ok pulse"
        : "ok"
      : agent.lifecycle === "suspended"
        ? "muted"
        : "hollow";
  return (
    <div className="flex w-14 flex-col items-center gap-[3px]" title={agent.name}>
      <Handle type="target" position={Position.Top} />
      <div className="agent-circle">
        {providerIcon(agent.provider)}
        <span className={`dot ${dot}`} />
      </div>
      <div className="flex max-w-14 items-center gap-0.5 truncate text-[11px]">
        {data.astray && <MapPin size={10} className="shrink-0 text-warn" />}
        <span className="truncate">{agent.name}</span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
