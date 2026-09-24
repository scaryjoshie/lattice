#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Dependencies point down. Each module names what it may import; a module not named here
 * fails, so a new file has to be placed before it builds. The view (every .tsx, and the
 * camera) may import anything below it, and nothing below the view may import it.
 *
 *   region, geometry, theme, pointer    import nothing
 *   model                               region
 *   marks, measure                      model, geometry
 *   store                               model, measure, region
 *   interaction                         model, region, geometry            (to be written)
 *   scene                               model, region, geometry, measure   (to be written)
 *   paint                               scene and what scene may, plus marks, theme
 *   camera                              geometry, pointer
 */
const LAYERS: Record<string, readonly string[]> = {
  region: [],
  geometry: [],
  theme: [],
  pointer: [],
  model: ["region"],
  marks: ["model"],
  measure: ["geometry", "model"],
  store: ["model", "measure", "region"],
  interaction: ["model", "region", "geometry"],
  scene: ["model", "region", "geometry", "measure"],
  paint: ["scene", "model", "region", "geometry", "measure", "marks", "theme"],
  camera: ["geometry", "pointer"],
};

const root = join(import.meta.dir, "..", "src");
const violations: string[] = [];
for (const file of readdirSync(root)) {
  if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".test.ts")) continue;
  const name = basename(file).replace(/\.tsx?$/, "");
  const view = file.endsWith(".tsx");
  const allowed = LAYERS[name];
  if (!view && !allowed) {
    violations.push(`${file} is not placed in a layer`);
    continue;
  }
  const src = readFileSync(join(root, file), "utf8");
  for (const m of src.matchAll(/from\s+"\.\/([^"]+)"/g)) {
    const target = (m[1] ?? "").replace(/\.tsx?$/, "").replace(/\.css$/, "");
    const targetIsView = (m[1] ?? "").endsWith(".tsx");
    if (view) {
      if (targetIsView && name !== "App" && name !== "main" && name !== "Grid" && name !== "Menu") {
        violations.push(`${file} (view) imports another view, ${m[1]}`);
      }
      continue;
    }
    if (targetIsView) violations.push(`${file} (${name}) imports the view, ${m[1]}`);
    else if (!allowed?.includes(target)) violations.push(`${file} (${name}) imports ${target}`);
  }
}
if (violations.length > 0) {
  console.error(`layering violations:\n  ${violations.join("\n  ")}`);
  process.exit(1);
}
console.log("layers ok");
