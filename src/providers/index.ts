import { claude } from "./claude/index.ts";
import { codex } from "./codex/index.ts";
import type { Descriptor } from "./descriptor.ts";
import { shell } from "./shell/index.ts";

/**
 * The registry: the one file that lists the providers, and it knows nothing about them
 * but their names. Each provider is a folder that defines everything about itself.
 * Adding one is a folder and a line here.
 */
export const PROGRAMS = { shell, claude, codex } as const satisfies Record<string, Descriptor>;

export type ProgramId = keyof typeof PROGRAMS;
export type { Descriptor, Stroke } from "./descriptor.ts";
