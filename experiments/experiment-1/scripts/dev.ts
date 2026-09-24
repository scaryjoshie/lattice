#!/usr/bin/env bun
import { join } from "node:path";

/** The daemon and the UI dev server together; Ctrl-C stops both. */
const root = join(import.meta.dir, "..");
const server = Bun.spawn([process.execPath, "run", join(root, "packages/server/src/main.ts")], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});
const ui = Bun.spawn(["bunx", "vite", "--port", process.env.PANE_UI_PORT ?? "5173"], {
  cwd: join(root, "packages/ui"),
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});
const stop = () => {
  server.kill();
  ui.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race([server.exited, ui.exited]);
stop();
