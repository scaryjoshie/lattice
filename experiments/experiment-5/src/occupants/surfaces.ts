/**
 * What a host opens into and what the daemon allocates for it. A host is created for a
 * surface and keeps it: a terminal shows a shell, then Claude, then a shell again, and is
 * a terminal throughout; a webview cannot become a terminal. Each surface names the
 * occupant a host of it shows when nothing else is in it.
 *
 * Adding a surface is a row here and a view component that mounts it. The grid, the
 * session and the scene do not change.
 */
export interface Surface<Id extends string = string> {
  readonly id: Id;
  /** The occupant a host of this surface shows by default. */
  readonly idle: string;
}

export const SURFACES = {
  terminal: { id: "terminal", idle: "shell" },
  webview: { id: "webview", idle: "browser" },
} as const satisfies Record<string, Surface>;

export type SurfaceId = keyof typeof SURFACES;

/** The terminal is what most hosts are, so it is what a host is unless something says otherwise. */
export const DEFAULT_SURFACE: SurfaceId = "terminal";
