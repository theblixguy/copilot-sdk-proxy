import { describe, it, expect } from "vitest";
import {
  ResponsesRequestSchema,
  filterFunctionTools,
  currentTimestamp,
  genId,
} from "#/providers/codex/schemas.js";

describe("ResponsesRequestSchema", () => {
  const validRequest = {
    model: "o3-mini",
    input: "Hello",
  };

  it("accepts a valid minimal request with string input", () => {
    const result = ResponsesRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it("accepts array input with a user message", () => {
    const result = ResponsesRequestSchema.safeParse({
      model: "o3-mini",
      input: [{ role: "user", content: "Hello" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts array input with function_call and function_call_output", () => {
    const result = ResponsesRequestSchema.safeParse({
      model: "o3-mini",
      input: [
        {
          type: "function_call",
          call_id: "call_1",
          name: "search",
          arguments: "{}",
        },
        { type: "function_call_output", call_id: "call_1", output: "result" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing model", () => {
    expect(ResponsesRequestSchema.safeParse({ input: "Hello" }).success).toBe(
      false,
    );
  });

  it("rejects empty model string", () => {
    expect(
      ResponsesRequestSchema.safeParse({ model: "", input: "Hello" }).success,
    ).toBe(false);
  });

  it("rejects missing input", () => {
    expect(ResponsesRequestSchema.safeParse({ model: "o3-mini" }).success).toBe(
      false,
    );
  });

  it("accepts stream: true", () => {
    const result = ResponsesRequestSchema.safeParse({
      ...validRequest,
      stream: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(true);
  });

  it("accepts stream: false", () => {
    const result = ResponsesRequestSchema.safeParse({
      ...validRequest,
      stream: false,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stream).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = ResponsesRequestSchema.safeParse({
      ...validRequest,
      instructions: "Be helpful",
      temperature: 0.5,
      previous_response_id: "resp_abc",
    });
    expect(result.success).toBe(true);
  });

  it("accepts tools array with function tools", () => {
    const result = ResponsesRequestSchema.safeParse({
      ...validRequest,
      tools: [
        {
          type: "function",
          name: "search",
          description: "Search the web",
          parameters: { type: "object", properties: {} },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts tools array with non-function tools", () => {
    const result = ResponsesRequestSchema.safeParse({
      ...validRequest,
      tools: [{ type: "web_search" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts message input with array content", () => {
    const result = ResponsesRequestSchema.safeParse({
      model: "o3-mini",
      input: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("filterFunctionTools", () => {
  it("filters to only function tools", () => {
    const tools = [
      { type: "function", name: "search", description: "Search" },
      { type: "web_search" },
      { type: "function", name: "read", parameters: { type: "object" } },
    ];
    const result = filterFunctionTools(tools);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("search");
    expect(result[1]!.name).toBe("read");
  });

  it("returns empty array when no function tools", () => {
    expect(filterFunctionTools([{ type: "web_search" }])).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterFunctionTools([])).toEqual([]);
  });
});

describe("currentTimestamp", () => {
  it("returns a unix timestamp close to now", () => {
    const ts = currentTimestamp();
    const now = Math.floor(Date.now() / 1000);
    expect(ts).toBeTypeOf("number");
    expect(Math.abs(ts - now)).toBeLessThanOrEqual(1);
  });
});

describe("genId", () => {
  it("generates an id with the given prefix", () => {
    const id = genId("resp");
    expect(id).toMatch(/^resp_[0-9a-f-]+$/);
  });

  it("generates unique ids", () => {
    const a = genId("msg");
    const b = genId("msg");
    expect(a).not.toBe(b);
  });
});
