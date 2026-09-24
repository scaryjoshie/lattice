import type { Descriptor } from "../descriptor.ts";

/** A plain shell is a program like any other, and not a brand: a prompt is the thing
 *  everyone already reads as one. */
export const shell: Descriptor<"shell"> = {
  id: "shell",
  label: "terminal",
  agent: false,
  mark: [
    { d: "M4 6.5l4.2 4.2a1.2 1.2 0 010 1.7L4 16.6", width: 2.1 },
    { d: "M12.5 17h7.2", width: 2.1 },
  ],
};
