#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Dependencies point downward. Each package may import only the workspace packages
 * listed for it (see ARCHITECTURE.md). `@pane/kernel/model` is the pure types entry
 * point and counts as kernel.
 */
const allowed: Record<string, string[]> = {
  kernel: [],
  git: ["kernel"],
  runtime: ["kernel"],
  protocol: ["kernel"],
  server: ["kernel", "git", "runtime", "protocol"],
  ui: ["kernel", "protocol"],
};

const root = join(import.meta.dir, "..", "packages");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "node_modules" || n === "dist") return [];
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

const violations: string[] = [];
for (const pkg of Object.keys(allowed)) {
  const dir = join(root, pkg);
  for (const file of files(dir)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/from\s+"@pane\/([a-z]+)(?:\/[^"]*)?"/g)) {
      const target = m[1] ?? "";
      if (target !== pkg && !allowed[pkg]?.includes(target)) {
        violations.push(`${relative(root, file)} imports @pane/${target}`);
      }
    }
    if (pkg === "ui" && /from\s+"@pane\/kernel"/.test(src)) {
      violations.push(`${relative(root, file)} imports @pane/kernel (use @pane/kernel/model)`);
    }
  }
}
if (violations.length) {
  console.error(`layering violations:\n  ${violations.join("\n  ")}`);
  process.exit(1);
}
console.log("layers ok");
