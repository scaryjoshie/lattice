import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where the daemon keeps its state. The only module that knows: everything else asks.
 * `LATTICE_HOME` overrides it, which is how tests run against a temporary directory.
 * Owner-only, which protects against other users on the machine and not against other
 * programs running as you, the same trust model as every developer tool's dotfolder.
 */
export const home = (): string => process.env.LATTICE_HOME ?? join(homedir(), ".lattice");

export const paths = () => {
  const root = home();
  return {
    root,
    database: join(root, "lattice.db"),
    socket: join(root, "daemon.sock"),
    log: join(root, "daemon.log"),
    secrets: join(root, "secrets"),
  };
};

/** Make the home and its secrets folder, owner-only, if they are not there. */
export function ensureHome(): ReturnType<typeof paths> {
  const p = paths();
  mkdirSync(p.root, { recursive: true, mode: 0o700 });
  mkdirSync(p.secrets, { recursive: true, mode: 0o700 });
  return p;
}
