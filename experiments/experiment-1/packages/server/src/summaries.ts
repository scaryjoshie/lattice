import { type Event, type Id, SYSTEM_ACTOR_ID } from "@pane/kernel";
import { callModel } from "./model.ts";
import type { Services } from "./services.ts";

/**
 * Commit explanations: a cheap model reads the diff and writes one or two sentences
 * about what changed in behavior. Stored on the commit and always shown as derived.
 */

const DIFF_LIMIT = 20_000;

export function startSummaries(s: Services): () => void {
  const queue: Id<"commit">[] = [];
  let running = false;

  const next = async () => {
    if (running) return;
    running = true;
    try {
      for (let id = queue.shift(); id; id = queue.shift()) await explain(s, id);
    } finally {
      running = false;
    }
  };

  const off = s.kernel.subscribe((e: Event) => {
    if (e.kind !== "commit.recorded" || !e.targetId) return;
    queue.push(e.targetId as Id<"commit">);
    void next();
  });
  return off;
}

async function explain(s: Services, commitId: Id<"commit">): Promise<void> {
  const c = s.kernel.store.commit(commitId);
  if (!c || c.explanation) return;
  const main = s.kernel.store.worktreesOfRepository(c.repositoryId).find((w) => w.isMain);
  if (!main) return;
  try {
    const diff = (await s.git.diff(main.path, { sha: c.sha })).slice(0, DIFF_LIMIT);
    const explanation = await callModel({
      model: s.config.summaryModel,
      system:
        "You explain one git commit in one or two plain sentences: what behavior changed and why, as far as the diff shows. No preamble, no lists.",
      prompt: `Commit message:\n${c.message}\n\nDiff:\n${diff}`,
      timeoutMs: 60_000,
    });
    if (explanation) s.kernel.commands.explainCommit(SYSTEM_ACTOR_ID, { commitId, explanation });
  } catch {
    // A missing explanation is not an error; the commit stands on its own.
  }
}
