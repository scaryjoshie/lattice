import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type AnyAgentTool, agentTools } from "./agentTools.ts";

/**
 * The `pane` MCP server a host CLI spawns for each agent. It knows nothing but its
 * identity from the environment and forwards every tool call to the daemon.
 */

const text = (t: string, isError = false) => ({
  content: [{ type: "text" as const, text: t }],
  isError,
});

export async function runMcp(env: Record<string, string | undefined> = process.env): Promise<void> {
  const agentId = env.PANE_AGENT_ID ?? "";
  const token = env.PANE_TOKEN ?? "";
  const socket = env.PANE_SOCKET ?? "";
  const call = async (method: string, params: Record<string, unknown>) => {
    const res = await fetch("http://pane/rpc", {
      method: "POST",
      unix: socket,
      body: JSON.stringify({ method, params, identity: { agentId, token } }),
      headers: { "content-type": "application/json" },
    });
    const body = (await res.json()) as { ok?: boolean; text?: string; error?: string };
    if (!res.ok || body.error) throw new Error(body.error ?? `daemon returned ${res.status}`);
    return body.text ?? "";
  };

  const server = new McpServer(
    { name: "pane", version: "0.0.0" },
    {
      instructions:
        "Pane keeps this project's tasks, problems, questions, decisions and requests to the user as persistent state. Record them with these tools as you work instead of leaving them in chat. Call context first.",
    },
  );
  for (const t of agentTools as readonly AnyAgentTool[]) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.params },
      async (params: Record<string, unknown>) => {
        try {
          return text(await call("tool", { name: t.name, params }));
        } catch (e) {
          return text(e instanceof Error ? e.message : String(e), true);
        }
      },
    );
  }
  await server.connect(new StdioServerTransport());
}

if (import.meta.main) {
  await runMcp();
}
