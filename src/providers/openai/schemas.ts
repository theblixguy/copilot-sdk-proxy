import { z } from "zod";
import {
  OpenAIRequestSchema,
  type Message,
} from "llm-schemas/openai/chat-completions";

export { OpenAIRequestSchema };
export type { Message };
export type OpenAIRequest = z.infer<typeof OpenAIRequestSchema>;

export interface Choice {
  index: number;
  message?: Message | undefined;
  delta?: Partial<Message> | undefined;
  finish_reason: string | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Choice[];
  system_fingerprint?: string | undefined;
}

export interface Model {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: "list";
  data: Model[];
}

export { currentTimestamp } from "#providers/shared/streaming-utils.js";

export function extractContentText(content: Message["content"]): string {
  if (content == null) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    throw new Error(
      `invalid content type: expected string or array, got ${typeof content}`,
    );
  }

  let text = "";
  for (const part of content) {
    if (part.type !== "text") {
      throw new Error(`unsupported content type: ${part.type}`);
    }

    if (typeof part.text !== "string") {
      throw new Error("text content part missing required 'text' field");
    }

    text += part.text;
  }

  return text;
}

export function extractSystemMessages(messages: Message[]): string | undefined {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "system" && msg.role !== "developer") continue;
    if (msg.content == null) continue;
    if (typeof msg.content === "string") {
      parts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text" && typeof part.text === "string") {
          parts.push(part.text);
        }
      }
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
