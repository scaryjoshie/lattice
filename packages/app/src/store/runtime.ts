import { create } from "zustand";
import type { Facts, RuntimeCommand } from "../runtime/facts.ts";
import { client } from "./client.ts";

/**
 * What the runtime has observed, as the daemon last sent it. A runtime command is a
 * request; the facts come back as a notification. Nothing about them enters the grid.
 */
interface Store {
  facts: Facts;
  observe(command: RuntimeCommand): void;
}

export const useRuntime = create<Store>(() => ({
  facts: { hosting: {} },
  observe(command) {
    const request = command.kind === "start" ? client.call("start", { host: command.host, occupant: command.occupant }) : client.call("stop", { host: command.host });
    request.catch(() => {});
  },
}));

client.on("facts", ({ facts }) => useRuntime.setState({ facts: facts as Facts }));
