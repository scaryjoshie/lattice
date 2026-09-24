import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * In development without the shell, the app asks the dev server where the daemon is, and
 * the dev server reads the same owner-only session file the shell would. The app never
 * reads the file itself.
 */
const session = (): Plugin => ({
  name: "lattice-session",
  configureServer(server) {
    server.middlewares.use("/__lattice/session", (_req, res) => {
      const file = join(process.env.LATTICE_HOME ?? join(homedir(), ".lattice"), "session.json");
      try {
        res.setHeader("content-type", "application/json");
        res.end(readFileSync(file, "utf8"));
      } catch {
        res.statusCode = 503;
        res.end("{}");
      }
    });
  },
});

export default defineConfig({ plugins: [react(), session()], server: { port: 5277 } });
