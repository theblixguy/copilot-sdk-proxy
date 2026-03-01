import { describe, it, expect } from "vitest";
import { openaiProvider } from "../src/providers/openai/provider.js";
import { claudeProvider } from "../src/providers/claude/provider.js";
import { codexProvider } from "../src/providers/codex/provider.js";
import { providers } from "../src/providers/index.js";

describe("provider registry", () => {
  it("exports all three providers", () => {
    expect(providers.openai).toBe(openaiProvider);
    expect(providers.claude).toBe(claudeProvider);
    expect(providers.codex).toBe(codexProvider);
  });
});

describe("openaiProvider", () => {
  it("has correct name and routes", () => {
    expect(openaiProvider.name).toBe("OpenAI");
    expect(openaiProvider.routes).toContain("GET /v1/models");
    expect(openaiProvider.routes).toContain("POST /v1/chat/completions");
  });

  it("has a register function", () => {
    expect(typeof openaiProvider.register).toBe("function");
  });
});

describe("claudeProvider", () => {
  it("has correct name and routes", () => {
    expect(claudeProvider.name).toBe("Claude");
    expect(claudeProvider.routes).toContain("POST /v1/messages");
    expect(claudeProvider.routes).toContain("POST /v1/messages/count_tokens");
  });

  it("has a register function", () => {
    expect(typeof claudeProvider.register).toBe("function");
  });
});

describe("codexProvider", () => {
  it("has correct name and routes", () => {
    expect(codexProvider.name).toBe("Codex");
    expect(codexProvider.routes).toContain("POST /v1/responses");
  });

  it("has a register function", () => {
    expect(typeof codexProvider.register).toBe("function");
  });
});
