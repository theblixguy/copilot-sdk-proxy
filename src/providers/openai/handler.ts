import type { FastifyRequest, FastifyReply } from "fastify";
import type { AppContext } from "../../context.js";
import type { ConversationManager } from "../../conversation-manager.js";
import { OpenAIRequestSchema, extractSystemMessages } from "./schemas.js";
import type { OpenAIRequest } from "./schemas.js";
import { formatPrompt } from "./prompt.js";
import { handleStreaming } from "./streaming.js";
import { sendOpenAIError as sendError } from "../shared/errors.js";
import { runHandlerPipeline, type BaseHandlerOptions } from "../shared/handler-core.js";

export type CompletionsHandlerOptions = BaseHandlerOptions<OpenAIRequest>;

export function createCompletionsHandler(ctx: AppContext, manager: ConversationManager, options?: CompletionsHandlerOptions) {
  const handle = runHandlerPipeline<OpenAIRequest>(ctx, manager, {
    sendError,

    extractSystemMessage: (req) => extractSystemMessages(req.messages),

    formatPrompt: (req, conversation) =>
      formatPrompt(req.messages.slice(conversation.sentMessageCount)),

    messageCount: (req) => req.messages.length,

    stream: (session, prompt, model, reply, deps) =>
      handleStreaming(session, prompt, model, reply, deps.logger, deps.stats),
  }, options);

  return async function handleCompletions(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parseResult = OpenAIRequestSchema.safeParse(request.body);
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
