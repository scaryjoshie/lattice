import { GitError } from "./types.ts";

export interface GitOutput {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run one git command in `cwd`. Throws `GitError` on a nonzero exit unless `allowFail`. */
export async function git(
  args: string[],
  cwd: string,
  opts: { allowFail?: boolean } = {},
): Promise<GitOutput> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0 && !opts.allowFail) {
    const line = stderr.trim().split("\n")[0] ?? "";
    throw new GitError(`git ${args[0] ?? ""} failed: ${line || `exit ${code}`}`, args, stderr);
  }
  return { stdout, stderr, code };
}
