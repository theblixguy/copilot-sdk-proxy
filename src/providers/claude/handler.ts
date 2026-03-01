import type { FastifyRequest, FastifyReply } from "fastify";
import type { SessionConfig } from "@github/copilot-sdk";
import type { AppContext } from "../../context.js";
import type { Conversation, ConversationManager } from "../../conversation-manager.js";
import type { SessionConfigOptions } from "../shared/session-config.js";
import {
  AnthropicMessagesRequestSchema,
  extractAnthropicSystem,
} from "./schemas.js";
import type { AnthropicMessagesRequest } from "./schemas.js";
import { formatAnthropicPrompt } from "./prompt.js";
import { normalizeModelId, resolveModelForSession } from "../shared/model-resolver.js";
import { createSessionConfig } from "../shared/session-config.js";
import { handleAnthropicStreaming } from "./streaming.js";
import { sendAnthropicError as sendError } from "../shared/errors.js";

export interface MessagesHandlerOptions {
  beforeHandler?: (
    req: AnthropicMessagesRequest,
    reply: FastifyReply,
  ) => Promise<boolean>;

  onConversationReady?: (
    conversation: Conversation,
    req: AnthropicMessagesRequest,
    isReuse: boolean,
  ) => void;

  transformPrompt?: (prompt: string) => string;

  createSessionConfig?: (
    baseOptions: SessionConfigOptions,
    conversation: Conversation,
    req: AnthropicMessagesRequest,
  ) => SessionConfig;

  handleStreaming?: (params: {
    conversation: Conversation;
    session: CopilotSession;
    prompt: string;
    model: string;
    reply: FastifyReply;
    req: AnthropicMessagesRequest;
  }) => Promise<void>;
}

type CopilotSession = NonNullable<Conversation["session"]>;

export function createMessagesHandler(
  { service, logger, config, stats }: AppContext,
  manager: ConversationManager,
  options?: MessagesHandlerOptions,
) {
  return async function handleMessages(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    stats.recordRequest();

    const parseResult = AnthropicMessagesRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      const message = firstIssue?.message ?? "Invalid request body";
      logger.warn(`Schema validation failed: ${message} (path: ${firstIssue?.path?.join(".") ?? "root"})`);
      sendError(reply, 400, "invalid_request_error", message);
      return;
    }
    const req = parseResult.data;

    if (req.stream === false) {
      sendError(reply, 400, "invalid_request_error", "Only streaming responses are supported (stream must be true or omitted)");
      return;
    }

    if (options?.beforeHandler) {
      const handled = await options.beforeHandler(req, reply);
      if (handled) return;
    }

    const { conversation, isReuse } = manager.findForNewRequest();
    conversation.sessionActive = true;

    logger.info(
      isReuse
        ? `Reusing primary conversation ${conversation.id}`
        : `New conversation ${conversation.id}`,
    );

    // SDK doesn't support switching models mid-session (github/copilot-sdk#409)
    if (isReuse && conversation.model && normalizeModelId(conversation.model) !== normalizeModelId(req.model)) {
      logger.warn(
        `Model mismatch: session uses "${conversation.model}" but request sent "${req.model}" (SDK does not support mid-session model switching)`,
      );
    }

    if (options?.onConversationReady) {
      options.onConversationReady(conversation, req, isReuse);
    }

    let prompt: string;
    try {
      prompt = formatAnthropicPrompt(req.messages.slice(conversation.sentMessageCount));
      if (options?.transformPrompt) {
        prompt = options.transformPrompt(prompt);
      }
    } catch (err) {
      sendError(
        reply,
        400,
        "invalid_request_error",
        err instanceof Error ? err.message : String(err),
      );
      if (isReuse) {
        conversation.sessionActive = false;
      } else {
        manager.remove(conversation.id);
      }
      return;
    }

    logger.debug(`Prompt (${isReuse ? "incremental" : "full"}): ${String(prompt.length)} chars`);

    if (!isReuse) {
      const systemMessage = extractAnthropicSystem(req.system);

      logger.debug(`System message length: ${String(systemMessage?.length ?? 0)} chars`);

      const resolved = await resolveModelForSession(service, req.model, config, logger);
      if (!resolved.ok) {
        sendError(reply, 400, "invalid_request_error", resolved.error);
        manager.remove(conversation.id);
        return;
      }
      const { model: copilotModel, supportsReasoningEffort } = resolved;

      conversation.model = copilotModel;

      const baseOptions: SessionConfigOptions = {
        model: copilotModel,
        systemMessage,
        logger,
        config,
        supportsReasoningEffort,
        cwd: service.cwd,
      };
      const sessionConfig = options?.createSessionConfig
        ? options.createSessionConfig(baseOptions, conversation, req)
        : createSessionConfig(baseOptions);

      try {
        conversation.session = await service.createSession(sessionConfig);
        stats.recordSession();
      } catch (err) {
        logger.error("Creating session failed:", err);
        stats.recordError();
        sendError(reply, 500, "api_error", "Failed to create session");
        manager.remove(conversation.id);
        return;
      }
    }

    if (!conversation.session) {
      logger.error("Primary conversation has no session, clearing");
      manager.clearPrimary();
      stats.recordError();
      sendError(reply, 500, "api_error", "Session lost, please retry");
      return;
    }

    try {
      if (options?.handleStreaming) {
        await options.handleStreaming({
          conversation,
          session: conversation.session,
          prompt,
          model: req.model,
          reply,
          req,
        });
      } else {
        logger.info(`Streaming response for conversation ${conversation.id}`);
        const healthy = await handleAnthropicStreaming(conversation.session, prompt, req.model, reply, logger, stats);
        conversation.sessionActive = false;
        if (healthy) {
          conversation.sentMessageCount = req.messages.length;
        } else {
          conversation.hadError = true;
          if (conversation.isPrimary) {
            manager.clearPrimary();
          }
        }
      }
    } catch (err) {
      logger.error("Request failed:", err);
      stats.recordError();
      conversation.sessionActive = false;
      if (conversation.isPrimary) {
        manager.clearPrimary();
      }
      if (!reply.sent) {
        sendError(
          reply,
          500,
          "api_error",
          err instanceof Error ? err.message : "Internal error",
        );
      }
    }
  };
}
