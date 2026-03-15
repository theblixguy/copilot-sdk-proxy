import { describe, it, expect, vi } from "vitest";
import type { SessionEvent } from "@github/copilot-sdk";
import { createCommonEventHandler } from "../../../src/providers/shared/streaming-core.js";
import type { StreamProtocol } from "../../../src/providers/shared/streaming-core.js";
import { Stats } from "../../../src/stats.js";
import { Logger } from "../../../src/logger.js";

const BASE = {
  id: "e1",
  timestamp: new Date().toISOString(),
  parentId: null,
} as const;

function makeEvent<T extends SessionEvent["type"]>(
  type: T,
  data: Extract<SessionEvent, { type: T }>["data"],
): SessionEvent {
  return { ...BASE, type, data } as unknown as SessionEvent;
}

function setup() {
  const written: string[][] = [];
  const reasoningWritten: string[][] = [];
  const reply = {} as never;

  const protocol: StreamProtocol = {
    flushDeltas(_r, deltas) {
      written.push([...deltas]);
    },
    flushReasoningDeltas(_r, deltas) {
      reasoningWritten.push([...deltas]);
    },
    reasoningComplete: vi.fn(),
    sendCompleted: vi.fn(),
    sendFailed: vi.fn(),
    teardown: vi.fn(),
  };

  const logger = new Logger("error");
  const stats = new Stats();
  const handler = createCommonEventHandler(
    protocol,
    () => reply,
    logger,
    stats,
  );

  return { handler, protocol, written, reasoningWritten, stats };
}

describe("createCommonEventHandler", () => {
  it("handles message_delta and tracks deltaCount", () => {
    const { handler } = setup();

    const handled = handler.handle(
      makeEvent("assistant.message_delta", {
        messageId: "m1",
        deltaContent: "hi",
      }),
    );

    expect(handled).toBe(true);
    expect(handler.deltaCount).toBe(1);
  });

  it("accumulates and flushes text deltas", () => {
    const { handler, written } = setup();

    handler.handle(
      makeEvent("assistant.message_delta", {
        messageId: "m1",
        deltaContent: "a",
      }),
    );
    handler.handle(
      makeEvent("assistant.message_delta", {
        messageId: "m1",
        deltaContent: "b",
      }),
    );
    handler.flushDeltas();

    expect(written).toEqual([["a", "b"]]);
    expect(handler.deltaCount).toBe(2);
  });

  it("flushDeltas is a no-op when buffer is empty", () => {
    const { handler, written } = setup();

    handler.flushDeltas();

    expect(written).toEqual([]);
  });

  it("accumulates and flushes reasoning deltas", () => {
    const { handler, reasoningWritten } = setup();

    handler.handle(
      makeEvent("assistant.reasoning_delta", {
        reasoningId: "r1",
        deltaContent: "think",
      }),
    );
    handler.flushReasoningDeltas();

    expect(reasoningWritten).toEqual([["think"]]);
  });

  it("calls reasoningComplete on assistant.reasoning event", () => {
    let called = false;
    const written: string[][] = [];
    const protocol: StreamProtocol = {
      flushDeltas(_r, deltas) {
        written.push([...deltas]);
      },
      flushReasoningDeltas: vi.fn(),
      reasoningComplete() {
        called = true;
      },
      sendCompleted: vi.fn(),
      sendFailed: vi.fn(),
      teardown: vi.fn(),
    };
    const reply = {} as never;
    const handler = createCommonEventHandler(
      protocol,
      () => reply,
      new Logger("error"),
      new Stats(),
    );

    handler.handle(
      makeEvent("assistant.reasoning_delta", {
        reasoningId: "r1",
        deltaContent: "hmm",
      }),
    );
    handler.handle(
      makeEvent("assistant.reasoning", { reasoningId: "r1", content: "hmm" }),
    );

    expect(called).toBe(true);
  });

  it("handles tool execution start and complete", () => {
    const { handler } = setup();

    const start = handler.handle(
      makeEvent("tool.execution_start", {
        toolCallId: "tc1",
        toolName: "read_file",
        arguments: { path: "/foo" },
      }),
    );

    const complete = handler.handle(
      makeEvent("tool.execution_complete", {
        toolCallId: "tc1",
        success: true,
        result: { content: "file contents" },
      }),
    );

    expect(start).toBe(true);
    expect(complete).toBe(true);
  });

  it("handles compaction events", () => {
    const { handler } = setup();

    expect(handler.handle(makeEvent("session.compaction_start", {}))).toBe(
      true,
    );
    expect(
      handler.handle(
        makeEvent("session.compaction_complete", {
          success: true,
          preCompactionTokens: 1000,
          postCompactionTokens: 500,
        }),
      ),
    ).toBe(true);
  });

  it("handles usage events and records stats", () => {
    const { handler, stats } = setup();

    const handled = handler.handle(
      makeEvent("assistant.usage", {
        inputTokens: 100,
        outputTokens: 50,
        model: "gpt-4o",
      }),
    );

    expect(handled).toBe(true);
    const snapshot = stats.snapshot();
    expect(snapshot.inputTokens).toBe(100);
    expect(snapshot.outputTokens).toBe(50);
  });

  it("returns false for unhandled events", () => {
    const { handler } = setup();

    const handled = handler.handle(makeEvent("session.idle", {}));

    expect(handled).toBe(false);
  });

  it("skips empty deltaContent", () => {
    const { handler, written } = setup();

    handler.handle(
      makeEvent("assistant.message_delta", {
        messageId: "m1",
        deltaContent: "",
      }),
    );
    handler.flushDeltas();

    expect(handler.deltaCount).toBe(0);
    expect(written).toEqual([]);
  });

  it("does not flush when reply is null", () => {
    let flushed = false;
    const protocol: StreamProtocol = {
      flushDeltas() {
        flushed = true;
      },
      sendCompleted: vi.fn(),
      sendFailed: vi.fn(),
      teardown: vi.fn(),
    };
    const handler = createCommonEventHandler(
      protocol,
      () => null,
      new Logger("error"),
      new Stats(),
    );

    handler.handle(
      makeEvent("assistant.message_delta", {
        messageId: "m1",
        deltaContent: "data",
      }),
    );
    handler.flushDeltas();

    expect(flushed).toBe(false);
  });
});
