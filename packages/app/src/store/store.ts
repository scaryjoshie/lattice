import { create } from "zustand";
import { type Command, type Grid, propose, type Verdict } from "@lattice/model";
import { client } from "./client.ts";

/**
 * The document, as the daemon last sent it, and the only way it changes: `run` sends a
 * command and the grid comes back. `propose` stays here, since the model is pure and
 * shared, so a preview is instant and never crosses the wire; the daemon judges the
 * same command again when it is run. History lives with the document, in the daemon;
 * undo is a request and the mark comes back with it. Nothing is applied here.
 */
interface Store {
  grid: Grid;
  connected: boolean;
  propose(command: Command): Verdict;
  run(command: Command, mark?: unknown): Promise<{ ok: boolean; dc: number; dr: number; id?: string }>;
  undo(mark?: unknown): Promise<{ ok: boolean; mark?: unknown }>;
  redo(mark?: unknown): Promise<{ ok: boolean; mark?: unknown }>;
}

const empty: Grid = { columns: [], rows: [], tiles: [], scopes: [], links: [] };
const refused = { ok: false, dc: 0, dr: 0 };

export const useGrid = create<Store>((set, get) => ({
  grid: empty,
  connected: false,
  propose(command) {
    return propose(get().grid, command);
  },
  async run(command, mark) {
    if (!get().connected) return refused;
    try {
      return await client.call("run", { command, mark });
    } catch {
      return refused;
    }
  },
  async undo(mark) {
    if (!get().connected) return { ok: false };
    return client.call("undo", { mark }).catch(() => ({ ok: false }));
  },
  async redo(mark) {
    if (!get().connected) return { ok: false };
    return client.call("redo", { mark }).catch(() => ({ ok: false }));
  },
}));

client.on("grid", ({ grid }) => useGrid.setState({ grid }));
client.onState = (connected) => useGrid.setState({ connected });
