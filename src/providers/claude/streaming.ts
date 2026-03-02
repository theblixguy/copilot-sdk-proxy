import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { CopilotSession } from "@github/copilot-sdk";
import type { Logger } from "../../logger.js";
import type { Stats } from "../../stats.js";
import { SSE_HEADERS, sendSSEEvent as sendEvent } from "../shared/streaming-utils.js";
import type {
  MessageStartEvent,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  ContentBlockStopEvent,
  MessageDeltaEvent,
  MessageStopEvent,
} from "./schemas.js";
import type { StreamProtocol } from "../shared/streaming-core.js";
import { runSessionStreaming } from "../shared/streaming-core.js";

export function startReply(reply: FastifyReply, model: string): void {
  reply.raw.writeHead(200, SSE_HEADERS);

  const messageStart: MessageStartEvent = {
    type: "message_start",
    message: {
      id: `msg_${randomUUID()}`,
      type: "message",
      role: "assistant",
      content: [],
      model,
      stop_reason: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  };
  sendEvent(reply, "message_start", messageStart);
}

export class AnthropicProtocol implements StreamProtocol {
  protected textBlockStarted = false;

  protected ensureTextBlock(r: FastifyReply): void {
    if (!this.textBlockStarted) {
      const blockStart: ContentBlockStartEvent = {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      };
      sendEvent(r, "content_block_start", blockStart);
      this.textBlockStarted = true;
    }
  }

  protected sendBlockStop(r: FastifyReply): void {
    sendEvent(r, "content_block_stop", {
      type: "content_block_stop",
      index: 0,
    } satisfies ContentBlockStopEvent);
  }

  protected sendEpilogue(r: FastifyReply, stopReason: string): void {
    const messageDelta: MessageDeltaEvent = {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 0 },
    };
    sendEvent(r, "message_delta", messageDelta);
    sendEvent(r, "message_stop", { type: "message_stop" } satisfies MessageStopEvent);
  }

  flushDeltas(r: FastifyReply, deltas: string[]): void {
    this.ensureTextBlock(r);
    for (const text of deltas) {
      const delta: ContentBlockDeltaEvent = {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      };
      sendEvent(r, "content_block_delta", delta);
    }
  }

  sendCompleted(r: FastifyReply): void {
    this.ensureTextBlock(r);
    this.sendBlockStop(r);
    this.sendEpilogue(r, "end_turn");
  }

  sendFailed(r: FastifyReply): void {
    if (this.textBlockStarted) this.sendBlockStop(r);
    this.sendEpilogue(r, "end_turn");
  }

  teardown(): void {}
}

export function handleAnthropicStreaming(
  session: CopilotSession,
  prompt: string,
  model: string,
  reply: FastifyReply,
  logger: Logger,
  stats: Stats,
): Promise<boolean> {
  startReply(reply, model);
  const protocol = new AnthropicProtocol();
  return runSessionStreaming(session, prompt, reply, protocol, logger, stats);
}
