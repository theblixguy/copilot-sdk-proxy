import type { Provider } from "#/providers/types.js";
import { createModelsHandler } from "#/providers/openai/models.js";
import { createCompletionsHandler } from "#/providers/openai/handler.js";
import { DefaultConversationManager } from "#/conversation-manager.js";

export const openaiProvider = {
  name: "OpenAI",
  routes: ["GET /v1/models", "POST /v1/chat/completions"],

  register(app, ctx) {
    const manager = new DefaultConversationManager(ctx.logger);
    app.get("/v1/models", createModelsHandler(ctx));
    app.post("/v1/chat/completions", createCompletionsHandler(ctx, manager));
  },
} satisfies Provider;
