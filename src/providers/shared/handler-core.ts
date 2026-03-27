import type { FastifyReply } from "fastify";
import type { SessionConfig, CopilotSession } from "@github/copilot-sdk";
import type { AppContext } from "#/context.js";
import type {
  Conversation,
  ConversationManager,
} from "#/conversation-manager.js";
import type { Logger } from "#/logger.js";
import type { Stats } from "#/stats.js";
import type { SessionConfigOptions } from "#/providers/shared/session-config.js";
import {
  normalizeModelId,
  resolveModelForSession,
} from "#/providers/shared/model-resolver.js";
import { createSessionConfig } from "#/providers/shared/session-config.js";

export interface BaseHandlerOptions<TReq> {
  beforeHandler?: (req: TReq, reply: FastifyReply) => Promise<boolean>;
  onConversationReady?: (
    conversation: Conversation,
    req: TReq,
    isReuse: boolean,
  ) => void;
  transformPrompt?: (prompt: string) => string;
  createSessionConfig?: (
    baseOptions: SessionConfigOptions,
    conversation: Conversation,
    req: TReq,
  ) => SessionConfig;
  handleStreaming?: (params: {
    conversation: Conversation;
    session: CopilotSession;
    prompt: string;
    model: string;
    reply: FastifyReply;
    req: TReq;
  }) => Promise<void>;
}

export interface HandlerPipeline<TReq> extends BaseHandlerOptions<TReq> {
  sendError: (
    reply: FastifyReply,
    status: number,
    type: "invalid_request_error" | "api_error",
    message: string,
  ) => void;

  extractSystemMessage: (req: TReq) => string | undefined;

  formatPrompt: (
    req: TReq,
    conversation: Conversation,
    isReuse: boolean,
  ) => string;

  messageCount: (req: TReq) => number;

  stream: (
    session: CopilotSession,
    prompt: string,
    model: string,
    reply: FastifyReply,
    logger: Logger,
    stats: Stats,
  ) => Promise<boolean>;
}

export function runHandlerPipeline<
  TReq extends { model: string; stream?: boolean | undefined },
>(
  ctx: AppContext,
  manager: ConversationManager,
  corePipeline: HandlerPipeline<TReq>,
  overrides?: BaseHandlerOptions<TReq>,
) {
  const pipeline: HandlerPipeline<TReq> = overrides
    ? { ...corePipeline, ...overrides }
    : corePipeline;
  const { service, logger, config, stats } = ctx;

  return async function handler(req: TReq, reply: FastifyReply): Promise<void> {
    stats.recordRequest();

    if (req.stream === false) {
      pipeline.sendError(
        reply,
        400,
        "invalid_request_error",
        "Only streaming responses are supported (stream must be true or omitted)",
      );
      return;
    }

    if (pipeline.beforeHandler) {
      const handled = await pipeline.beforeHandler(req, reply);
      if (handled) return;
    }

    const { conversation, isReuse } = manager.findForNewRequest();
    conversation.sessionActive = true;

    logger.info(
      isReuse
        ? `Reusing primary conversation ${conversation.id}`
        : `New conversation ${conversation.id}`,
    );

    if (
      isReuse &&
      conversation.session &&
      conversation.model &&
      normalizeModelId(conversation.model) !== normalizeModelId(req.model)
    ) {
      const resolved = await resolveModelForSession(
        service,
        req.model,
        config,
        logger,
      );
      if (resolved.ok) {
        try {
          await conversation.session.setModel(resolved.model);
          logger.info(
            `Switched model: "${conversation.model}" → "${resolved.model}"`,
          );
          conversation.model = resolved.model;
        } catch (err) {
          logger.warn(
            `Failed to switch model to "${resolved.model}", continuing with "${conversation.model}":`,
            err,
          );
        }
      } else {
        logger.warn(`Cannot switch model: ${resolved.error}`);
      }
    }

    if (pipeline.onConversationReady) {
      pipeline.onConversationReady(conversation, req, isReuse);
    }

    let prompt: string;
    try {
      prompt = pipeline.formatPrompt(req, conversation, isReuse);
      if (pipeline.transformPrompt) {
        prompt = pipeline.transformPrompt(prompt);
      }
    } catch (err) {
      pipeline.sendError(
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

    logger.debug(
      `Prompt (${isReuse ? "incremental" : "full"}): ${String(prompt.length)} chars`,
    );

    if (!isReuse) {
      const systemMessage = pipeline.extractSystemMessage(req);

      logger.debug(
        `System message length: ${String(systemMessage?.length ?? 0)} chars`,
      );

      const resolved = await resolveModelForSession(
        service,
        req.model,
        config,
        logger,
      );
      if (!resolved.ok) {
        pipeline.sendError(reply, 400, "invalid_request_error", resolved.error);
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
        provider: ctx.provider,
      };
      const sessionConfig = pipeline.createSessionConfig
        ? pipeline.createSessionConfig(baseOptions, conversation, req)
        : createSessionConfig(baseOptions);

      try {
        conversation.session = await service.createSession(sessionConfig);
        stats.recordSession();
      } catch (err) {
        logger.error("Creating session failed:", err);
        stats.recordError();
        pipeline.sendError(reply, 500, "api_error", "Failed to create session");
        manager.remove(conversation.id);
        return;
      }
    }

    if (!conversation.session) {
      logger.error("Primary conversation has no session, clearing");
      manager.clearPrimary();
      stats.recordError();
      pipeline.sendError(reply, 500, "api_error", "Session lost, please retry");
      return;
    }

    try {
      if (pipeline.handleStreaming) {
        await pipeline.handleStreaming({
          conversation,
          session: conversation.session,
          prompt,
          model: req.model,
          reply,
          req,
        });
      } else {
        logger.info(`Streaming response for conversation ${conversation.id}`);
        const healthy = await pipeline.stream(
          conversation.session,
          prompt,
          req.model,
          reply,
          logger,
          stats,
        );
        if (healthy) {
          conversation.sentMessageCount = pipeline.messageCount(req);
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
      if (conversation.isPrimary) {
        manager.clearPrimary();
      }
      if (!reply.sent) {
        pipeline.sendError(
          reply,
          500,
          "api_error",
          err instanceof Error ? err.message : "Internal error",
        );
      }
    } finally {
      conversation.sessionActive = false;
    }
  };
}
