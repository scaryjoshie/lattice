import type { Descriptor } from "../../providers/descriptor.ts";

/** What a terminal shows when it hosts no agent. A program like any other, and not a
 *  brand: a prompt is the thing everyone already reads as a shell. */
export const shell: Descriptor<"shell"> = {
  id: "shell",
  label: "terminal",
  surface: "terminal",
  agent: false,
  mark: [
  { d: "M4 6.5l4.2 4.2a1.2 1.2 0 010 1.7L4 16.6", width: 2.1 },
  { d: "M12.5 17h7.2", width: 2.1 },
  ],
};
