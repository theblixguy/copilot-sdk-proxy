import { extractContentText, type Message } from "#providers/openai/schemas.js";

// System/developer messages are skipped because they're passed separately via
// SessionConfig.systemMessage.
export function formatPrompt(messages: Message[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    const content = extractContentText(msg.content);

    switch (msg.role) {
      case "system":
      case "developer":
        continue;

      case "user":
        parts.push(`[User]: ${content}`);
        break;

      case "assistant":
        if (content) {
          parts.push(`[Assistant]: ${content}`);
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const call =
              "function" in tc
                ? { name: tc.function.name, args: tc.function.arguments }
                : { name: tc.custom.name, args: tc.custom.input };
            parts.push(
              `[Assistant called tool ${call.name} with args: ${call.args}]`,
            );
          }
        }
        break;

      case "tool":
      case "function":
        parts.push(
          `[Tool result for ${msg.tool_call_id ?? msg.name ?? "unknown"}]: ${content}`,
        );
        break;

      case undefined:
        break;

      default:
        throw msg.role satisfies never;
    }
  }

  return parts.join("\n\n");
}
