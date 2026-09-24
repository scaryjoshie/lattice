/**
 * One headless model call through the user's own Claude login: `claude -p`. Used by
 * Ask mode (levels 3 and proposals) and by commit summaries. No API keys.
 */

export interface ModelCall {
  system: string;
  prompt: string;
  model: string;
  cwd?: string;
  /** Tools the call may use; none by default. */
  tools?: string[];
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class ModelError extends Error {}

export async function callModel(call: ModelCall): Promise<string> {
  const argv = [
    "claude",
    "-p",
    call.prompt,
    "--output-format",
    "json",
    "--model",
    call.model,
    "--system-prompt",
    call.system,
    "--strict-mcp-config",
    "--no-session-persistence",
    "--tools",
    call.tools?.length ? call.tools.join(",") : "",
  ];
  if (call.tools?.length) argv.push("--allowedTools", call.tools.join(","));
  const proc = Bun.spawn(argv, {
    cwd: call.cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const timer = setTimeout(() => proc.kill(), call.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) throw new ModelError(err.trim().split("\n")[0] || `claude exited ${code}`);
    const parsed = JSON.parse(out) as { result?: string; is_error?: boolean };
    if (parsed.is_error || typeof parsed.result !== "string") {
      throw new ModelError(parsed.result ?? "no result");
    }
    return parsed.result.trim();
  } finally {
    clearTimeout(timer);
  }
}

/** The first JSON object in a model reply, tolerating fences and prose around it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new ModelError("no JSON in reply");
  return JSON.parse(body.slice(start, end + 1));
}
