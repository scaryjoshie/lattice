import type { Git } from "@pane/git";
import { type Id, type Kernel, SYSTEM_ACTOR_ID } from "@pane/kernel";

/** The one local human. Created on first run, named from git when git knows a name. */
export async function ensureHuman(kernel: Kernel, git: Git): Promise<Id<"human">> {
  const existing = kernel.store.humans()[0];
  if (existing) return existing.id as Id<"human">;
  const name = (await git.config("user.name").catch(() => null)) ?? "You";
  return kernel.commands.createHuman(SYSTEM_ACTOR_ID, { name }).id as Id<"human">;
}
