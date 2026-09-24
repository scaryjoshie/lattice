import { create } from "zustand";
import { seeded } from "../mock/seed.ts";
import { type Facts, observe, type RuntimeCommand } from "../runtime/facts.ts";

/**
 * What the runtime has observed, held beside the document. Runtime commands go here and
 * come back as facts; nothing about them enters the grid or its history.
 */
interface Store {
  facts: Facts;
  observe(command: RuntimeCommand): void;
}

export const useRuntime = create<Store>((set) => ({
  // The mock's facts, until a daemon observes anything.
  facts: seeded.facts,
  observe(command) {
    set((s) => ({ facts: observe(s.facts, command) }));
  },
}));
