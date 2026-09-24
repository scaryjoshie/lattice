import { z } from "zod";

/**
 * Every object has a stable, typed, globally unique id: `<prefix>_<7 url-safe chars>`.
 * The prefix names the kind, so an id alone says what it points at.
 */
export const ID_PREFIX = {
  project: "proj",
  repository: "repo",
  worktree: "wt",
  human: "human",
  agent: "agent",
  system: "sys",
  task: "task",
  problem: "prob",
  question: "q",
  decision: "dec",
  attention: "att",
  commit: "commit",
  conversation: "conv",
  message: "msg",
  event: "ev",
} as const;

export type ObjectKind = keyof typeof ID_PREFIX;
export type Id<K extends ObjectKind = ObjectKind> = `${(typeof ID_PREFIX)[K]}_${string}`;

export type ScopeKind = "project" | "repository" | "worktree";
export type ActorKind = "human" | "agent" | "system";
export type ItemKind = "task" | "problem" | "question" | "decision" | "attention";
export type ScopeId = Id<ScopeKind>;
export type ActorId = Id<ActorKind>;
export type ItemId = Id<ItemKind>;

export const OBJECT_KINDS = Object.keys(ID_PREFIX) as ObjectKind[];
const KIND_BY_PREFIX = new Map<string, ObjectKind>(
  OBJECT_KINDS.map((k) => [ID_PREFIX[k], k] as const),
);

/** The one system actor: what Pane itself does (derived summaries, observed facts). */
export const SYSTEM_ACTOR_ID: Id<"system"> = "sys_pane";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const RANDOM_LENGTH = 7;

export function newId<K extends ObjectKind>(kind: K): Id<K> {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_LENGTH));
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `${ID_PREFIX[kind]}_${s}` as Id<K>;
}

export function kindOf(id: string): ObjectKind | undefined {
  const i = id.indexOf("_");
  return i > 0 ? KIND_BY_PREFIX.get(id.slice(0, i)) : undefined;
}

export function isId<K extends ObjectKind>(id: string, ...kinds: K[]): id is Id<K> {
  const k = kindOf(id);
  return k !== undefined && (kinds.length === 0 || (kinds as ObjectKind[]).includes(k));
}

/** zod schema for an id of one of the given kinds (any kind when none given). */
export function idOf<K extends ObjectKind>(...kinds: K[]) {
  return z
    .string()
    .refine((s) => isId(s, ...kinds), {
      message: kinds.length ? `expected ${kinds.join(" | ")} id` : "expected an id",
    })
    .transform((s) => s as Id<K>);
}

export const scopeId = idOf("project", "repository", "worktree");
export const actorId = idOf("human", "agent", "system");
export const anyId = idOf();
