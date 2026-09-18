import type { Terminal, TerminalSubscriber } from "./types.ts";

/**
 * One process inside a PTY. Output is fanned out to subscribers and kept in a ring
 * buffer so a terminal that attaches later sees what came before.
 */

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 36;
const TERM_WAIT_MS = 3000;

class Scrollback {
  private chunks: Uint8Array[] = [];
  private size = 0;

  constructor(private readonly limit: number) {}

  push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.size += chunk.byteLength;
    while (this.size > this.limit && this.chunks.length > 1) {
      const dropped = this.chunks.shift();
      if (dropped) this.size -= dropped.byteLength;
    }
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }
}

export interface SpawnOptions {
  argv: string[];
  cwd: string;
  env: Record<string, string>;
  scrollback: number;
  onExit(code: number | null): void;
}

export class AgentProcess implements Terminal {
  readonly pid: number;
  private readonly proc: Bun.Subprocess;
  private readonly buffer: Scrollback;
  private readonly subscribers = new Set<TerminalSubscriber>();
  private exited = false;
  /** Settles once the exit handler has run, so callers see consistent state afterwards. */
  private readonly done: Promise<void>;
  private settle: () => void = () => undefined;

  constructor(opts: SpawnOptions) {
    this.buffer = new Scrollback(opts.scrollback);
    this.done = new Promise((resolve) => {
      this.settle = resolve;
    });
    this.proc = Bun.spawn(opts.argv, {
      cwd: opts.cwd,
      env: opts.env,
      terminal: {
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        data: (_term, data) => {
          const copy = new Uint8Array(data);
          this.buffer.push(copy);
          for (const s of this.subscribers) s.data(copy);
        },
      },
      onExit: (_proc, exitCode, signalCode) => {
        this.exited = true;
        const code = exitCode ?? (signalCode ? null : 0);
        this.proc.terminal?.close();
        for (const s of this.subscribers) s.exit(code);
        opts.onExit(code);
        this.settle();
      },
    });
    this.pid = this.proc.pid;
  }

  get running(): boolean {
    return !this.exited;
  }

  write(data: string | Uint8Array): void {
    if (this.exited) return;
    this.proc.terminal?.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.exited) return;
    this.proc.terminal?.resize(Math.max(2, cols), Math.max(2, rows));
  }

  subscribe(sub: TerminalSubscriber): () => void {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  replay(): Uint8Array {
    return this.buffer.bytes();
  }

  /** SIGTERM, then SIGKILL if the process is still there after a grace period. */
  async stop(): Promise<void> {
    if (this.exited) return;
    this.proc.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (!this.exited) this.proc.kill("SIGKILL");
    }, TERM_WAIT_MS);
    await this.done;
    clearTimeout(timer);
  }
}
