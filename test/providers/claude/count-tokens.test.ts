import { describe, it, expect } from "vitest";
import { createCountTokensHandler } from "#/providers/claude/count-tokens.js";
import { Logger } from "#/logger.js";

function mockContext() {
  return {
    service: {} as never,
    logger: new Logger("none"),
    config: {} as never,
    port: 8080,
    stats: {} as never,
  };
}

function mockReply() {
  const sent: { status?: number; body?: unknown } = {};
  return {
    reply: {
      status(code: number) {
        sent.status = code;
        return this;
      },
      send(body: unknown) {
        sent.body = body;
      },
    } as never,
    sent,
  };
}

describe("createCountTokensHandler", () => {
  it("returns a handler function", () => {
    const handler = createCountTokensHandler(mockContext());
    expect(typeof handler).toBe("function");
  });

  it("rejects invalid request body", () => {
    const handler = createCountTokensHandler(mockContext());
    const { reply, sent } = mockReply();
    handler({ body: { invalid: true } } as never, reply);
    expect(sent.status).toBe(400);
    expect(sent.body).toHaveProperty("type", "error");
  });

  it("counts tokens for a simple message", () => {
    const handler = createCountTokensHandler(mockContext());
    const { reply, sent } = mockReply();
    handler(
      {
        body: {
          model: "claude-sonnet-4-5-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: "Hello, world!" }],
        },
      } as never,
      reply,
    );
    expect(sent.body).toHaveProperty("input_tokens");
    expect(
      (sent.body as { input_tokens: number }).input_tokens,
    ).toBeGreaterThan(0);
  });

  it("counts tokens with system message", () => {
    const handler = createCountTokensHandler(mockContext());
    const { reply, sent } = mockReply();
    handler(
      {
        body: {
          model: "claude-sonnet-4-5-20250514",
          max_tokens: 1024,
          system: "You are helpful.",
          messages: [{ role: "user", content: "Hi" }],
        },
      } as never,
      reply,
    );
    const tokens = (sent.body as { input_tokens: number }).input_tokens;
    expect(tokens).toBeGreaterThan(0);
  });

  it("counts tokens with tool definitions", () => {
    const handler = createCountTokensHandler(mockContext());
    const { reply, sent } = mockReply();
    handler(
      {
        body: {
          model: "claude-sonnet-4-5-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: "Use a tool" }],
          tools: [
            {
              name: "get_weather",
              description: "Get weather for a location",
              input_schema: { type: "object", properties: {} },
            },
          ],
        },
      } as never,
      reply,
    );
    expect(
      (sent.body as { input_tokens: number }).input_tokens,
    ).toBeGreaterThan(0);
  });

  it("counts tokens with structured content blocks", () => {
    const handler = createCountTokensHandler(mockContext());
    const { reply, sent } = mockReply();
    handler(
      {
        body: {
          model: "claude-sonnet-4-5-20250514",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: "Hello" }],
            },
            {
              role: "assistant",
              content: [
                { type: "text", text: "I'll help." },
                {
                  type: "tool_use",
                  id: "t1",
                  name: "bash",
                  input: { cmd: "ls" },
                },
              ],
            },
            {
              role: "user",
              content: [
                { type: "tool_result", tool_use_id: "t1", content: "file.txt" },
              ],
            },
          ],
        },
      } as never,
      reply,
    );
    expect(
      (sent.body as { input_tokens: number }).input_tokens,
    ).toBeGreaterThan(0);
  });

  it("handles system as array of text blocks", () => {
    const handler = createCountTokensHandler(mockContext());
    const { reply, sent } = mockReply();
    handler(
      {
        body: {
          model: "claude-sonnet-4-5-20250514",
          max_tokens: 1024,
          system: [{ type: "text", text: "You are helpful." }],
          messages: [{ role: "user", content: "Hi" }],
        },
      } as never,
      reply,
    );
    expect(
      (sent.body as { input_tokens: number }).input_tokens,
    ).toBeGreaterThan(0);
  });
});
