import { BaseEdge, type EdgeProps, getBezierPath } from "@xyflow/react";
import type { WireData } from "../layout.ts";

export function WireEdge(props: EdgeProps) {
  const [path] = getBezierPath(props);
  const recent = (props.data as WireData | undefined)?.recent ?? false;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke: recent ? "var(--accent)" : "var(--text-muted)",
          strokeWidth: 1.5,
          opacity: recent ? 1 : 0.6,
        }}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: "pointer" }}
      />
    </>
  );
}
