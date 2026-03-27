import { describe, it, expect } from "vitest";
import {
  sendOpenAIError,
  sendAnthropicError,
} from "#/providers/shared/errors.js";

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

describe("sendOpenAIError", () => {
  it("sends error with OpenAI format", () => {
    const { reply, sent } = mockReply();
    sendOpenAIError(reply, 400, "invalid_request_error", "Bad request");
    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({
      error: { message: "Bad request", type: "invalid_request_error" },
    });
  });

  it("sends 500 api_error", () => {
    const { reply, sent } = mockReply();
    sendOpenAIError(reply, 500, "api_error", "Server error");
    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({
      error: { message: "Server error", type: "api_error" },
    });
  });
});

describe("sendAnthropicError", () => {
  it("sends error with Anthropic format", () => {
    const { reply, sent } = mockReply();
    sendAnthropicError(reply, 400, "invalid_request_error", "Bad request");
    expect(sent.status).toBe(400);
    expect(sent.body).toEqual({
      type: "error",
      error: { type: "invalid_request_error", message: "Bad request" },
    });
  });

  it("sends 500 api_error", () => {
    const { reply, sent } = mockReply();
    sendAnthropicError(reply, 500, "api_error", "Server error");
    expect(sent.status).toBe(500);
    expect(sent.body).toEqual({
      type: "error",
      error: { type: "api_error", message: "Server error" },
    });
  });
});
