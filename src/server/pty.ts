import { COLS, ROWS } from "../protocol.ts";

/**
 * One process inside a PTY. Output is fanned out to subscribers and kept in a ring
 * buffer, so a terminal that attaches later sees what came before it arrived.
 *
 * Lifted from experiment 1, minus agent identity, sessions and resume: here a pane
 * lives exactly as long as its process.
 */

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

export interface Subscriber {
  data(chunk: Uint8Array): void;
  exit(code: number | null): void;
}

export interface SpawnOptions {
  argv: string[];
  cwd: string;
  scrollback: number;
  onData(): void;
  onExit(code: number | null): void;
}

export class Pty {
  readonly pid: number;
  private readonly proc: Bun.Subprocess;
  private readonly buffer: Scrollback;
  private readonly subscribers = new Set<Subscriber>();
  private exited = false;
  private readonly done: Promise<void>;
  private settle: () => void = () => undefined;

  constructor(opts: SpawnOptions) {
    this.buffer = new Scrollback(opts.scrollback);
    this.done = new Promise((resolve) => {
      this.settle = resolve;
    });
    this.proc = Bun.spawn(opts.argv, {
      cwd: opts.cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
      terminal: {
        cols: COLS,
        rows: ROWS,
        data: (_term, data) => {
          const copy = new Uint8Array(data);
          this.buffer.push(copy);
          for (const s of this.subscribers) s.data(copy);
          opts.onData();
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

  subscribe(sub: Subscriber): () => void {
    this.subscribers.add(sub);
    return () => {
      this.subscribers.delete(sub);
    };
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
