import type { FastifyReply } from "fastify";
import type { CopilotSession } from "@github/copilot-sdk";
import type { Logger } from "../../logger.js";
import type { Stats } from "../../stats.js";
import { formatCompaction, recordUsageEvent } from "./streaming-utils.js";

// The core handles session events and serializes them through the protocol.
// No tool bridge logic here, the SDK handles tools natively.
export interface StreamProtocol {
  flushDeltas(reply: FastifyReply, deltas: string[]): void;
  sendCompleted(reply: FastifyReply): void;
  sendFailed(reply: FastifyReply): void;
  teardown(): void;
}

export function runSessionStreaming(
  session: CopilotSession,
  prompt: string,
  reply: FastifyReply,
  protocol: StreamProtocol,
  logger: Logger,
  stats: Stats,
): Promise<boolean> {
  let pendingDeltas: string[] = [];
  let sessionDone = false;
  const toolNames = new Map<string, string>();

  function flushToProtocol(): void {
    if (pendingDeltas.length === 0) return;
    protocol.flushDeltas(reply, pendingDeltas);
    pendingDeltas = [];
  }

  const { promise, resolve } = Promise.withResolvers<boolean>();

  let deltaCount = 0;

  const unsubscribe = session.on((event) => {
    if (event.type === "tool.execution_start") {
      const d = event.data;
      toolNames.set(d.toolCallId, d.toolName);
      logger.debug(`Running ${d.toolName} (id=${d.toolCallId}, args=${JSON.stringify(d.arguments)})`);
      return;
    }
    if (event.type === "tool.execution_complete") {
      const d = event.data;
      const name = toolNames.get(d.toolCallId) ?? d.toolCallId;
      toolNames.delete(d.toolCallId);
      const detail = d.success
        ? JSON.stringify(d.result?.content)
        : d.error?.message ?? "failed";
      logger.debug(`${name} done (success=${String(d.success)}, ${detail})`);
      return;
    }

    switch (event.type) {
      case "assistant.message_delta":
        if (event.data.deltaContent) {
          deltaCount++;
          pendingDeltas.push(event.data.deltaContent);
        }
        break;

      case "assistant.message":
        flushToProtocol();
        break;

      case "session.idle": {
        logger.info(`Done, wrapping up stream (${String(deltaCount)} deltas received)`);
        sessionDone = true;
        flushToProtocol();
        protocol.sendCompleted(reply);
        protocol.teardown();
        reply.raw.end();
        unsubscribe();
        resolve(true);
        break;
      }

      case "session.compaction_start":
        logger.info("Compacting context...");
        break;

      case "session.compaction_complete":
        logger.info(`Context compacted: ${formatCompaction(event.data)}`);
        break;

      case "session.error": {
        logger.error(`Session error: ${event.data.message}`);
        sessionDone = true;
        protocol.sendFailed(reply);
        protocol.teardown();
        reply.raw.end();
        unsubscribe();
        resolve(false);
        break;
      }

      case "assistant.usage":
        recordUsageEvent(stats, logger, event.data);
        break;

      default:
        logger.debug(`Unhandled event: ${event.type}, data=${JSON.stringify(event.data)}`);
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
