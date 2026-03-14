import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { CopilotSession } from "@github/copilot-sdk";
import type { Logger } from "../../logger.js";
import type { Stats } from "../../stats.js";
import { SSE_HEADERS } from "../shared/streaming-utils.js";
import { currentTimestamp, type Message, type ChatCompletionChunk } from "./schemas.js";
import type { StreamProtocol } from "../shared/streaming-core.js";
import { runSessionStreaming } from "../shared/streaming-core.js";

export class OpenAIProtocol implements StreamProtocol {
  private readonly completionId: string;
  private readonly model: string;

  constructor(completionId: string, model: string) {
    this.completionId = completionId;
    this.model = model;
  }

  private sendChunk(r: FastifyReply, delta: Partial<Message>, finishReason: string | null): void {
    const chunk = {
      id: this.completionId,
      object: "chat.completion.chunk" as const,
      created: currentTimestamp(),
      model: this.model,
      choices: [
        {
          index: 0,
          delta,
          finish_reason: finishReason,
        },
      ],
    } satisfies ChatCompletionChunk;
    r.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  flushDeltas(r: FastifyReply, deltas: string[]): void {
    for (const text of deltas) {
      this.sendChunk(r, { content: text }, null);
    }
  }

  sendCompleted(r: FastifyReply): void {
    this.sendChunk(r, {}, "stop");
    r.raw.write("data: [DONE]\n\n");
  }

  sendFailed(_reply: FastifyReply): void {
    // OpenAI format does not send a special failure frame
  }

  teardown(): void {}
}

export function handleStreaming(
  session: CopilotSession,
  prompt: string,
  model: string,
  reply: FastifyReply,
  logger: Logger,
  stats: Stats,
): Promise<boolean> {
  reply.raw.writeHead(200, SSE_HEADERS);

  const completionId = `chatcmpl-${randomUUID()}`;
  const protocol = new OpenAIProtocol(completionId, model);

  const initialChunk = {
    id: completionId,
    object: "chat.completion.chunk" as const,
    created: currentTimestamp(),
    model,
    choices: [{ index: 0, delta: { role: "assistant" } as Partial<Message>, finish_reason: null }],
  } satisfies ChatCompletionChunk;
  reply.raw.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

  return runSessionStreaming(session, prompt, reply, protocol, logger, stats);
}
