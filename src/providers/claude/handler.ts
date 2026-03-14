import type { FastifyRequest, FastifyReply } from "fastify";
import type { AppContext } from "../../context.js";
import type { ConversationManager } from "../../conversation-manager.js";
import {
  AnthropicRequestSchema,
  extractAnthropicSystem,
} from "./schemas.js";
import type { AnthropicRequest } from "./schemas.js";
import { formatAnthropicPrompt } from "./prompt.js";
import { handleAnthropicStreaming } from "./streaming.js";
import { sendAnthropicError as sendError } from "../shared/errors.js";
import { runHandlerPipeline, type BaseHandlerOptions } from "../shared/handler-core.js";

export type MessagesHandlerOptions = BaseHandlerOptions<AnthropicRequest>;

export function createMessagesHandler(
  ctx: AppContext,
  manager: ConversationManager,
  options?: MessagesHandlerOptions,
) {
  const handle = runHandlerPipeline<AnthropicRequest>(ctx, manager, {
    sendError,

    extractSystemMessage: (req) => extractAnthropicSystem(req.system),

    formatPrompt: (req, conversation, isReuse) =>
      formatAnthropicPrompt(req.messages.slice(isReuse ? conversation.sentMessageCount : 0)),

    messageCount: (req) => req.messages.length,

    stream: (session, prompt, model, reply, deps) =>
      handleAnthropicStreaming(session, prompt, model, reply, deps.logger, deps.stats),
  }, options);

  return async function handleMessages(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parseResult = AnthropicRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      const message = firstIssue?.message ?? "Invalid request body";
      const path = firstIssue?.path.join(".") || "root";
      ctx.logger.warn(`Schema validation failed: ${message} (path: ${path})`);
      sendError(reply, 400, "invalid_request_error", message);
      return;
    }

    await handle(parseResult.data, reply);
  };
}
