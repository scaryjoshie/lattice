import type { Git } from "@pane/git";
import type { Id, Kernel } from "@pane/kernel";
import type { Runtime } from "@pane/runtime";
import type { Config } from "./config.ts";

/** What every service and handler is composed with. */
export interface Services {
  config: Config;
  kernel: Kernel;
  git: Git;
  runtime: Runtime;
  /** The local human; surfaces act as this actor. */
  human: Id<"human">;
}

export class OperationError extends Error {
  constructor(
    message: string,
    readonly code = "invalid",
  ) {
    super(message);
    this.name = "OperationError";
  }
}

/** A filesystem-safe name: lowercase, dashes, nothing else. */
export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}
