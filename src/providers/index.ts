import { openaiProvider } from "./openai/provider.js";
import { claudeProvider } from "./claude/provider.js";
import { codexProvider } from "./codex/provider.js";
import type { Provider } from "./types.js";
import type { AppContext } from "../context.js";
import type { ServerConfig } from "../config.js";
import { PROVIDER_NAMES, type ProviderName } from "../schemas/config.js";

export { PROVIDER_NAMES } from "../schemas/config.js";
export type { ProviderName } from "../schemas/config.js";

export const providers = {
  openai: openaiProvider,
  claude: claudeProvider,
  codex: codexProvider,
} satisfies Record<ProviderName, Provider>;

export function createAutoProvider(
  configs: Record<ProviderName, ServerConfig>,
): Provider {
  return {
    name: "Auto",
    routes: Object.values(providers).flatMap((p) => p.routes),
    register(app, baseCtx) {
      for (const name of PROVIDER_NAMES) {
        const provider = providers[name];
        const ctx: AppContext = {
          ...baseCtx,
          config: configs[name],
        };
        app.register((scoped, _opts, done) => {
          provider.register(scoped, ctx);
          done();
        });
      }
    },
  };
}
