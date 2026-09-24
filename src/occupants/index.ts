import { PROVIDERS } from "../providers/index.ts";
import type { Descriptor } from "../providers/descriptor.ts";
import { browser } from "./browser/index.ts";
import { shell } from "./shell/index.ts";
import { SURFACES } from "./surfaces.ts";

/**
 * Everything a host can hold: the grid's own occupants, a shell and a browser page, and
 * every provider. One registry, so the scene, the menu and the runtime look things up in
 * one place and know nothing about any of them but what its descriptor says.
 */
export const OCCUPANTS = { shell, browser, ...PROVIDERS } as const satisfies Record<string, Descriptor>;

export type OccupantId = keyof typeof OCCUPANTS;

/** What a host shows with nothing in it: its surface's idle occupant. */
export const idleOf = (surface: string): OccupantId =>
  ((SURFACES as Record<string, { idle: string }>)[surface]?.idle ?? "shell") as OccupantId;

export { SURFACES, type SurfaceId, DEFAULT_SURFACE } from "./surfaces.ts";
export type { Descriptor, Stroke } from "../providers/descriptor.ts";
