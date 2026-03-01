import { openaiProvider } from "./openai/provider.js";
import { claudeProvider } from "./claude/provider.js";
import { codexProvider } from "./codex/provider.js";
import type { Provider } from "./types.js";

export const providers = {
  openai: openaiProvider,
  claude: claudeProvider,
  codex: codexProvider,
} satisfies Record<string, Provider>;

export type ProviderName = keyof typeof providers;
