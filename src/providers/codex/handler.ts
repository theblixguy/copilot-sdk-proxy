import type { FastifyRequest, FastifyReply } from "fastify";
import type { CopilotSession } from "@github/copilot-sdk";
import type { AppContext } from "../../context.js";
import type { Conversation, ConversationManager } from "../../conversation-manager.js";
import { ResponsesRequestSchema } from "./schemas.js";
import { genId } from "./schemas.js";
import type { ResponsesRequest } from "./schemas.js";
import {
  formatResponsesPrompt,
  extractInstructions,
} from "./prompt.js";
import { handleResponsesStreaming } from "./streaming.js";
import { sendOpenAIError as sendError } from "../shared/errors.js";
import { runHandlerPipeline, type BaseHandlerOptions } from "../shared/handler-core.js";

export interface ResponsesHandlerOptions extends Omit<BaseHandlerOptions<ResponsesRequest>, "handleStreaming"> {
  handleStreaming?: (params: {
    conversation: Conversation;
    session: CopilotSession;
    prompt: string;
    model: string;
    reply: FastifyReply;
    req: ResponsesRequest;
    responseId: string;
  }) => Promise<void>;
}

export function createResponsesHandler(
  ctx: AppContext,
  manager: ConversationManager,
  options?: ResponsesHandlerOptions,
) {
  // Map the codex-specific handleStreaming (with responseId) to the base pipeline signature
  const { handleStreaming: customStreaming, ...rest } = options ?? {};
  const pipelineOverrides: BaseHandlerOptions<ResponsesRequest> = customStreaming
    ? {
        ...rest,
        handleStreaming: (params: { conversation: Conversation; session: CopilotSession; prompt: string; model: string; reply: FastifyReply; req: ResponsesRequest }) =>
          customStreaming({ ...params, responseId: genId("resp") }),
      }
    : rest;

  const handle = runHandlerPipeline<ResponsesRequest>(ctx, manager, {
    sendError,

    extractSystemMessage: (req) => req.instructions ?? extractInstructions(req.input),

    formatPrompt: (req, conversation, isReuse) => {
      const slicedInput = isReuse && Array.isArray(req.input)
        ? req.input.slice(conversation.sentMessageCount)
        : req.input;
      return formatResponsesPrompt(slicedInput);
    },

    messageCount: (req) => Array.isArray(req.input) ? req.input.length : 1,

    stream: (session, prompt, model, reply, deps) => {
      const responseId = genId("resp");
      return handleResponsesStreaming(session, prompt, model, reply, responseId, deps.logger, deps.stats);
    },
  }, pipelineOverrides);

  return async function handleResponses(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const parseResult = ResponsesRequestSchema.safeParse(request.body);
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
