import { describe, it, expect } from "vitest";
import * as exports from "../src/index.js";

describe("index barrel exports", () => {
  it("exports CopilotService", () => {
    expect(exports.CopilotService).toBeDefined();
  });

  it("exports createServer", () => {
    expect(typeof exports.createServer).toBe("function");
  });

  it("exports Logger and LEVEL_PRIORITY", () => {
    expect(exports.Logger).toBeDefined();
    expect(exports.LEVEL_PRIORITY).toBeDefined();
    expect(exports.LEVEL_PRIORITY.error).toBeLessThan(exports.LEVEL_PRIORITY.info);
  });

  it("exports Stats", () => {
    expect(exports.Stats).toBeDefined();
  });

  it("exports DefaultConversationManager", () => {
    expect(exports.DefaultConversationManager).toBeDefined();
  });

  it("exports providers and ProviderName", () => {
    expect(exports.providers).toBeDefined();
    expect(exports.providers.openai).toBeDefined();
    expect(exports.providers.claude).toBeDefined();
    expect(exports.providers.codex).toBeDefined();
  });

  it("exports streaming utilities", () => {
    expect(typeof exports.runSessionStreaming).toBe("function");
    expect(typeof exports.sendSSEEvent).toBe("function");
    expect(typeof exports.currentTimestamp).toBe("function");
    expect(exports.SSE_HEADERS).toBeDefined();
  });

  it("exports handler pipeline", () => {
    expect(typeof exports.runHandlerPipeline).toBe("function");
  });

  it("exports session config and model resolution", () => {
    expect(typeof exports.createSessionConfig).toBe("function");
    expect(typeof exports.normalizeModelId).toBe("function");
    expect(typeof exports.resolveModel).toBe("function");
    expect(typeof exports.resolveModelForSession).toBe("function");
  });

  it("exports error helpers", () => {
    expect(typeof exports.sendOpenAIError).toBe("function");
    expect(typeof exports.sendAnthropicError).toBe("function");
  });

  it("exports config utilities", () => {
    expect(typeof exports.loadConfig).toBe("function");
    expect(typeof exports.resolveConfigPath).toBe("function");
  });

  it("exports UI utilities", () => {
    expect(typeof exports.bold).toBe("function");
    expect(typeof exports.dim).toBe("function");
    expect(typeof exports.createSpinner).toBe("function");
    expect(typeof exports.printBanner).toBe("function");
    expect(typeof exports.printUsageSummary).toBe("function");
  });

  it("exports CLI validators", () => {
    expect(typeof exports.parsePort).toBe("function");
    expect(typeof exports.parseLogLevel).toBe("function");
    expect(typeof exports.parseProvider).toBe("function");
    expect(typeof exports.parseIdleTimeout).toBe("function");
    expect(typeof exports.isProviderName).toBe("function");
  });

  it("exports OpenAI schemas and handlers", () => {
    expect(exports.ChatCompletionRequestSchema).toBeDefined();
    expect(typeof exports.extractContentText).toBe("function");
    expect(typeof exports.extractSystemMessages).toBe("function");
    expect(typeof exports.createModelsHandler).toBe("function");
    expect(typeof exports.createCompletionsHandler).toBe("function");
    expect(typeof exports.handleOpenAIStreaming).toBe("function");
    expect(exports.OpenAIProtocol).toBeDefined();
  });

  it("exports Claude schemas and handlers", () => {
    expect(exports.AnthropicMessagesRequestSchema).toBeDefined();
    expect(typeof exports.extractAnthropicSystem).toBe("function");
    expect(typeof exports.createCountTokensHandler).toBe("function");
    expect(typeof exports.createMessagesHandler).toBe("function");
    expect(typeof exports.handleAnthropicStreaming).toBe("function");
    expect(exports.AnthropicProtocol).toBeDefined();
  });

  it("exports Codex schemas and handlers", () => {
    expect(exports.ResponsesRequestSchema).toBeDefined();
    expect(typeof exports.createResponsesHandler).toBe("function");
    expect(typeof exports.handleResponsesStreaming).toBe("function");
    expect(exports.ResponsesProtocol).toBeDefined();
    expect(typeof exports.filterFunctionTools).toBe("function");
    expect(typeof exports.genId).toBe("function");
  });

  it("exports individual providers", () => {
    expect(exports.openaiProvider).toBeDefined();
    expect(exports.claudeProvider).toBeDefined();
    expect(exports.codexProvider).toBeDefined();
  });
});
