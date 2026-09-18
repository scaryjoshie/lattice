import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Everything the daemon reads from its environment, in one place. Nothing below the
 * composition root reads `process.env`.
 */
export interface Config {
  /** State directory: the database and the unix socket. */
  home: string;
  dbPath: string;
  socketPath: string;
  /** Where Pane-made checkouts live: `<projects>/<project>/<repo>/<worktree>`. */
  projectsDir: string;
  port: number;
  askModel: string;
  summaryModel: string;
  summaries: boolean;
  /** How the `pane` MCP shim and the attach hook are started. */
  mcpCommand: string[];
  attachCommand: string[];
  /** Built UI to serve at `/`, if present. */
  uiDist: string;
}

/**
 * The PATH of the user's login shell. The daemon may be started from anywhere (a
 * terminal app that injects temporary wrapper scripts, a service manager with a bare
 * PATH); agents and `git` should still resolve as they do in the user's own shell.
 */
export function loginShellPath(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const shell = env.SHELL ?? "/bin/zsh";
  try {
    const r = Bun.spawnSync([shell, "-lic", 'printf "%s" "$PATH"'], {
      stdout: "pipe",
      stderr: "ignore",
      stdin: "ignore",
      timeout: 5000,
    });
    const path = r.stdout.toString().trim().split("\n").at(-1) ?? "";
    return r.exitCode === 0 && path.includes("/") ? path : null;
  } catch {
    return null;
  }
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): Config {
  const home = resolve(env.PANE_HOME ?? join(homedir(), ".pane"));
  const bun = process.execPath;
  const here = import.meta.dir;
  return {
    home,
    dbPath: join(home, "pane.db"),
    socketPath: join(home, "pane.sock"),
    projectsDir: resolve(env.PANE_PROJECTS ?? join(homedir(), "Pane", "projects")),
    port: Number(env.PANE_PORT ?? 7777),
    askModel: env.PANE_ASK_MODEL ?? "sonnet",
    summaryModel: env.PANE_SUMMARY_MODEL ?? "haiku",
    summaries: env.PANE_SUMMARIES !== "0",
    mcpCommand: [bun, join(here, "mcp.ts")],
    attachCommand: [bun, join(here, "cli.ts"), "attach"],
    uiDist: resolve(here, "..", "..", "ui", "dist"),
  };
}
