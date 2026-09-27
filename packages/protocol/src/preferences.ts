/**
 * The app's settings (docs/settings.md): each one's default and which stored values it
 * takes, in one table both processes read. The daemon keeps them in a file that holds only
 * what differs from these defaults, as VS Code's settings.json does, so the file is short
 * enough to read and edit by hand, and a default changed here reaches everyone who never
 * chose otherwise. Anything in the file a setting cannot take is ignored and its default
 * used, so a bad hand edit costs that one setting and never the daemon.
 *
 * Adding a setting is one entry in `APP` and its control in the settings panel.
 *
 * Only the app's settings are here. A project's will be a second table built from the same
 * kinds, stored with the project and patched by naming it; nothing is shared between the
 * two tables, since no setting is both (docs/settings.md, rule 3).
 */

/** One setting: its value when nothing valid is stored, and how a stored value is read. */
interface Setting<T> {
  readonly fallback: T;
  /** A stored value as this setting's, or the fallback when it is missing or not one. */
  resolve(stored: unknown): T;
  /** What of a value differs from the fallback, as the file holds it; undefined for none. */
  sparse(value: T): unknown;
}

type ValueOf<S> = S extends Setting<infer T> ? T : never;

const plain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A value compared by identity: a flag, a string. */
function scalar<T>(fallback: T, valid: (v: unknown) => v is T): Setting<T> {
  return {
    fallback,
    resolve: (stored) => (valid(stored) ? stored : fallback),
    sparse: (value) => (value === fallback ? undefined : value),
  };
}

/** On or off. */
const flag = (fallback: boolean): Setting<boolean> => scalar(fallback, (v): v is boolean => typeof v === "boolean");

/** Any text but none: an empty field means the default, not nothing. */
const text = (fallback: string): Setting<string> => scalar(fallback, (v): v is string => typeof v === "string" && v.trim() !== "");

/** One of a few names, the first of them unless another is chosen. */
const oneOf = <const T extends string>(options: readonly [T, ...T[]]): Setting<T> =>
  scalar(options[0], (v): v is T => options.includes(v as T));

/** Settings under one name, each read on its own, so one bad value costs only itself. */
function group<const D extends Record<string, Setting<unknown>>>(definitions: D): Setting<{ readonly [K in keyof D]: ValueOf<D[K]> }> {
  type T = { readonly [K in keyof D]: ValueOf<D[K]> };
  const keys = Object.keys(definitions) as (keyof D & string)[];
  return {
    fallback: Object.fromEntries(keys.map((k) => [k, definitions[k]!.fallback])) as T,
    resolve(stored) {
      const from = plain(stored) ? stored : {};
      return Object.fromEntries(keys.map((k) => [k, definitions[k]!.resolve(from[k])])) as T;
    },
    sparse(value) {
      const out: Record<string, unknown> = {};
      for (const k of keys) {
        const differs = definitions[k]!.sparse(value[k]);
        if (differs !== undefined) out[k] = differs;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    },
  };
}

/**
 * One setting per name, for a set nobody here can list, such as the providers, which the
 * app registers and the daemon never imports. A name with no entry has the default `of`
 * gives it, and an entry that has come back to its default is dropped, so a value only
 * ever holds the names that differ.
 */
function keyed<T>(of: (key: string) => Setting<T>): Setting<Readonly<Record<string, T>>> & { entry(value: Readonly<Record<string, T>>, key: string): T } {
  return {
    fallback: {},
    resolve(stored) {
      const out: Record<string, T> = {};
      // In order of name, so two values with the same entries are the same text.
      const from = plain(stored) ? stored : {};
      for (const k of Object.keys(from).sort()) {
        const entry = of(k).resolve(from[k]);
        if (of(k).sparse(entry) !== undefined) out[k] = entry;
      }
      return out;
    },
    sparse(value) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const differs = of(k).sparse(v);
        if (differs !== undefined) out[k] = differs;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    },
    entry: (value, key) => value[key] ?? of(key).fallback,
  };
}

/** A provider with no entry is on, and started by its own name. */
const provider = (id: string) => group({ enabled: flag(true), command: text(id) });
const providers = keyed(provider);

/** The app's settings. */
const APP = group({
  theme: oneOf(["system", "light", "dark"]),
  /** The key panel, bottom left. */
  keys: flag(true),
  /** The browsers' search engine: Google unless changed, as cmux has it. */
  search: oneOf(["google", "duckduckgo", "bing", "kagi"]),
  providers,
});

export type Preferences = ValueOf<typeof APP>;
export type Theme = Preferences["theme"];
export type Engine = Preferences["search"];
export type Provider = ValueOf<ReturnType<typeof provider>>;

/** A change: any part of the preferences, to any depth. */
export type Patch = { readonly [K in keyof Preferences]?: Deep<Preferences[K]> };
type Deep<T> = T extends object ? { readonly [K in keyof T]?: Deep<T[K]> } : T;

export const DEFAULT_PREFERENCES: Preferences = APP.fallback;

/** A provider's settings, whether or not it has an entry. */
export const providerOf = (preferences: Preferences, id: string): Provider => providers.entry(preferences.providers, id);

/** Read what the file holds; nothing, or nothing valid, is the defaults. */
export const resolvePreferences = (stored: unknown): Preferences => APP.resolve(stored);

/** What the file should hold: only what differs from the defaults. */
export const storedPreferences = (preferences: Preferences): Record<string, unknown> => (APP.sparse(preferences) as Record<string, unknown> | undefined) ?? {};

/**
 * The preferences with a patch applied, read through the same definitions as the file, so
 * a value the patch sets that its setting cannot take is ignored as it would be there.
 */
export const patchPreferences = (preferences: Preferences, patch: Patch): Preferences => resolvePreferences(deep(preferences, patch));

function deep(base: unknown, patch: unknown): unknown {
  if (!plain(base) || !plain(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = deep(base[k], v);
  return out;
}
