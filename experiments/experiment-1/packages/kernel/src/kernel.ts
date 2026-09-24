import type { z } from "zod";
import { type Ctx, type EmitOptions, KernelError } from "./commands/define.ts";
import { type CommandName, type Commands, commands } from "./commands/index.ts";
import { type ActorId, type Event, newId } from "./model/index.ts";
import * as queries from "./queries/index.ts";
import { Store } from "./store/store.ts";

/**
 * The kernel: one store, the command table, and an event feed. `run` validates,
 * executes in a transaction, records events, and publishes them after commit.
 */

export type Params<K extends CommandName> = z.input<Commands[K]["params"]>;
export type Result<K extends CommandName> = ReturnType<Commands[K]["run"]>;

export type BoundCommands = {
  [K in CommandName]: (actor: ActorId, params: Params<K>) => Result<K>;
};

export type Listener = (event: Event) => void;

export class Kernel {
  readonly store: Store;
  readonly commands: BoundCommands;
  readonly query: typeof queries;
  private readonly listeners = new Set<Listener>();

  constructor(path: string) {
    this.store = new Store(path);
    this.query = queries;
    const bound: Partial<BoundCommands> = {};
    for (const name of Object.keys(commands) as CommandName[]) {
      (bound as Record<string, unknown>)[name] = (actor: ActorId, params: unknown) =>
        this.run(name, actor, params as Params<typeof name>);
    }
    this.commands = bound as BoundCommands;
  }

  run<K extends CommandName>(name: K, actor: ActorId, params: Params<K>): Result<K> {
    const cmd = commands[name];
    if (!cmd) throw new KernelError(`unknown command ${String(name)}`, "not_found");
    const parsed = cmd.params.safeParse(params);
    if (!parsed.success) {
      throw new KernelError(
        `${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "params"}: ${i.message}`).join("; ")}`,
      );
    }
    if (!this.store.actor(actor)) throw new KernelError(`actor ${actor} not found`, "not_found");
    const now = Date.now();
    const pending: Event[] = [];
    const store = this.store;
    const ctx: Ctx = {
      store,
      actor,
      now,
      emit(kind: string, opts: EmitOptions = {}): Event {
        const id = newId("event");
        store.insert("events", {
          id,
          project_id: opts.project ?? null,
          kind,
          actor_id: actor,
          at: now,
          target_id: opts.target ?? null,
          cause_id: opts.cause ?? null,
          payload: JSON.stringify(opts.payload ?? {}),
        });
        const seq = store.get<{ seq: number }>("SELECT seq FROM events WHERE id = ?", id)?.seq ?? 0;
        const event: Event = {
          seq,
          id,
          projectId: opts.project ?? null,
          kind,
          actorId: actor,
          at: now,
          targetId: opts.target ?? null,
          causeId: opts.cause ?? null,
          payload: opts.payload ?? {},
        };
        pending.push(event);
        return event;
      },
    };
    const result = this.store.transaction(() =>
      (cmd.run as (c: Ctx, p: unknown) => Result<K>)(ctx, parsed.data),
    );
    for (const e of pending) for (const l of this.listeners) l(e);
    return result;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    this.store.close();
  }
}

export function openKernel(path: string): Kernel {
  return new Kernel(path);
}
