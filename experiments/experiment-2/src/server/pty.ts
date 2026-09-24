import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal } from "@xterm/headless";
import { SPAWN_COLS, SPAWN_ROWS } from "../protocol.ts";

/**
 * One process inside a PTY, plus a headless terminal emulator mirroring it.
 *
 * The mirror is what makes attaching correct. A raw replay of every byte the process
 * ever wrote was laid out for the grid in force at the time, so replaying it into a
 * differently sized terminal arrives scrambled. The mirror holds the *screen* instead:
 * resize it, serialize it, and the client gets the current state already laid out for
 * the grid it asked for. This is what terminal multiplexers do on reattach.
 */

const TERM_WAIT_MS = 3000;

export interface Subscriber {
  data(chunk: Uint8Array): void;
  exit(code: number | null): void;
}

export interface SpawnOptions {
  argv: string[];
  cwd: string;
  onData(): void;
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
    this.mirror = new Terminal({
      cols: SPAWN_COLS,
      rows: SPAWN_ROWS,
      allowProposedApi: true,
      scrollback: 5000,
    });
    this.mirror.loadAddon(this.serializer);
    this.done = new Promise((resolve) => {
      this.settle = resolve;
    });
    this.proc = Bun.spawn(opts.argv, {
      cwd: opts.cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
      terminal: {
        cols: SPAWN_COLS,
        rows: SPAWN_ROWS,
        data: (_term, data) => {
          const copy = new Uint8Array(data);
          this.mirror.write(copy);
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

  get cols(): number {
    return this.mirror.cols;
  }

  get rows(): number {
    return this.mirror.rows;
  }

  write(data: string | Uint8Array): void {
    if (this.exited) return;
    this.proc.terminal?.write(data);
  }

  /**
   * Resize the process and the mirror together. Anything else and the screen we hand out
   * disagrees with the screen the process believes it is drawing on.
   */
  resize(cols: number, rows: number): void {
    const c = Math.max(2, Math.floor(cols));
    const r = Math.max(1, Math.floor(rows));
    if (c === this.mirror.cols && r === this.mirror.rows) return;
    this.mirror.resize(c, r);
    if (!this.exited) this.proc.terminal?.resize(c, r);
  }

  /** The current screen, as escape sequences that reconstruct it at the mirror's grid. */
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
