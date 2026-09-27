import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PREFERENCES, providerOf } from "@lattice/protocol";
import { ensureHome } from "./paths.ts";
import { Preferences } from "./preferences.ts";

let home: string;
let file: string;
let preferences: Preferences | null = null;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "lattice-"));
  process.env.LATTICE_HOME = home;
  file = ensureHome().preferences;
});
afterEach(() => {
  preferences?.close();
  preferences = null;
  rmSync(home, { recursive: true, force: true });
});

const open = () => (preferences = new Preferences(file));
const onDisk = () => JSON.parse(readFileSync(file, "utf8")) as unknown;

describe("the preferences file", () => {
  test("with no file, every setting is its default, and no file is made", () => {
    const p = open();
    expect(p.current()).toEqual(DEFAULT_PREFERENCES);
    expect(providerOf(p.current(), "claude")).toEqual({ enabled: true, command: "claude" });
    expect(existsSync(file)).toBe(false);
  });

  test("a file that names some settings sets those, and the rest are their defaults", () => {
    writeFileSync(file, JSON.stringify({ theme: "dark", providers: { codex: { command: "/opt/bin/codex" } } }));
    const p = open().current();
    expect(p.theme).toBe("dark");
    expect(p.keys).toBe(true);
    expect(p.search).toBe("google");
    expect(providerOf(p, "codex")).toEqual({ enabled: true, command: "/opt/bin/codex" });
    expect(providerOf(p, "claude")).toEqual({ enabled: true, command: "claude" });
  });

  test("a value a setting cannot take is its default, and the rest of the file still counts", () => {
    writeFileSync(
      file,
      JSON.stringify({ theme: "purple", keys: "no", search: "kagi", unknown: 1, providers: { claude: { enabled: "off", command: "" }, codex: 3 } }),
    );
    const p = open().current();
    expect(p).toEqual({ ...DEFAULT_PREFERENCES, search: "kagi" });
  });

  test("a file that is not JSON is the defaults", () => {
    writeFileSync(file, "{ theme: dark");
    expect(open().current()).toEqual(DEFAULT_PREFERENCES);
  });

  test("a change writes only what differs from the defaults, owner-only", () => {
    const p = open();
    p.prefer({ theme: "light", providers: { claude: { command: "/usr/local/bin/claude" } } });
    expect(onDisk()).toEqual({ theme: "light", providers: { claude: { command: "/usr/local/bin/claude" } } });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    p.prefer({ providers: { claude: { enabled: false } } });
    expect(onDisk()).toEqual({ theme: "light", providers: { claude: { enabled: false, command: "/usr/local/bin/claude" } } });
    // Back to the defaults, and the file says nothing about them.
    p.prefer({ theme: "system", providers: { claude: { enabled: true, command: "claude" } } });
    expect(onDisk()).toEqual({});
    expect(p.current()).toEqual(DEFAULT_PREFERENCES);
  });

  test("a change a setting cannot take changes nothing", () => {
    const p = open();
    const heard: unknown[] = [];
    p.onChange((v) => heard.push(v));
    p.prefer({ theme: "purple" as never });
    expect(p.current()).toEqual(DEFAULT_PREFERENCES);
    expect(heard).toEqual([]);
    expect(existsSync(file)).toBe(false);
  });

  test("an edit made by hand is picked up and told", async () => {
    const p = open();
    const heard = new Promise((resolve) => p.onChange(resolve));
    writeFileSync(file, JSON.stringify({ keys: false }));
    expect(await heard).toEqual({ ...DEFAULT_PREFERENCES, keys: false });
    expect(p.current().keys).toBe(false);
  });
});
