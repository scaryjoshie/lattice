import { Agents } from "./agents/agents.ts";
import { ensureHome } from "./core/paths.ts";
import { Store } from "./core/store.ts";
import { Document, upgrade } from "./document/document.ts";
import { seed } from "./document/seed.ts";
import { listen } from "./server/listen.ts";
import { Rpc } from "./server/rpc.ts";
import { Terminals } from "./terminals/terminals.ts";

/**
 * The daemon. A child of the app: started when the app starts, stopped when it quits. It
 * owns the document and its history, what is hosted where, and the terminals; the agent
 * service comes next. Everything that would still be true with no window open.
 */
export function start(): { close(): void; session: { port: number; token: string } } {
  const p = ensureHome();
  const store = new Store(p.database);
  const saved = store.loadDocument();
  const had = saved && upgrade(saved);
  const fresh = had ? null : seed();
  const document = new Document(store, had ?? fresh!.grid);
  if (fresh) store.saveDocument(fresh.grid);
  // Facts are not persisted: what runs is observed, and nothing runs across a restart yet.
  const agents = new Agents(store, fresh?.facts ?? { hosting: {} });
  const terminals = new Terminals();
  // A host that leaves the grid takes its terminal with it.
  document.onChange((grid) => terminals.keep(new Set(grid.tiles.map((t) => t.id))));
  const rpc = new Rpc(document, agents, terminals, p.root);
  const doors = listen(rpc, { socket: p.socket, session: p.session });
  return {
    session: doors.session,
    close() {
      doors.close();
      void terminals.close();
      store.close();
    },
  };
}

if (import.meta.main) {
  const daemon = start();
  console.log(`lattice daemon: socket at ${ensureHome().socket}, websocket on ${daemon.session.port}`);
  const stop = () => {
    daemon.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  // A child of the app: when the parent goes away, so does this. The parent says it is
  // one by piping stdin and setting LATTICE_PARENT; run by hand, the daemon stays up.
  if (process.env.LATTICE_PARENT) {
    process.stdin.on("end", stop);
    process.stdin.resume();
  }
}
