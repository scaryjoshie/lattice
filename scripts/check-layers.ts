#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Dependencies point down. A folder is a layer; a file may import from its own folder or
 * any folder earlier in this list, and nothing outside `view` imports `view`. A file in a
 * folder not listed fails, so a new file has to be placed before it builds. `main.tsx` at
 * the root may import anything.
 */
const LAYERS = ["model", "mock", "session", "store", "scene", "paint", "view"] as const;

/** Debts: imports the rule forbids, allowed by name until the debt is paid. */
const DEBTS: Record<string, readonly string[]> = {
  // Text geometry is measured in the store until a run's span is derived once, in the
  // layout, with caps as the only stored size.
  "store/store.ts": ["paint/measure.ts"],
};

const root = resolve(import.meta.dir, "..", "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts") ? [p] : [];
  });

const layerOf = (rel: string): number => LAYERS.indexOf(rel.split("/")[0] as (typeof LAYERS)[number]);
const violations: string[] = [];
for (const file of files(root)) {
  const rel = relative(root, file);
  if (rel === "main.tsx") continue;
  const layer = layerOf(rel);
  if (layer < 0) {
    violations.push(`${rel} is not in a layer`);
    continue;
  }
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const target = relative(root, resolve(file, "..", m[1] ?? ""));
    if (target.endsWith(".css")) continue;
    const to = layerOf(target);
    if (to < 0) violations.push(`${rel} imports ${target}, which is in no layer`);
    else if (to > layer && !DEBTS[rel]?.includes(target)) violations.push(`${rel} (${LAYERS[layer]}) imports ${target} (${LAYERS[to]})`);
  }
}
if (violations.length > 0) {
  console.error(`layering violations:\n  ${violations.join("\n  ")}`);
  process.exit(1);
}
console.log("layers ok");
