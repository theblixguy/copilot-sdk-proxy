import { describe, it, expect } from "vitest";
import type { ModelInfo } from "@github/copilot-sdk";
import {
  normalizeModelId,
  resolveModel,
} from "#providers/shared/model-resolver.js";

function model(id: string): ModelInfo {
  return {
    id,
    name: id,
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 200000 },
    },
  };
}

const copilotModels = [
  "claude-haiku-4.5",
  "claude-opus-4.5",
  "claude-sonnet-4",
  "claude-sonnet-4.5",
  "gpt-5",
  "gpt-5.1",
  "o3-mini",
  "o4-mini",
].map(model);

describe("resolveModel", () => {
  it("exact match returns as-is", () => {
    expect(resolveModel("claude-sonnet-4.5", copilotModels)).toEqual({
      ok: true,
      model: "claude-sonnet-4.5",
    });
  });

  it("strips date suffix and normalizes dots", () => {
    expect(resolveModel("claude-sonnet-4-5-20250929", copilotModels)).toEqual({
      ok: true,
      model: "claude-sonnet-4.5",
    });
  });

  it("strips date suffix for model without minor version", () => {
    expect(resolveModel("claude-sonnet-4-20250514", copilotModels)).toEqual({
      ok: true,
      model: "claude-sonnet-4",
    });
  });

  it("normalizes hyphens to dots without date", () => {
    expect(resolveModel("claude-haiku-4-5", copilotModels)).toEqual({
      ok: true,
      model: "claude-haiku-4.5",
    });
  });

  it("falls back to same family when version not available", () => {
    // Opus 4.6 doesn't exist in Copilot, should fall back to 4.5
    expect(resolveModel("claude-opus-4-6", copilotModels)).toEqual({
      ok: true,
      model: "claude-opus-4.5",
    });
  });

  it("falls back to closest in family when multiple candidates", () => {
    // claude-sonnet-4-7 doesn't exist and the family has 4 and 4.5, so
    // "claude-sonnet-4-5" wins because it shares a longer prefix than "claude-sonnet-4"
    expect(resolveModel("claude-sonnet-4-7", copilotModels)).toEqual({
      ok: true,
      model: "claude-sonnet-4.5",
    });
  });

  it("returns ok: false for completely unknown model", () => {
    expect(resolveModel("unknown-model-123", copilotModels)).toEqual({
      ok: false,
    });
  });

  it("returns ok: false for different family with no match", () => {
    expect(resolveModel("claude-mega-5-0", copilotModels)).toEqual({
      ok: false,
    });
  });

  it("handles non-claude models (exact match)", () => {
    expect(resolveModel("gpt-5", copilotModels)).toEqual({
      ok: true,
      model: "gpt-5",
    });
  });

  it("handles date suffix on haiku model", () => {
    expect(resolveModel("claude-haiku-4-5-20251001", copilotModels)).toEqual({
      ok: true,
      model: "claude-haiku-4.5",
    });
  });

  it("handles o-series models (exact match)", () => {
    expect(resolveModel("o3-mini", copilotModels)).toEqual({
      ok: true,
      model: "o3-mini",
    });
  });

  it("falls back within o-series family", () => {
    // o3 isn't available but o3-mini is, and they share the "o" family
    // with o3-mini winning on longest prefix
    expect(resolveModel("o3", copilotModels)).toEqual({
      ok: true,
      model: "o3-mini",
    });
  });

  it("returns ok: false for empty models array", () => {
    expect(resolveModel("claude-sonnet-4.5", [])).toEqual({ ok: false });
  });
});

describe("normalizeModelId", () => {
  it("replaces dots with hyphens", () => {
    expect(normalizeModelId("claude-opus-4.6")).toBe("claude-opus-4-6");
  });

  it("strips date suffix", () => {
    expect(normalizeModelId("claude-sonnet-4-5-20250929")).toBe(
      "claude-sonnet-4-5",
    );
  });

  it("strips date suffix and replaces dots", () => {
    expect(normalizeModelId("claude-haiku-4.5-20251001")).toBe(
      "claude-haiku-4-5",
    );
  });

  it("returns already-normalized IDs unchanged", () => {
    expect(normalizeModelId("claude-opus-4-6")).toBe("claude-opus-4-6");
  });

  it("treats SDK and Anthropic model IDs as equal", () => {
    expect(normalizeModelId("claude-opus-4.6")).toBe(
      normalizeModelId("claude-opus-4-6"),
    );
    expect(normalizeModelId("claude-sonnet-4.5")).toBe(
      normalizeModelId("claude-sonnet-4-5"),
    );
  });
});
