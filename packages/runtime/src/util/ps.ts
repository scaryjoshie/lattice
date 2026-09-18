import { $ } from "bun";

/** Small process-table helpers used by providers. */

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Working directory of a process via lsof, or undefined. */
export async function cwdOf(pid: number): Promise<string | undefined> {
  try {
    const out = await $`lsof -a -p ${pid} -d cwd -Fn`.quiet().text();
    const line = out.split("\n").find((l) => l.startsWith("n"));
    return line ? line.slice(1) : undefined;
  } catch {
    return undefined;
  }
}

/** Paths a process holds open, via lsof. */
export async function openFiles(pid: number): Promise<string[]> {
  try {
    const out = await $`lsof -p ${pid} -Fn`.quiet().text();
    return out
      .split("\n")
      .filter((l) => l.startsWith("n"))
      .map((l) => l.slice(1));
  } catch {
    return [];
  }
}

/** Run a command and return stdout, or null if it fails or is missing. */
export async function tryRun(
  argv: string[],
  opts: { timeoutMs?: number; stderr?: boolean } = {},
): Promise<string | null> {
  try {
    const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 10_000);
    const [code, out, err] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    clearTimeout(timer);
    // Some CLIs report status on stderr (`codex login status` does).
    return code === 0 ? (opts.stderr ? out + err : out) : null;
  } catch {
    return null;
  }
}
