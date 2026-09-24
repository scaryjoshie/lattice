import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { type Id, KernelError } from "@pane/kernel";
import { z } from "zod";
import { agentContext, agentTool } from "./agentTools.ts";
import type { Ops } from "./operations.ts";
import { OperationError, type Services } from "./services.ts";

/**
 * The agents' door: an owner-only unix socket. The `pane` MCP shim posts here with
 * the identity Pane put in its environment. Two methods: run a tool, and attach
 * host-specific delivery information (Claude Code's inbox token).
 */

const Envelope = z.object({
  method: z.enum(["tool", "attach", "ping"]),
  params: z.record(z.string(), z.unknown()).default({}),
  identity: z.object({ agentId: z.string(), token: z.string() }).optional(),
});

export function createRpc(s: Services, ops: Ops) {
  const path = s.config.socketPath;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (existsSync(path)) unlinkSync(path);

  const identify = (env: z.infer<typeof Envelope>): Id<"agent"> => {
    const id = env.identity;
    if (!id) throw new OperationError("identity required", "forbidden");
    if (!s.runtime.verifyToken(id.agentId as Id<"agent">, id.token))
      throw new OperationError("bad token", "forbidden");
    return id.agentId as Id<"agent">;
  };

  async function handle(req: Request): Promise<Response> {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/rpc") {
      return Response.json({ error: "POST /rpc only" }, { status: 404 });
    }
    let env: z.infer<typeof Envelope>;
    try {
      env = Envelope.parse(await req.json());
    } catch (e) {
      return Response.json({ error: `bad request: ${String(e)}` }, { status: 400 });
    }
    try {
      switch (env.method) {
        case "ping":
          return Response.json({ ok: true });
        case "attach": {
          const agentId = identify(env);
          const agent = s.kernel.store.agent(agentId);
          const provider = agent && s.runtime.provider(agent.provider);
          if (agent?.sessionKey && provider?.attach) provider.attach(agent.sessionKey, env.params);
          return Response.json({
            ok: true,
            attached: Boolean(agent?.sessionKey && provider?.attach),
          });
        }
        case "tool": {
          const agentId = identify(env);
          const name = String(env.params.name ?? "");
          const tool = agentTool(name);
          if (!tool) throw new OperationError(`unknown tool ${name}`, "not_found");
          const params = z.object(tool.params).parse(env.params.params ?? {});
          const text = await tool.run(agentContext(s, ops, agentId), params);
          return Response.json({ ok: true, text });
        }
      }
    } catch (e) {
      const status =
        e instanceof OperationError || e instanceof KernelError
          ? 422
          : e instanceof z.ZodError
            ? 400
            : 500;
      const message =
        e instanceof z.ZodError
          ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
          : e instanceof Error
            ? e.message
            : String(e);
      return Response.json({ error: message }, { status });
    }
  }

  const server = Bun.serve({ unix: path, fetch: handle });
  chmodSync(path, 0o600);
  return {
    path,
    stop() {
      server.stop(true);
      if (existsSync(path)) unlinkSync(path);
    },
  };
}
