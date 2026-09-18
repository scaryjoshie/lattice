import { z } from "zod";
import {
  anyId,
  kindOf,
  RELATION_RULES,
  RELATION_TYPES,
  type Relation,
  type RelationType,
} from "../model/index.ts";
import { type Ctx, command, KernelError } from "./define.ts";
import { requireObject } from "./guards.ts";

/**
 * Edges. `addRelation` is what other commands call to attach provenance and
 * assignment; `link` and `unlink` expose it directly.
 */

export function addRelation(
  ctx: Ctx,
  sourceId: string,
  type: RelationType,
  targetId: string,
  cause?: string,
): Relation {
  const rule = RELATION_RULES[type];
  const sk = kindOf(sourceId);
  const tk = kindOf(targetId);
  if (!sk || !rule.source.includes(sk)) {
    throw new KernelError(`${type}: source may not be ${sk ?? "unknown"} (${sourceId})`);
  }
  if (!tk || !rule.target.includes(tk)) {
    throw new KernelError(`${type}: target may not be ${tk ?? "unknown"} (${targetId})`);
  }
  if (sourceId === targetId) throw new KernelError(`${type}: an object cannot relate to itself`);
  requireObject(ctx, sourceId);
  requireObject(ctx, targetId);
  const sp = ctx.store.projectOf(sourceId);
  const tp = ctx.store.projectOf(targetId);
  if (sp && tp && sp !== tp)
    throw new KernelError(`${type}: objects are in different projects`, "forbidden");
  if (rule.acyclic && reaches(ctx, targetId, sourceId, type)) {
    throw new KernelError(`${type}: ${sourceId} → ${targetId} would form a cycle`, "conflict");
  }
  const existing = ctx.store.relation(sourceId, type, targetId);
  if (existing) return existing;
  if (rule.exclusive) {
    for (const r of ctx.store.relationsFrom(sourceId, type)) removeRelation(ctx, r, cause);
  }
  const relation: Relation = { sourceId, type, targetId, createdBy: ctx.actor, createdAt: ctx.now };
  ctx.store.insert("relations", {
    source_id: sourceId,
    type,
    target_id: targetId,
    created_by: ctx.actor,
    created_at: ctx.now,
  });
  ctx.emit("relation.added", {
    target: sourceId,
    project: sp ?? tp ?? null,
    payload: { type, targetId },
    cause,
  });
  return relation;
}

export function removeRelation(ctx: Ctx, r: Relation, cause?: string): boolean {
  const n = ctx.store.delete("relations", {
    source_id: r.sourceId,
    type: r.type,
    target_id: r.targetId,
  });
  if (n === 0) return false;
  ctx.emit("relation.removed", {
    target: r.sourceId,
    project: ctx.store.projectOf(r.sourceId) ?? null,
    payload: { type: r.type, targetId: r.targetId },
    cause,
  });
  return true;
}

/** Whether `from` reaches `to` along edges of `type` (for cycle checks). */
function reaches(ctx: Ctx, from: string, to: string, type: RelationType): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop() as string;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const r of ctx.store.relationsFrom(id, type)) stack.push(r.targetId);
  }
  return false;
}

/** Exclusive edge from a source, if any (assignment, location, owner, fork origin). */
export function exclusiveTarget(
  ctx: Ctx,
  sourceId: string,
  type: RelationType,
): string | undefined {
  return ctx.store.relationsFrom(sourceId, type)[0]?.targetId;
}

export const relationType = z.enum(RELATION_TYPES);

export const link = command(
  "link",
  z.object({ sourceId: anyId, type: relationType, targetId: anyId }),
  (ctx, p) => addRelation(ctx, p.sourceId, p.type, p.targetId),
);

export const unlink = command(
  "unlink",
  z.object({ sourceId: anyId, type: relationType, targetId: anyId }),
  (ctx, p): boolean => {
    const r = ctx.store.relation(p.sourceId, p.type, p.targetId);
    return r ? removeRelation(ctx, r) : false;
  },
);

/** Attach many provenance edges of one type from a new object; used by item commands. */
export function attach(
  ctx: Ctx,
  sourceId: string,
  type: RelationType,
  targets: readonly string[] | undefined,
) {
  for (const t of targets ?? []) addRelation(ctx, sourceId, type, t);
}
