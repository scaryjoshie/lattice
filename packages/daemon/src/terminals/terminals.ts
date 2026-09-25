import { homedir } from "node:os";
import { Pty } from "./pty.ts";

/**
 * The terminals, one per terminal host, held for the life of the daemon (runtime.md). A
 * host's terminal starts the first time a window attaches to it, running the login shell,
 * and stops when the host leaves the grid or the daemon stops. A shell that exits is
 * forgotten, so the next attach starts a fresh one. Where a terminal starts is the home
 * folder until projects give it a worktree.
 */
export class Terminals {
  private readonly running = new Map<string, Pty>();
  private readonly exits = new Set<(host: string, code: number | null) => void>();

  constructor(
    private readonly shell: string = process.env.SHELL ?? "/bin/zsh",
    private readonly cwd: string = homedir(),
  ) {}

  /** The host's terminal, started at this grid if it is not running. */
  ensure(host: string, cols: number, rows: number): Pty {
    const existing = this.running.get(host);
    if (existing?.running) return existing;
    const pty = new Pty({
      argv: [this.shell, "-l"],
      cwd: this.cwd,
      cols,
      rows,
      onExit: (code) => {
        if (this.running.get(host) === pty) this.running.delete(host);
        for (const listen of this.exits) listen(host, code);
      },
    });
    this.running.set(host, pty);
    return pty;
  }

  get(host: string): Pty | undefined {
    return this.running.get(host);
  }

  onExit(listen: (host: string, code: number | null) => void): () => void {
    this.exits.add(listen);
    return () => this.exits.delete(listen);
  }

  /** Stop every terminal whose host is no longer on the grid. */
  keep(hosts: ReadonlySet<string>): void {
    for (const [host, pty] of this.running) {
      if (hosts.has(host)) continue;
      this.running.delete(host);
      void pty.stop();
    }
  }

  close(): Promise<void> {
    const all = [...this.running.values()];
    this.running.clear();
    return Promise.all(all.map((pty) => pty.stop())).then(() => undefined);
  }
}
