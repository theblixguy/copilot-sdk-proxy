import type { FastifyRequest, FastifyReply } from "fastify";
import type { CopilotSession } from "@github/copilot-sdk";
import type { AppContext } from "#context.js";
import type {
  Conversation,
  ConversationManager,
} from "#conversation-manager.js";
import { ResponsesRequestSchema } from "#providers/codex/schemas.js";
import { genId } from "#providers/codex/schemas.js";
import type { ResponsesRequest } from "#providers/codex/schemas.js";
import {
  formatResponsesPrompt,
  extractInstructions,
} from "#providers/codex/prompt.js";
import { handleResponsesStreaming } from "#providers/codex/streaming.js";
import {
  sendOpenAIError as sendError,
  validateRequest,
} from "#providers/shared/errors.js";
import {
  runHandlerPipeline,
  type BaseHandlerOptions,
} from "#providers/shared/handler-core.js";

export interface ResponsesHandlerOptions extends Omit<
  BaseHandlerOptions<ResponsesRequest>,
  "handleStreaming"
> {
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
  const pipelineOverrides: BaseHandlerOptions<ResponsesRequest> =
    customStreaming
      ? {
          ...rest,
          handleStreaming: (params: {
            conversation: Conversation;
            session: CopilotSession;
            prompt: string;
            model: string;
            reply: FastifyReply;
            req: ResponsesRequest;
          }) => customStreaming({ ...params, responseId: genId("resp") }),
        }
      : rest;

  const handle = runHandlerPipeline<ResponsesRequest>(
    ctx,
    manager,
    {
      sendError,

      extractSystemMessage: (req) =>
        req.instructions ?? extractInstructions(req.input),

      formatPrompt: (req, conversation, isReuse) => {
        const slicedInput =
          isReuse && Array.isArray(req.input)
            ? req.input.slice(conversation.sentMessageCount)
            : req.input;
        return formatResponsesPrompt(slicedInput);
      },

      messageCount: (req) => (Array.isArray(req.input) ? req.input.length : 1),

      stream: (session, prompt, model, reply, logger, stats) =>
        handleResponsesStreaming(
          session,
          prompt,
          model,
          reply,
          genId("resp"),
          logger,
          stats,
        ),
    },
    pipelineOverrides,
  );

  return async function handleResponses(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const data = validateRequest(
      ResponsesRequestSchema,
      request.body,
      reply,
      sendError,
      ctx.logger,
    );
    if (!data) return;
    await handle(data, reply);
  };
}
