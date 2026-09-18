import type { Conversation, Id, Kernel, Message } from "@pane/kernel";

/**
 * How a bus message reads inside an agent's session, and a per-agent queue so
 * messages arrive in order and never twice.
 */

export function attributed(kernel: Kernel, message: Message, conversation: Conversation): string {
  const sender = kernel.store.actor(message.fromActorId)?.name ?? message.fromActorId;
  let where = "you";
  if (conversation.kind === "group" && conversation.scopeId) {
    const wt = kernel.store.worktree(conversation.scopeId as Id<"worktree">);
    where = `#${wt?.name ?? conversation.scopeId}`;
  } else if (conversation.kind === "ask") {
    where = conversation.title ? `ask: ${conversation.title}` : "ask";
  }
  // The conversation id is what `reply` takes; the message id is not needed by the agent.
  return `[pane ${conversation.id}] ${sender} → ${where}: ${message.body}`;
}

export class DeliveryQueue {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly seen = new Set<string>();

  /** Run `job` after everything queued for `agentId`; skip if this message was already queued. */
  enqueue(agentId: string, messageId: string, job: () => Promise<void>): Promise<void> {
    const key = `${agentId}:${messageId}`;
    if (this.seen.has(key)) return this.chains.get(agentId) ?? Promise.resolve();
    this.seen.add(key);
    const prev = this.chains.get(agentId) ?? Promise.resolve();
    const next = prev.then(job, job).catch(() => undefined);
    this.chains.set(agentId, next);
    return next;
  }

  /** Forget a message so a later redelivery pass may try again. */
  release(agentId: string, messageId: string): void {
    this.seen.delete(`${agentId}:${messageId}`);
  }
}
