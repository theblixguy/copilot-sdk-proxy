import { describe, it, expect } from "vitest";
import {
  AnthropicRequestSchema,
  extractAnthropicSystem,
} from "#providers/claude/schemas.js";

describe("AnthropicRequestSchema", () => {
  const validRequest = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello" }],
  };

  it("accepts a valid minimal request", () => {
    const result = AnthropicRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it("rejects missing model", () => {
    const { model: _model, ...rest } = validRequest;
    expect(AnthropicRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty model string", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      model: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing max_tokens", () => {
    const { max_tokens: _maxTokens, ...rest } = validRequest;
    expect(AnthropicRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-positive max_tokens", () => {
    expect(
      AnthropicRequestSchema.safeParse({
        ...validRequest,
        max_tokens: 0,
      }).success,
    ).toBe(false);
    expect(
      AnthropicRequestSchema.safeParse({
        ...validRequest,
        max_tokens: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects empty messages array", () => {
    expect(
      AnthropicRequestSchema.safeParse({
        ...validRequest,
        messages: [],
      }).success,
    ).toBe(false);
  });

  it("rejects missing messages", () => {
    const { messages: _messages, ...rest } = validRequest;
    expect(AnthropicRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("accepts string content shorthand", () => {
    const result = AnthropicRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it("accepts array content with text blocks", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts array content with tool_use blocks", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_01",
              name: "get_weather",
              input: { location: "SF" },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const block = result.data.messages[0]!.content;
      expect(block).toEqual([
        {
          type: "tool_use",
          id: "toolu_01",
          name: "get_weather",
          input: { location: "SF" },
        },
      ]);
    }
  });

  it("accepts array content with tool_result blocks (string content)", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_01",
              content: "Sunny, 72°F",
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts array content with tool_result blocks (TextBlock[] content)", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_02",
              content: [{ type: "text", text: "Result text" }],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts mixed content blocks in a single message", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Let me check that for you." },
            {
              type: "tool_use",
              id: "toolu_01",
              name: "get_weather",
              input: { location: "SF" },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages[0]!.content).toHaveLength(2);
    }
  });

  it("accepts unknown content block types and filters them out", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Let me consider..." },
            { type: "text", text: "Here is my answer." },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const blocks = result.data.messages[0]!.content;
      expect(blocks).toHaveLength(1);
      expect(blocks).toEqual([{ type: "text", text: "Here is my answer." }]);
    }
  });

  it("accepts a message where all blocks are unknown", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "hmm" },
            { type: "server_tool_use", id: "st_01", name: "web_search" },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages[0]!.content).toHaveLength(0);
    }
  });

  it("accepts system as string", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      system: "You are a helpful assistant.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts system as TextBlock array", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      system: [{ type: "text", text: "You are a helpful assistant." }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts stream: true", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      stream: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(true);
  });

  it("accepts stream: false", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      stream: false,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
      stop_sequences: ["Human:"],
      metadata: { user_id: "test" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts tools array", () => {
    const result = AnthropicRequestSchema.safeParse({
      ...validRequest,
      tools: [
        {
          name: "get_weather",
          description: "Get the weather",
          input_schema: {
            type: "object",
            properties: { location: { type: "string" } },
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("extractAnthropicSystem", () => {
  it("returns undefined for undefined", () => {
    expect(extractAnthropicSystem(undefined)).toBeUndefined();
  });

  it("returns string as-is", () => {
    expect(extractAnthropicSystem("You are helpful.")).toBe("You are helpful.");
  });

  it("joins TextBlock array with double newline", () => {
    const blocks = [
      { type: "text" as const, text: "System rule 1." },
      { type: "text" as const, text: "System rule 2." },
    ];
    expect(extractAnthropicSystem(blocks)).toBe(
      "System rule 1.\n\nSystem rule 2.",
    );
  });

  it("returns undefined for empty TextBlock array", () => {
    expect(extractAnthropicSystem([])).toBeUndefined();
  });

  it("handles single TextBlock", () => {
    const blocks = [{ type: "text" as const, text: "Only rule." }];
    expect(extractAnthropicSystem(blocks)).toBe("Only rule.");
  });
});
