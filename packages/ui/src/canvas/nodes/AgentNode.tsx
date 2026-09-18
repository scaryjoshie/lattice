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
    <div className="agent" title={agent.name}>
      <Handle type="target" position={Position.Top} />
      <div className="agent-circle">
        {providerIcon(agent.provider)}
        <span className={`dot ${dot}`} />
      </div>
      <div className="name">
        {data.astray && <MapPin size={10} className="pin" />}
        {agent.name}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
