import { describe, it, expect } from "vitest";
import { startReply, AnthropicProtocol } from "#/providers/claude/streaming.js";

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
    startReply(reply, "claude-sonnet-4.6");
    expect(state.headWritten).toBe(true);
    expect(written.length).toBe(1);
    const event = parseSSE(written[0]!) as {
      message: { role: string; model: string };
    };
    expect(event.message.role).toBe("assistant");
    expect(event.message.model).toBe("claude-sonnet-4.6");
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
    const messageDelta = parseSSE(after[1]!) as {
      delta: { stop_reason: string };
    };
    expect(messageDelta.delta.stop_reason).toBe("end_turn");
    const messageStop = parseSSE(after[2]!) as { type: string };
    expect(messageStop.type).toBe("message_stop");
  });

  it("sendFailed sends epilogue without block stop when no text block was started", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();
    protocol.sendFailed(reply);
    expect(written.length).toBe(2);
    const messageDelta = parseSSE(written[0]!) as {
      delta: { stop_reason: string };
    };
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

  it("emits thinking block at index 0 and text block at index 1 when reasoning is present", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();

    protocol.flushReasoningDeltas(reply, ["Let me think"]);
    protocol.reasoningComplete(reply);
    protocol.flushDeltas(reply, ["The answer"]);
    protocol.sendCompleted(reply);

    const events = written.map((w) => parseSSE(w) as Record<string, unknown>);

    const thinkingStart = events.find(
      (e) =>
        e.type === "content_block_start" &&
        (e.content_block as Record<string, unknown>).type === "thinking",
    );
    expect(thinkingStart).toBeDefined();
    expect(thinkingStart!.index).toBe(0);

    const thinkingDelta = events.find(
      (e) =>
        e.type === "content_block_delta" &&
        (e.delta as Record<string, unknown>).type === "thinking_delta",
    );
    expect(thinkingDelta).toBeDefined();
    expect((thinkingDelta!.delta as Record<string, unknown>).thinking).toBe(
      "Let me think",
    );

    const textStart = events.find(
      (e) =>
        e.type === "content_block_start" &&
        (e.content_block as Record<string, unknown>).type === "text",
    );
    expect(textStart).toBeDefined();
    expect(textStart!.index).toBe(1);

    const textDelta = events.find(
      (e) =>
        e.type === "content_block_delta" &&
        (e.delta as Record<string, unknown>).type === "text_delta",
    );
    expect(textDelta).toBeDefined();
    expect(textDelta!.index).toBe(1);
  });

  it("uses index 0 for text block when no reasoning is present", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();

    protocol.flushDeltas(reply, ["Hello"]);
    protocol.sendCompleted(reply);

    const events = written.map((w) => parseSSE(w) as Record<string, unknown>);
    const textStart = events.find(
      (e) =>
        e.type === "content_block_start" &&
        (e.content_block as Record<string, unknown>).type === "text",
    );
    expect(textStart).toBeDefined();
    expect(textStart!.index).toBe(0);
  });

  it("handles multi-turn: closes text block before reasoning on next turn", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();

    protocol.flushDeltas(reply, ["turn1"]);
    // Simulate a second turn where reasoning arrives after a tool call
    protocol.flushReasoningDeltas(reply, ["thinking"]);
    protocol.reasoningComplete(reply);
    protocol.flushDeltas(reply, ["turn2"]);
    protocol.sendCompleted(reply);

    const events = written.map((w) => parseSSE(w) as Record<string, unknown>);

    const blockStarts = events.filter((e) => e.type === "content_block_start");
    const indices = blockStarts.map((e) => e.index);
    expect(new Set(indices).size).toBe(indices.length);

    const turn1Text = blockStarts.find(
      (e) =>
        (e.content_block as Record<string, unknown>).type === "text" &&
        e.index === 0,
    );
    const thinkingBlock = blockStarts.find(
      (e) => (e.content_block as Record<string, unknown>).type === "thinking",
    );
    expect(turn1Text).toBeDefined();
    expect(thinkingBlock).toBeDefined();
    expect(thinkingBlock!.index as number).toBeGreaterThan(
      turn1Text!.index as number,
    );
  });

  it("closes thinking block with content_block_stop before text block starts", () => {
    const { reply, written } = mockReply();
    const protocol = new AnthropicProtocol();

    protocol.flushReasoningDeltas(reply, ["think"]);
    protocol.reasoningComplete(reply);
    protocol.flushDeltas(reply, ["answer"]);

    const events = written.map((w) => parseSSE(w) as Record<string, unknown>);
    const thinkingStop = events.find(
      (e) => e.type === "content_block_stop" && e.index === 0,
    );
    const textStart = events.find(
      (e) =>
        e.type === "content_block_start" &&
        (e.content_block as Record<string, unknown>).type === "text",
    );

    expect(thinkingStop).toBeDefined();
    expect(textStart).toBeDefined();

    const thinkingStopIdx = events.indexOf(thinkingStop!);
    const textStartIdx = events.indexOf(textStart!);
    expect(thinkingStopIdx).toBeLessThan(textStartIdx);
  });
});
