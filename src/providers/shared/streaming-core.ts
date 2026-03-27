import type { FastifyReply } from "fastify";
import type { CopilotSession, SessionEvent } from "@github/copilot-sdk";
import type { Logger } from "#/logger.js";
import type { Stats } from "#/stats.js";
import {
  formatCompaction,
  recordUsageEvent,
} from "#/providers/shared/streaming-utils.js";

export interface StreamProtocol {
  flushDeltas(reply: FastifyReply, deltas: string[]): void;
  flushReasoningDeltas?(reply: FastifyReply, deltas: string[]): void;
  reasoningComplete?(reply: FastifyReply): void;
  sendCompleted(reply: FastifyReply): void;
  sendFailed(reply: FastifyReply): void;
  teardown(): void;
}

export interface CommonEventHandler {
  /** Returns true if handled, false if the caller should handle it. */
  handle(event: SessionEvent): boolean;
  flushDeltas(): void;
  flushReasoningDeltas(): void;
  readonly deltaCount: number;
}

export function createCommonEventHandler(
  protocol: StreamProtocol,
  getReply: () => FastifyReply | null,
  logger: Logger,
  stats: Stats,
): CommonEventHandler {
  let pendingDeltas: string[] = [];
  let pendingReasoningDeltas: string[] = [];
  let deltaCount = 0;
  const toolNames = new Map<string, string>();

  function flushDeltas(): void {
    if (pendingDeltas.length === 0) return;
    const r = getReply();
    if (!r) return;
    protocol.flushDeltas(r, pendingDeltas);
    pendingDeltas = [];
  }

  function flushReasoningDeltas(): void {
    if (pendingReasoningDeltas.length === 0) return;
    const r = getReply();
    if (!r) return;
    protocol.flushReasoningDeltas?.(r, pendingReasoningDeltas);
    pendingReasoningDeltas = [];
  }

  function handle(event: SessionEvent): boolean {
    switch (event.type) {
      case "tool.execution_start": {
        const d = event.data;
        toolNames.set(d.toolCallId, d.toolName);
        logger.debug(
          `Running ${d.toolName} (id=${d.toolCallId}, args=${JSON.stringify(d.arguments)})`,
        );
        return true;
      }

      case "tool.execution_complete": {
        const d = event.data;
        const name = toolNames.get(d.toolCallId) ?? d.toolCallId;
        toolNames.delete(d.toolCallId);
        const detail = d.success
          ? JSON.stringify(d.result?.content)
          : (d.error?.message ?? "failed");
        logger.debug(`${name} done (success=${String(d.success)}, ${detail})`);
        return true;
      }

      case "assistant.reasoning_delta":
        if (event.data.deltaContent) {
          pendingReasoningDeltas.push(event.data.deltaContent);
        }
        return true;

      case "assistant.reasoning": {
        flushReasoningDeltas();
        const r = getReply();
        if (r) protocol.reasoningComplete?.(r);
        return true;
      }

      case "assistant.message_delta":
        if (event.data.deltaContent) {
          deltaCount++;
          pendingDeltas.push(event.data.deltaContent);
        }
        return true;

      case "session.compaction_start":
        logger.info("Compacting context...");
        return true;

      case "session.compaction_complete":
        logger.info(`Context compacted: ${formatCompaction(event.data)}`);
        return true;

      case "assistant.usage":
        recordUsageEvent(stats, logger, event.data);
        return true;

      default:
        return false;
    }
  }

  return {
    handle,
    flushDeltas,
    flushReasoningDeltas,
    get deltaCount() {
      return deltaCount;
    },
  };
}

export function runSessionStreaming(
  session: CopilotSession,
  prompt: string,
  reply: FastifyReply,
  protocol: StreamProtocol,
  logger: Logger,
  stats: Stats,
): Promise<boolean> {
  const common = createCommonEventHandler(protocol, () => reply, logger, stats);
  let sessionDone = false;

  const { promise, resolve } = Promise.withResolvers<boolean>();

  const unsubscribe = session.on((event) => {
    if (common.handle(event)) return;

    switch (event.type) {
      case "assistant.message":
        common.flushDeltas();
        break;

      case "session.idle":
        logger.info(
          `Done, wrapping up stream (${String(common.deltaCount)} deltas received)`,
        );
        sessionDone = true;
        common.flushDeltas();
        protocol.sendCompleted(reply);
        protocol.teardown();
        reply.raw.end();
        unsubscribe();
        resolve(true);
        break;

      case "session.error":
        logger.error(`Session error: ${event.data.message}`);
        sessionDone = true;
        protocol.sendFailed(reply);
        protocol.teardown();
        reply.raw.end();
        unsubscribe();
        resolve(false);
        break;

      default:
        logger.debug(
          `Unhandled event: ${event.type}, data=${JSON.stringify(event.data)}`,
        );
        break;
    }
  });

  reply.raw.on("close", () => {
    if (!sessionDone) {
      logger.info("Client disconnected, aborting session");
      sessionDone = true;
      protocol.teardown();
      unsubscribe();
      session.abort().catch((err: unknown) => {
        logger.error("Failed to abort session:", err);
      });
      resolve(false);
    }
  });

  session.send({ prompt }).catch((err: unknown) => {
    if (sessionDone) return;
    logger.error("Failed to send prompt:", err);
    sessionDone = true;
    protocol.teardown();
    reply.raw.end();
    unsubscribe();
    resolve(false);
  });

  return promise;
}
