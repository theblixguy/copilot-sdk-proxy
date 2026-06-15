import type {
  AnthropicMessage,
  ContentBlock,
} from "#providers/claude/schemas.js";

function extractToolResultText(
  content: string | { type: "text"; text: string }[] | undefined,
): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content.map((b) => b.text).join("");
}

function speakerLabel(role: AnthropicMessage["role"]): string {
  switch (role) {
    case "user":
      return "User";
    case "system":
      return "System";
    case "assistant":
      return "Assistant";
    default:
      return role satisfies never;
  }
}

function formatBlocks(
  blocks: ContentBlock[],
  role: AnthropicMessage["role"],
  parts: string[],
): void {
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        if (!block.text) break;
        parts.push(`[${speakerLabel(role)}]: ${block.text}`);
        break;

      case "tool_use":
        parts.push(
          `[Assistant called tool ${block.name} with args: ${JSON.stringify(block.input)}]`,
        );
        break;

      case "tool_result": {
        const text = extractToolResultText(block.content);
        parts.push(`[Tool result for ${block.tool_use_id}]: ${text}`);
        break;
      }
      default:
        throw block satisfies never;
    }
  }
}

// The Copilot SDK expects a single flat prompt string, so we convert the
// structured Anthropic messages into that format.
export function formatAnthropicPrompt(messages: AnthropicMessage[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      parts.push(`[${speakerLabel(msg.role)}]: ${msg.content}`);
    } else {
      formatBlocks(msg.content, msg.role, parts);
    }
  }

  return parts.join("\n\n");
}
