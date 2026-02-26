import { describe, it, expect, vi, afterEach } from "vitest";
import { sendSSEEvent, recordUsageEvent, formatCompaction } from "../src/providers/shared/streaming-utils.js";
import { Stats, type UsageData } from "../src/stats.js";
import { Logger } from "../src/logger.js";

function mockReply(): { reply: Parameters<typeof sendSSEEvent>[0]; written: string[] } {
  const written: string[] = [];
  const reply = { raw: { write: (chunk: string) => { written.push(chunk); } } } as unknown as Parameters<typeof sendSSEEvent>[0];
  return { reply, written };
}

describe("sendSSEEvent", () => {
  it("writes SSE event with event line and data", () => {
    const { reply, written } = mockReply();
    sendSSEEvent(reply, "message_start", { message: { id: "1" } });
    expect(written[0]).toMatch(/^event: message_start\ndata: /);
    const parsed = JSON.parse(written[0]!.split("data: ")[1]!.trim());
    expect(parsed.message).toEqual({ id: "1" });
  });

  it("injects type and sequence_number when sequenceNumber is provided", () => {
    const { reply, written } = mockReply();
    sendSSEEvent(reply, "response.created", { response: {} }, 0);
    const parsed = JSON.parse(written[0]!.split("data: ")[1]!.trim());
    expect(parsed.type).toBe("response.created");
    expect(parsed.sequence_number).toBe(0);
  });

  it("does not inject type when sequenceNumber is omitted", () => {
    const { reply, written } = mockReply();
    sendSSEEvent(reply, "content_block_start", { index: 0 });
    const parsed = JSON.parse(written[0]!.split("data: ")[1]!.trim());
    expect(parsed.type).toBeUndefined();
    expect(parsed.sequence_number).toBeUndefined();
  });
});

describe("recordUsageEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records usage on the stats instance", () => {
    const stats = new Stats();
    const logger = new Logger("none");
    const data: UsageData = { model: "gpt-4", inputTokens: 100, outputTokens: 50, cost: 0.05 };

    recordUsageEvent(stats, logger, data);

    const snap = stats.snapshot();
    expect(snap.inputTokens).toBe(100);
    expect(snap.outputTokens).toBe(50);
    expect(snap.totalCost).toBeCloseTo(0.05);
  });

  it("logs a debug message with token counts and cost", () => {
    const stats = new Stats();
    const logger = new Logger("debug");
    const debugSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const data: UsageData = { model: "gpt-4", inputTokens: 200, outputTokens: 75, cost: 0.10 };

    recordUsageEvent(stats, logger, data);

    // eslint-disable-next-line no-control-regex
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
    const output = debugSpy.mock.calls.map((c: unknown[]) => strip(String(c[0]))).join("\n");
    expect(output).toContain("200 in");
    expect(output).toContain("75 out");
    expect(output).toContain("cost=0.1");
  });

  it("handles missing optional fields gracefully", () => {
    const stats = new Stats();
    const logger = new Logger("debug");
    vi.spyOn(console, "log").mockImplementation(() => {});

    recordUsageEvent(stats, logger, { model: "gpt-4" });

    const snap = stats.snapshot();
    expect(snap.inputTokens).toBe(0);
    expect(snap.outputTokens).toBe(0);
    expect(snap.totalCost).toBe(0);
  });
});

describe("formatCompaction", () => {
  it("formats pre and post compaction tokens", () => {
    expect(formatCompaction({ preCompactionTokens: 5000, postCompactionTokens: 2000 }))
      .toBe("5000 to 2000 tokens");
  });

  it("returns unavailable for null input", () => {
    expect(formatCompaction(null)).toBe("compaction data unavailable");
  });

  it("returns unavailable for non-object input", () => {
    expect(formatCompaction("string")).toBe("compaction data unavailable");
  });

  it("returns unavailable when fields are missing", () => {
    expect(formatCompaction({ preCompactionTokens: 100 })).toBe("compaction data unavailable");
    expect(formatCompaction({ postCompactionTokens: 100 })).toBe("compaction data unavailable");
  });
});
