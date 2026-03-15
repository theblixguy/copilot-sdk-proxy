import type { FastifyRequest, FastifyReply } from "fastify";
import type { AppContext } from "../../context.js";
import type { ConversationManager } from "../../conversation-manager.js";
import { AnthropicRequestSchema, extractAnthropicSystem } from "./schemas.js";
import type { AnthropicRequest } from "./schemas.js";
import { formatAnthropicPrompt } from "./prompt.js";
import { handleAnthropicStreaming } from "./streaming.js";
import {
  sendAnthropicError as sendError,
  validateRequest,
} from "../shared/errors.js";
import {
  runHandlerPipeline,
  type BaseHandlerOptions,
} from "../shared/handler-core.js";

export type MessagesHandlerOptions = BaseHandlerOptions<AnthropicRequest>;

export function createMessagesHandler(
  ctx: AppContext,
  manager: ConversationManager,
  options?: MessagesHandlerOptions,
) {
  const handle = runHandlerPipeline<AnthropicRequest>(
    ctx,
    manager,
    {
      sendError,

      extractSystemMessage: (req) => extractAnthropicSystem(req.system),

      formatPrompt: (req, conversation, isReuse) =>
        formatAnthropicPrompt(
          req.messages.slice(isReuse ? conversation.sentMessageCount : 0),
        ),

      messageCount: (req) => req.messages.length,

      stream: handleAnthropicStreaming,
    },
    options,
  );

  return async function handleMessages(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const data = validateRequest(
      AnthropicRequestSchema,
      request.body,
      reply,
      sendError,
      ctx.logger,
    );
    if (!data) return;
    await handle(data, reply);
  };
}
