import type { FastifyReply } from "fastify";
import type { CopilotSession } from "@github/copilot-sdk";
import type { Logger } from "../../logger.js";
import type { Stats } from "../../stats.js";
import type {
  ResponseObject,
  MessageOutputItem,
  OutputItem,
} from "./schemas.js";
import { currentTimestamp, genId } from "./schemas.js";
import { SSE_HEADERS, sendSSEEvent as sendEvent } from "../shared/streaming-utils.js";
import type { StreamProtocol } from "../shared/streaming-core.js";
import { runSessionStreaming } from "../shared/streaming-core.js";

export interface SeqCounter {
  value: number;
}

export function nextSeq(counter: SeqCounter): number {
  return counter.value++;
}

export interface ResponseStreamState {
  seq: SeqCounter;
  createdAt: number;
}

export function startResponseStream(
  reply: FastifyReply,
  responseId: string,
  model: string,
): ResponseStreamState {
  const seq: SeqCounter = { value: 0 };
  const createdAt = currentTimestamp();
  reply.raw.writeHead(200, SSE_HEADERS);

  const response: ResponseObject = {
    id: responseId,
    object: "response",
    created_at: createdAt,
    model,
    status: "in_progress",
    output: [],
  };

  sendEvent(reply, "response.created", { response }, nextSeq(seq));
  sendEvent(reply, "response.in_progress", { response }, nextSeq(seq));
  return { seq, createdAt };
}

export class ResponsesProtocol implements StreamProtocol {
  protected messageItem: MessageOutputItem | null = null;
  protected messageStarted = false;
  protected outputIndex = 0;
  protected readonly outputItems: OutputItem[] = [];
  protected readonly accumulatedText: string[] = [];

  protected readonly responseId: string;
  protected readonly model: string;
  protected readonly seq: SeqCounter;
  protected readonly createdAt: number;

  constructor(responseId: string, model: string, seq: SeqCounter, createdAt: number) {
    this.responseId = responseId;
    this.model = model;
    this.seq = seq;
    this.createdAt = createdAt;
  }

  protected ensureMessageItem(r: FastifyReply): void {
    if (!this.messageStarted) {
      this.messageItem = {
        type: "message",
        id: genId("msg"),
        status: "in_progress",
        role: "assistant",
        content: [],
      };
      sendEvent(r, "response.output_item.added", {
        output_index: this.outputIndex,
        item: this.messageItem,
      }, nextSeq(this.seq));
      sendEvent(r, "response.content_part.added", {
        item_id: this.messageItem.id,
        output_index: this.outputIndex,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      }, nextSeq(this.seq));
      this.messageStarted = true;
    }
  }

  protected closeMessageItem(r: FastifyReply): void {
    if (!this.messageStarted || !this.messageItem) return;

    const fullText = this.accumulatedText.join("");
    sendEvent(r, "response.output_text.done", {
      item_id: this.messageItem.id,
      output_index: this.outputIndex,
      content_index: 0,
      text: fullText,
    }, nextSeq(this.seq));
    sendEvent(r, "response.content_part.done", {
      item_id: this.messageItem.id,
      output_index: this.outputIndex,
      content_index: 0,
      part: { type: "output_text", text: fullText, annotations: [] },
    }, nextSeq(this.seq));

    this.messageItem.status = "completed";
    this.messageItem.content = [{ type: "output_text", text: fullText, annotations: [] }];
    this.outputItems.push(this.messageItem);
    sendEvent(r, "response.output_item.done", {
      output_index: this.outputIndex,
      item: this.messageItem,
    }, nextSeq(this.seq));

    this.outputIndex++;
    this.messageStarted = false;
    this.messageItem = null;
  }

  protected sendResponseEnvelope(r: FastifyReply, status: ResponseObject["status"]): void {
    const response: ResponseObject = {
      id: this.responseId,
      object: "response",
      created_at: this.createdAt,
      model: this.model,
      status,
      output: this.outputItems,
    };
    sendEvent(r, `response.${status}`, { response }, nextSeq(this.seq));
  }

  flushDeltas(r: FastifyReply, deltas: string[]): void {
    this.ensureMessageItem(r);
    if (!this.messageItem) return;
    for (const text of deltas) {
      sendEvent(r, "response.output_text.delta", {
        item_id: this.messageItem.id,
        output_index: this.outputIndex,
        content_index: 0,
        delta: text,
      }, nextSeq(this.seq));
      this.accumulatedText.push(text);
    }
  }

  sendCompleted(r: FastifyReply): void {
    if (!this.messageStarted) this.ensureMessageItem(r);
    this.closeMessageItem(r);
    this.sendResponseEnvelope(r, "completed");
  }

  sendFailed(r: FastifyReply): void {
    if (this.messageStarted) this.closeMessageItem(r);
    this.sendResponseEnvelope(r, "failed");
  }

  teardown(): void {}
}

export function handleResponsesStreaming(
  session: CopilotSession,
  prompt: string,
  model: string,
  reply: FastifyReply,
  responseId: string,
  logger: Logger,
  stats: Stats,
): Promise<boolean> {
  const { seq, createdAt } = startResponseStream(reply, responseId, model);
  const protocol = new ResponsesProtocol(responseId, model, seq, createdAt);
  return runSessionStreaming(session, prompt, reply, protocol, logger, stats);
}
