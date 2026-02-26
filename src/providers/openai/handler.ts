import type { FastifyRequest, FastifyReply } from "fastify";
import type { AppContext } from "../../context.js";
import type { ConversationManager } from "../../conversation-manager.js";
import { ChatCompletionRequestSchema, extractContentText } from "./schemas.js";
import { formatPrompt } from "./prompt.js";
import { createSessionConfig } from "../shared/session-config.js";
import { handleStreaming } from "./streaming.js";
import { sendOpenAIError as sendError } from "../shared/errors.js";

export interface HandlerOptions {
  transformPrompt?: (prompt: string) => string;
}

export function createCompletionsHandler({ service, logger, config, stats }: AppContext, manager: ConversationManager, options?: HandlerOptions) {
  return async function handleCompletions(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    stats.recordRequest();

    const parseResult = ChatCompletionRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      sendError(reply, 400, "invalid_request_error", firstIssue?.message ?? "Invalid request body");
      return;
    }
    const req = parseResult.data;

    if (req.stream === false) {
      sendError(reply, 400, "invalid_request_error", "Only streaming responses are supported (stream must be true or omitted)");
      return;
    }

    const messages = req.messages;

    const { conversation, isReuse } = manager.findForNewRequest();
    conversation.sessionActive = true;

    logger.info(
      isReuse
        ? `Reusing primary conversation ${conversation.id}`
        : `New conversation ${conversation.id}`,
    );

    const systemParts: string[] = [];
    for (const msg of messages) {
      if (msg.role === "system" || msg.role === "developer") {
        try {
          systemParts.push(extractContentText(msg.content));
        } catch (err) {
          sendError(reply, 400, "invalid_request_error", err instanceof Error ? err.message : String(err));
          if (isReuse) {
            conversation.sessionActive = false;
          } else {
            manager.remove(conversation.id);
          }
          return;
        }
      }
    }

    let prompt: string;
    try {
      prompt = formatPrompt(messages.slice(conversation.sentMessageCount));
      if (options?.transformPrompt) {
        prompt = options.transformPrompt(prompt);
      }
    } catch (err) {
      sendError(reply, 400, "invalid_request_error", err instanceof Error ? err.message : String(err));
      if (isReuse) {
        conversation.sessionActive = false;
      } else {
        manager.remove(conversation.id);
      }
      return;
    }

    if (!isReuse) {
      const systemMessage =
        systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

      let supportsReasoningEffort = false;
      if (config.reasoningEffort) {
        try {
          const models = await service.listModels();
          const modelInfo = models.find((m) => m.id === req.model);
          supportsReasoningEffort =
            modelInfo?.capabilities.supports.reasoningEffort ?? false;
          if (!supportsReasoningEffort) {
            logger.debug(
              `Model "${req.model}" does not support reasoning effort, ignoring config`,
            );
          }
        } catch (err) {
          logger.warn("Failed to check model capabilities:", err);
        }
      }

      conversation.model = req.model;

      const sessionConfig = createSessionConfig({
        model: req.model,
        systemMessage,
        logger,
        config,
        supportsReasoningEffort,
        cwd: service.cwd,
      });

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
      logger.info("Streaming response");
      const healthy = await handleStreaming(reply, conversation.session, prompt, req.model, logger, stats);
      conversation.sessionActive = false;
      if (healthy) {
        conversation.sentMessageCount = req.messages.length;
      } else if (conversation.isPrimary) {
        manager.clearPrimary();
      }
    } catch (err) {
      logger.error("Request failed:", err);
      stats.recordError();
      conversation.sessionActive = false;
      if (conversation.isPrimary) {
        manager.clearPrimary();
      }
      if (!reply.sent) {
        sendError(reply, 500, "api_error", err instanceof Error ? err.message : "Internal error");
      }
    }
  };
}
