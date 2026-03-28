import {
  AnthropicRequestSchema as BaseAnthropicRequestSchema,
  type AnthropicRequest as BaseAnthropicRequest,
} from "llm-schemas/anthropic";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: string | TextBlock[] | undefined;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface AnthropicToolDefinition {
  name: string;
  description?: string | undefined;
  input_schema: Record<string, unknown>;
}

export interface MessageStartEvent {
  type: "message_start";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    content: [];
    model: string;
    stop_reason: null;
    usage: { input_tokens: number; output_tokens: number };
  };
}

export type TextContentBlock = { type: "text"; text: "" };
export type ThinkingContentBlock = { type: "thinking"; thinking: "" };
export type ToolUseContentBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: TextContentBlock | ThinkingContentBlock | ToolUseContentBlock;
}

export type TextDelta = { type: "text_delta"; text: string };
export type ThinkingDelta = { type: "thinking_delta"; thinking: string };
export type InputJsonDelta = { type: "input_json_delta"; partial_json: string };

export interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: TextDelta | ThinkingDelta | InputJsonDelta;
}

export interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface MessageDeltaEvent {
  type: "message_delta";
  delta: { stop_reason: string; stop_sequence: null };
  usage: { output_tokens: number };
}

export interface MessageStopEvent {
  type: "message_stop";
}

export interface AnthropicErrorResponse {
  type: "error";
  error: {
    type: "invalid_request_error" | "api_error";
    message: string;
  };
}

export interface CountTokensResponse {
  input_tokens: number;
}

const KNOWN_BLOCK_TYPES = new Set(["text", "tool_use", "tool_result"]);

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string | TextBlock[] | undefined;
  tools?: AnthropicToolDefinition[] | undefined;
  stream?: boolean | undefined;
  temperature?: number | undefined;
  top_p?: number | undefined;
  top_k?: number | undefined;
  stop_sequences?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  [key: string]: unknown;
}

// prompt.ts does exhaustive switch on block types, so filter out unknown ones
function filterUnknownBlocks(data: BaseAnthropicRequest): AnthropicRequest {
  return {
    ...data,
    messages: data.messages.map((msg) => ({
      ...msg,
      content:
        typeof msg.content === "string"
          ? msg.content
          : msg.content.filter((b): b is ContentBlock =>
              KNOWN_BLOCK_TYPES.has(b.type),
            ),
    })),
  } satisfies AnthropicRequest;
}

export const AnthropicRequestSchema =
  BaseAnthropicRequestSchema.transform(filterUnknownBlocks);

// The Anthropic API accepts system as a string or an array of text blocks,
// so we flatten it into a single string for the Copilot SDK.
export function extractAnthropicSystem(
  system: string | TextBlock[] | undefined,
): string | undefined {
  if (system == null) return undefined;
  if (typeof system === "string") return system;
  const text = system.map((b) => b.text).join("\n\n");
  return text || undefined;
}
