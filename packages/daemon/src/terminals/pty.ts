import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal } from "@xterm/headless";

/**
 * One process in a terminal, and a terminal emulator with no screen mirroring it. From
 * experiment 2, where it was proved.
 *
 * The mirror is what makes attaching right. Every byte the process ever wrote was laid out
 * for the grid in force when it was written, so replaying them into a terminal of another
 * size arrives scrambled. The mirror holds the screen instead: resize it, serialise it,
 * and a window is handed the screen as it is now, laid out for its own grid. It is what
 * tmux does on reattach.
 */

/** How long a process has to leave after SIGTERM before it is killed. */
const TERM_WAIT_MS = 3000;

export interface Subscriber {
  data(chunk: Uint8Array): void;
  exit(code: number | null): void;
}

export interface SpawnOptions {
  argv: string[];
  cwd: string;
  cols: number;
  rows: number;
  onExit(code: number | null): void;
}

export class Pty {
  readonly pid: number;
  private readonly proc: Bun.Subprocess;
  private readonly mirror: Terminal;
  private readonly serializer = new SerializeAddon();
  private readonly subscribers = new Set<Subscriber>();
  private exited = false;
  private readonly done: Promise<void>;
  private settle: () => void = () => undefined;

  constructor(opts: SpawnOptions) {
    this.mirror = new Terminal({ cols: opts.cols, rows: opts.rows, allowProposedApi: true, scrollback: 5000 });
    this.mirror.loadAddon(this.serializer);
    this.done = new Promise((resolve) => {
      this.settle = resolve;
    });
    this.proc = Bun.spawn(opts.argv, {
      cwd: opts.cwd,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" } as Record<string, string>,
      terminal: {
        cols: opts.cols,
        rows: opts.rows,
        data: (_term, data) => {
          const copy = new Uint8Array(data);
          this.mirror.write(copy);
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

  /**
   * Resize the process and the mirror together. Anything else and the screen handed out
   * disagrees with the screen the process believes it is drawing on.
   */
  resize(cols: number, rows: number): void {
    const c = Math.max(2, Math.floor(cols));
    const r = Math.max(1, Math.floor(rows));
    if (c === this.mirror.cols && r === this.mirror.rows) return;
    this.mirror.resize(c, r);
    if (!this.exited) this.proc.terminal?.resize(c, r);
  }

  /** The current screen, as escape sequences that rebuild it at the mirror's grid. */
  async snapshot(): Promise<string> {
    // write() parses asynchronously; flush before reading the buffer back out.
    await new Promise<void>((resolve) => this.mirror.write("", resolve));
    return this.serializer.serialize({ scrollback: 0 });
  }

  subscribe(sub: Subscriber): () => void {
    this.subscribers.add(sub);
    return () => {
      this.subscribers.delete(sub);
    };
  }

  /** SIGTERM, then SIGKILL if the process is still there after a grace period. */
  async stop(): Promise<void> {
    this.mirror.dispose();
    if (this.exited) return;
    this.proc.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (!this.exited) this.proc.kill("SIGKILL");
    }, TERM_WAIT_MS);
    await this.done;
    clearTimeout(timer);
  }
}
