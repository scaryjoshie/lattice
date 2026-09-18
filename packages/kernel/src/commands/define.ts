import type { z } from "zod";
import type { ActorId, Event, Id } from "../model/index.ts";
import type { Store } from "../store/store.ts";

/**
 * A command is the only way to write. It validates its params, runs inside one
 * transaction with a context that records events, and returns a typed result. The
 * events are published to subscribers only after the transaction commits.
 */

export type KernelErrorCode = "not_found" | "invalid" | "conflict" | "forbidden";

export class KernelError extends Error {
  constructor(
    message: string,
    readonly code: KernelErrorCode = "invalid",
  ) {
    super(message);
    this.name = "KernelError";
  }
}

export interface EmitOptions {
  target?: string | null;
  project?: Id<"project"> | null;
  payload?: Record<string, unknown>;
  cause?: string | null;
}

export interface Ctx {
  readonly store: Store;
  readonly actor: ActorId;
  readonly now: number;
  /** Record an event in the transaction; it reaches subscribers after commit. */
  emit(kind: string, opts?: EmitOptions): Event;
}

export interface Command<S extends z.ZodType = z.ZodType, R = unknown> {
  readonly name: string;
  readonly params: S;
  run(ctx: Ctx, params: z.output<S>): R;
}

export function command<S extends z.ZodType, R>(
  name: string,
  params: S,
  run: (ctx: Ctx, params: z.output<S>) => R,
): Command<S, R> {
  return { name, params, run };
}
