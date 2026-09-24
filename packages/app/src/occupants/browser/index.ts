import type { Descriptor } from "../../providers/descriptor.ts";

/** A page, in a webview. What a webview host shows when nothing else is in it. */
export const browser: Descriptor<"browser"> = {
  id: "browser",
  label: "browser",
  surface: "webview",
  agent: false,
  mark: [
  { d: "M5.2 4.2h13.6a2.6 2.6 0 012.6 2.6v10.4a2.6 2.6 0 01-2.6 2.6H5.2a2.6 2.6 0 01-2.6-2.6V6.8a2.6 2.6 0 012.6-2.6z", width: 2 },
  { d: "M2.6 9.1h18.8", width: 2 },
  ],
};
