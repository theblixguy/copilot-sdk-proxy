import type {
  InputItem,
  FunctionCallOutput,
} from "#providers/codex/schemas.js";

function extractContent(content: string | Record<string, unknown>[]): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (c): c is Record<string, unknown> & { text: string } =>
        typeof c["text"] === "string",
    )
    .map((c) => c.text)
    .join("");
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
          continue;
        case "user":
          parts.push(`[User]: ${content}`);
          break;
        case "assistant":
          if (content) parts.push(`[Assistant]: ${content}`);
          break;
        default:
          item.role satisfies never;
      }
    } else if (item.type === "function_call") {
      parts.push(
        `[Assistant called tool ${item.name} with args: ${item.arguments}]`,
      );
    } else {
      parts.push(`[Tool result for ${item.call_id}]: ${item.output}`);
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
