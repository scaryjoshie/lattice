import { ReactFlowProvider } from "@xyflow/react";
import { useEffect } from "react";
import { Canvas } from "./canvas/Canvas.tsx";
import { connect, useStore } from "./store.ts";

export function App() {
  const connected = useStore((s) => s.connected);

  useEffect(connect, []);

  return (
    <ReactFlowProvider>
      <Canvas />
      {!connected && <div className="offline">daemon offline</div>}
    </ReactFlowProvider>
  );
}
