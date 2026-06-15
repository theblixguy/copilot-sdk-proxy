import type {
  InputItem,
  FunctionCallOutput,
} from "#providers/codex/schemas.js";

function extractContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    if (
      part &&
      typeof part === "object" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      text += part.text;
    }
  }
  return text;
}

export function formatResponsesPrompt(input: string | InputItem[]): string {
  if (typeof input === "string") {
    return `[User]: ${input}`;
  }

  const parts: string[] = [];

  for (const item of input) {
    if ("role" in item) {
      const content = extractContent(item.content);
      switch (item.role) {
        case "system":
        case "developer":
          break;
        case "user":
          parts.push(`[User]: ${content}`);
          break;
        case "assistant":
          if (content) parts.push(`[Assistant]: ${content}`);
          break;
      }
    } else if (item.type === "function_call") {
      parts.push(
        `[Assistant called tool ${String(item.name)} with args: ${String(item.arguments)}]`,
      );
    } else if (item.type === "function_call_output") {
      parts.push(
        `[Tool result for ${String(item.call_id)}]: ${String(item.output)}`,
      );
    }
  }

  return parts.join("\n\n");
}

export function extractInstructions(
  input: string | InputItem[],
): string | undefined {
  if (typeof input === "string") return undefined;

  const parts: string[] = [];
  for (const item of input) {
    if (
      "role" in item &&
      (item.role === "system" || item.role === "developer")
    ) {
      const text = extractContent(item.content);
      if (text) parts.push(text);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function extractFunctionCallOutputs(
  input: string | InputItem[],
): FunctionCallOutput[] {
  if (typeof input === "string") return [];
  return input.filter(
    (item): item is FunctionCallOutput =>
      "type" in item && item.type === "function_call_output",
  );
}
