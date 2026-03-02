import { describe, it, expect } from "vitest";
import { startReply, AnthropicProtocol } from "../src/providers/claude/streaming.js";

function mockReply() {
  const written: string[] = [];
  const state = { headWritten: false };
  return {
    reply: {
      raw: {
        writeHead(_status: number, _headers: Record<string, string>) {
          state.headWritten = true;
        },
        write(chunk: string) {
          written.push(chunk);
        },
        end() {},
      },
    } as never,
    written,
    state,
  };
}

function parseSSE(raw: string): unknown {
  const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
  return dataLine ? JSON.parse(dataLine.slice(6)) : null;
}

describe("startReply", () => {
  it("writes HTTP headers and message_start event", () => {
    const { reply, written, state } = mockReply();
    startReply(reply, "claude-sonnet-4-5-20250514");
    expect(state.headWritten).toBe(true);
    expect(written.length).toBe(1);
    const event = parseSSE(written[0]!) as { message: { role: string; model: string } };
    expect(event.message.role).toBe("assistant");
    expect(event.message.model).toBe("claude-sonnet-4-5-20250514");
  });
});

describe("AnthropicProtocol", () => {
  it("flushes deltas as content_block_delta events", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();
    protocol.flushDeltas(reply, ["Hello", " world"]);
    expect(written.length).toBe(3);
    const blockStart = parseSSE(written[0]!) as { type: string };
    expect(blockStart.type).toBe("content_block_start");
    const delta1 = parseSSE(written[1]!) as { delta: { text: string } };
    expect(delta1.delta.text).toBe("Hello");
    const delta2 = parseSSE(written[2]!) as { delta: { text: string } };
    expect(delta2.delta.text).toBe(" world");
  });

  it("sendCompleted sends block stop, message delta, and message stop", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();
    protocol.flushDeltas(reply, ["Hello"]);
    const beforeCount = written.length;
    protocol.sendCompleted(reply);
    const after = written.slice(beforeCount);
    expect(after.length).toBe(3);
    const blockStop = parseSSE(after[0]!) as { type: string };
    expect(blockStop.type).toBe("content_block_stop");
    const messageDelta = parseSSE(after[1]!) as { delta: { stop_reason: string } };
    expect(messageDelta.delta.stop_reason).toBe("end_turn");
    const messageStop = parseSSE(after[2]!) as { type: string };
    expect(messageStop.type).toBe("message_stop");
  });

  it("sendFailed sends epilogue without block stop when no text block was started", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();
    protocol.sendFailed(reply);
    expect(written.length).toBe(2);
    const messageDelta = parseSSE(written[0]!) as { delta: { stop_reason: string } };
    expect(messageDelta.delta.stop_reason).toBe("end_turn");
  });

  it("sendFailed sends block stop when text block was started", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();
    protocol.flushDeltas(reply, ["partial"]);
    const beforeCount = written.length;
    protocol.sendFailed(reply);
    const after = written.slice(beforeCount);
    expect(after.length).toBe(3);
    const blockStop = parseSSE(after[0]!) as { type: string };
    expect(blockStop.type).toBe("content_block_stop");
  });

  it("does not duplicate text block start on multiple flushes", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();
    protocol.flushDeltas(reply, ["a"]);
    protocol.flushDeltas(reply, ["b"]);
    expect(written.length).toBe(3);
  });
});
