import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { CopilotSession } from "@github/copilot-sdk";
import type { Logger } from "#/logger.js";
import type { Stats } from "#/stats.js";
import {
  SSE_HEADERS,
  sendSSEEvent as sendEvent,
} from "#/providers/shared/streaming-utils.js";
import type {
  MessageStartEvent,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  ContentBlockStopEvent,
  MessageDeltaEvent,
  MessageStopEvent,
} from "#/providers/claude/schemas.js";
import type { StreamProtocol } from "#/providers/shared/streaming-core.js";
import { runSessionStreaming } from "#/providers/shared/streaming-core.js";

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
  protected thinkingBlockStarted = false;
  protected textBlockStarted = false;
  protected nextBlockIndex = 0;
  private textBlockIndex = 0;
  private thinkingBlockIndex = 0;

  closeOpenBlocks(r: FastifyReply): number {
    this.closeTextBlock(r);
    if (this.thinkingBlockStarted) {
      sendEvent(r, "content_block_stop", {
        type: "content_block_stop",
        index: this.thinkingBlockIndex,
      } satisfies ContentBlockStopEvent);
      this.nextBlockIndex = this.thinkingBlockIndex + 1;
      this.thinkingBlockStarted = false;
    }
    return this.nextBlockIndex;
  }

  reset(): void {
    this.textBlockStarted = false;
    this.thinkingBlockStarted = false;
    this.nextBlockIndex = 0;
    this.textBlockIndex = 0;
    this.thinkingBlockIndex = 0;
  }

  protected closeTextBlock(r: FastifyReply): void {
    if (this.textBlockStarted) {
      sendEvent(r, "content_block_stop", {
        type: "content_block_stop",
        index: this.textBlockIndex,
      } satisfies ContentBlockStopEvent);
      this.nextBlockIndex = this.textBlockIndex + 1;
      this.textBlockStarted = false;
    }
  }

  protected ensureThinkingBlock(r: FastifyReply): void {
    if (!this.thinkingBlockStarted) {
      this.closeTextBlock(r);
      this.thinkingBlockIndex = this.nextBlockIndex;
      const blockStart: ContentBlockStartEvent = {
        type: "content_block_start",
        index: this.thinkingBlockIndex,
        content_block: { type: "thinking", thinking: "" },
      };
      sendEvent(r, "content_block_start", blockStart);
      this.thinkingBlockStarted = true;
    }
  }

  protected ensureTextBlock(r: FastifyReply): void {
    if (!this.textBlockStarted) {
      this.textBlockIndex = this.nextBlockIndex;
      const blockStart: ContentBlockStartEvent = {
        type: "content_block_start",
        index: this.textBlockIndex,
        content_block: { type: "text", text: "" },
      };
      sendEvent(r, "content_block_start", blockStart);
      this.textBlockStarted = true;
    }
  }

  protected sendEpilogue(r: FastifyReply, stopReason: string): void {
    const messageDelta: MessageDeltaEvent = {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 0 },
    };
    sendEvent(r, "message_delta", messageDelta);
    sendEvent(r, "message_stop", {
      type: "message_stop",
    } satisfies MessageStopEvent);
  }

  flushReasoningDeltas(r: FastifyReply, deltas: string[]): void {
    this.ensureThinkingBlock(r);
    for (const thinking of deltas) {
      const delta: ContentBlockDeltaEvent = {
        type: "content_block_delta",
        index: this.thinkingBlockIndex,
        delta: { type: "thinking_delta", thinking },
      };
      sendEvent(r, "content_block_delta", delta);
    }
  }

  reasoningComplete(r: FastifyReply): void {
    if (this.thinkingBlockStarted) {
      sendEvent(r, "content_block_stop", {
        type: "content_block_stop",
        index: this.thinkingBlockIndex,
      } satisfies ContentBlockStopEvent);
      this.nextBlockIndex = this.thinkingBlockIndex + 1;
      this.thinkingBlockStarted = false;
    }
  }

  flushDeltas(r: FastifyReply, deltas: string[]): void {
    this.ensureTextBlock(r);
    for (const text of deltas) {
      const delta: ContentBlockDeltaEvent = {
        type: "content_block_delta",
        index: this.textBlockIndex,
        delta: { type: "text_delta", text },
      };
      sendEvent(r, "content_block_delta", delta);
    }
  }

  sendCompleted(r: FastifyReply): void {
    this.ensureTextBlock(r);
    sendEvent(r, "content_block_stop", {
      type: "content_block_stop",
      index: this.textBlockIndex,
    } satisfies ContentBlockStopEvent);
    this.sendEpilogue(r, "end_turn");
  }

  sendFailed(r: FastifyReply): void {
    if (this.textBlockStarted) {
      sendEvent(r, "content_block_stop", {
        type: "content_block_stop",
        index: this.textBlockIndex,
      } satisfies ContentBlockStopEvent);
    }
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
