import { describe, it, expect } from "vitest";
import { nextSeq, startResponseStream, ResponsesProtocol } from "../src/providers/codex/streaming.js";
import type { SeqCounter } from "../src/providers/codex/streaming.js";

function mockReply(): { reply: Parameters<typeof startResponseStream>[0]; written: string[] } {
  const written: string[] = [];
  const reply = {
    raw: {
      writeHead: () => {},
      write: (chunk: string) => { written.push(chunk); },
    },
  } as unknown as Parameters<typeof startResponseStream>[0];
  return { reply, written };
}

function parseSSEData(chunk: string): Record<string, unknown> {
  const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(dataLine!.replace("data: ", "")) as Record<string, unknown>;
}

describe("nextSeq", () => {
  it("increments and returns previous value", () => {
    const counter: SeqCounter = { value: 0 };
    expect(nextSeq(counter)).toBe(0);
    expect(nextSeq(counter)).toBe(1);
    expect(nextSeq(counter)).toBe(2);
    expect(counter.value).toBe(3);
  });
});

describe("startResponseStream", () => {
  it("returns seq starting at 2 (after created + in_progress events)", () => {
    const { reply } = mockReply();
    const { seq } = startResponseStream(reply, "resp_1", "gpt-4o");
    expect(seq.value).toBe(2);
  });

  it("returns createdAt as a unix timestamp", () => {
    const { reply } = mockReply();
    const { createdAt } = startResponseStream(reply, "resp_1", "gpt-4o");
    const now = Math.floor(Date.now() / 1000);
    expect(Math.abs(createdAt - now)).toBeLessThanOrEqual(1);
  });

  it("emits response.created and response.in_progress events", () => {
    const { reply, written } = mockReply();
    startResponseStream(reply, "resp_1", "gpt-4o");
    expect(written).toHaveLength(2);
    expect(written[0]).toContain("event: response.created");
    expect(written[1]).toContain("event: response.in_progress");
  });

  it("uses same created_at in both initial events", () => {
    const { reply, written } = mockReply();
    startResponseStream(reply, "resp_1", "gpt-4o");
    const created = parseSSEData(written[0]!) as { response: { created_at: number } };
    const inProgress = parseSSEData(written[1]!) as { response: { created_at: number } };
    expect(created.response.created_at).toBe(inProgress.response.created_at);
  });
});

describe("ResponsesProtocol", () => {
  it("uses same created_at in completed envelope as startResponseStream", () => {
    const { reply, written } = mockReply();
    const { seq, createdAt } = startResponseStream(reply, "resp_1", "gpt-4o");
    const protocol = new ResponsesProtocol("resp_1", "gpt-4o", seq, createdAt);

    protocol.flushDeltas(reply, ["hello"]);
    protocol.sendCompleted(reply);

    const completedChunk = written.find((c) => c.includes("event: response.completed"))!;
    const completedData = parseSSEData(completedChunk) as { response: { created_at: number } };
    const createdChunk = written.find((c) => c.includes("event: response.created"))!;
    const createdData = parseSSEData(createdChunk) as { response: { created_at: number } };

    expect(completedData.response.created_at).toBe(createdData.response.created_at);
  });

  it("uses same created_at in failed envelope as startResponseStream", () => {
    const { reply, written } = mockReply();
    const { seq, createdAt } = startResponseStream(reply, "resp_1", "gpt-4o");
    const protocol = new ResponsesProtocol("resp_1", "gpt-4o", seq, createdAt);

    protocol.sendFailed(reply);

    const failedChunk = written.find((c) => c.includes("event: response.failed"))!;
    const failedData = parseSSEData(failedChunk) as { response: { created_at: number } };
    const createdChunk = written.find((c) => c.includes("event: response.created"))!;
    const createdData = parseSSEData(createdChunk) as { response: { created_at: number } };

    expect(failedData.response.created_at).toBe(createdData.response.created_at);
  });

  it("accumulates text deltas and includes them in completed output", () => {
    const { reply, written } = mockReply();
    const { seq, createdAt } = startResponseStream(reply, "resp_1", "gpt-4o");
    const protocol = new ResponsesProtocol("resp_1", "gpt-4o", seq, createdAt);

    protocol.flushDeltas(reply, ["hello", " world"]);
    protocol.sendCompleted(reply);

    const completedChunk = written.find((c) => c.includes("event: response.completed"))!;
    const data = parseSSEData(completedChunk) as { response: { output: { content: { text: string }[] }[] } };
    expect(data.response.output[0]!.content[0]!.text).toBe("hello world");
  });

  it("assigns incrementing sequence_number to every event", () => {
    const { reply, written } = mockReply();
    const { seq, createdAt } = startResponseStream(reply, "resp_1", "gpt-4o");
    const protocol = new ResponsesProtocol("resp_1", "gpt-4o", seq, createdAt);

    protocol.flushDeltas(reply, ["hi"]);
    protocol.sendCompleted(reply);

    const seqNumbers = written.map((c) => (parseSSEData(c) as { sequence_number: number }).sequence_number);
    for (let i = 1; i < seqNumbers.length; i++) {
      expect(seqNumbers[i]).toBe(seqNumbers[i - 1]! + 1);
    }
  });
});
