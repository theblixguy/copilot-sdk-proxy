import type { FastifyRequest, FastifyReply } from "fastify";
import type { AppContext } from "../../context.js";
import type { ConversationManager } from "../../conversation-manager.js";
import { OpenAIRequestSchema, extractSystemMessages } from "./schemas.js";
import type { OpenAIRequest } from "./schemas.js";
import { formatPrompt } from "./prompt.js";
import { handleStreaming } from "./streaming.js";
import {
  sendOpenAIError as sendError,
  validateRequest,
} from "../shared/errors.js";
import {
  runHandlerPipeline,
  type BaseHandlerOptions,
} from "../shared/handler-core.js";

export type CompletionsHandlerOptions = BaseHandlerOptions<OpenAIRequest>;

export function createCompletionsHandler(
  ctx: AppContext,
  manager: ConversationManager,
  options?: CompletionsHandlerOptions,
) {
  const handle = runHandlerPipeline<OpenAIRequest>(
    ctx,
    manager,
    {
      sendError,

      extractSystemMessage: (req) => extractSystemMessages(req.messages),

      formatPrompt: (req, conversation, isReuse) =>
        formatPrompt(
          req.messages.slice(isReuse ? conversation.sentMessageCount : 0),
        ),

      messageCount: (req) => req.messages.length,

      stream: handleStreaming,
    },
    options,
  );

  return async function handleCompletions(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const data = validateRequest(
      OpenAIRequestSchema,
      request.body,
      reply,
      sendError,
      ctx.logger,
    );
    if (!data) return;
    await handle(data, reply);
  };
}
