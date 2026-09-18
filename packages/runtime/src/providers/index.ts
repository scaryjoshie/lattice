import type { Provider } from "../types.ts";
import { ClaudeCodeProvider } from "./claude-code.ts";
import { CodexProvider } from "./codex.ts";

export { ClaudeCodeProvider, CodexProvider };

export function builtinProviders(): Provider[] {
  return [new ClaudeCodeProvider(), new CodexProvider()];
}
