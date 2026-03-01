import { describe, it, expect } from "vitest";
import { createSessionConfig } from "../src/providers/shared/session-config.js";
import { Logger } from "../src/logger.js";
import type { ServerConfig } from "../src/config.js";

function defaultConfig(overrides?: Partial<ServerConfig>): ServerConfig {
  return {
    mcpServers: {},
    allowedCliTools: [],
    bodyLimit: 10 * 1024 * 1024,
    autoApprovePermissions: true,
    ...overrides,
  };
}

describe("createSessionConfig", () => {
  const logger = new Logger("none");

  it("returns a config with the given model", () => {
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config: defaultConfig(),
      supportsReasoningEffort: false,
    });
    expect(result.model).toBe("gpt-4");
    expect(result.streaming).toBe(true);
  });

  it("includes system message when provided", () => {
    const result = createSessionConfig({
      model: "gpt-4",
      systemMessage: "You are a helpful assistant.",
      logger,
      config: defaultConfig(),
      supportsReasoningEffort: false,
    });
    expect(result.systemMessage).toEqual({
      mode: "replace",
      content: "You are a helpful assistant.",
    });
  });

  it("omits system message when not provided", () => {
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config: defaultConfig(),
      supportsReasoningEffort: false,
    });
    expect(result.systemMessage).toBeUndefined();
  });

  it("uses provided cwd as working directory", () => {
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config: defaultConfig(),
      supportsReasoningEffort: false,
      cwd: "/custom/path",
    });
    expect(result.workingDirectory).toBe("/custom/path");
  });

  it("includes MCP servers from config", () => {
    const config = defaultConfig({
      mcpServers: {
        test: {
          type: "local",
          command: "node",
          args: ["server.js"],
        } as never,
      },
    });
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config,
      supportsReasoningEffort: false,
    });
    expect(result.mcpServers).toBeDefined();
    expect(result.mcpServers!.test).toBeDefined();
  });

  it("includes reasoning effort when config specifies and model supports it", () => {
    const config = defaultConfig({ reasoningEffort: "high" });
    const result = createSessionConfig({
      model: "o1",
      logger,
      config,
      supportsReasoningEffort: true,
    });
    expect(result.reasoningEffort).toBe("high");
  });

  it("omits reasoning effort when model does not support it", () => {
    const config = defaultConfig({ reasoningEffort: "high" });
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config,
      supportsReasoningEffort: false,
    });
    expect(result.reasoningEffort).toBeUndefined();
  });

  it("includes available tools when config has allowed CLI tools", () => {
    const config = defaultConfig({ allowedCliTools: ["glob", "grep"] });
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config,
      supportsReasoningEffort: false,
    });
    expect(result.availableTools).toEqual(["glob", "grep"]);
  });

  it("omits available tools when CLI tools list is empty", () => {
    const config = defaultConfig({ allowedCliTools: [] });
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config,
      supportsReasoningEffort: false,
    });
    expect(result.availableTools).toBeUndefined();
  });

  it("onPermissionRequest approves when autoApprovePermissions is true", async () => {
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config: defaultConfig({ autoApprovePermissions: true }),
      supportsReasoningEffort: false,
    });
    const response = await result.onPermissionRequest({ kind: "read" }, { sessionId: "test" });
    expect(response.kind).toBe("approved");
  });

  it("onPermissionRequest denies when autoApprovePermissions is false", async () => {
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config: defaultConfig({ autoApprovePermissions: false }),
      supportsReasoningEffort: false,
    });
    const response = await result.onPermissionRequest({ kind: "read" }, { sessionId: "test" });
    expect(response.kind).toBe("denied-by-rules");
  });

  it("onPermissionRequest approves specific kinds", async () => {
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config: defaultConfig({ autoApprovePermissions: ["read", "write"] }),
      supportsReasoningEffort: false,
    });
    const readResponse = await result.onPermissionRequest({ kind: "read" }, { sessionId: "test" });
    expect(readResponse.kind).toBe("approved");
    const shellResponse = await result.onPermissionRequest({ kind: "shell" }, { sessionId: "test" });
    expect(shellResponse.kind).toBe("denied-by-rules");
  });

  it("onUserInputRequest returns a refusal message", async () => {
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config: defaultConfig(),
      supportsReasoningEffort: false,
    });
    const response = await result.onUserInputRequest!({ question: "What?" }, { sessionId: "test" });
    expect(response.wasFreeform).toBe(true);
    expect(response.answer).toContain("not available");
  });

  it("hooks.onPreToolUse allows tools in CLI tools list", async () => {
    const config = defaultConfig({ allowedCliTools: ["glob"] });
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config,
      supportsReasoningEffort: false,
    });
    const response = await result.hooks!.onPreToolUse!({ toolName: "glob" } as never, { sessionId: "test" });
    expect(response).toEqual({ permissionDecision: "allow" });
  });

  it("hooks.onPreToolUse allows all tools with wildcard", async () => {
    const config = defaultConfig({ allowedCliTools: ["*"] });
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config,
      supportsReasoningEffort: false,
    });
    const response = await result.hooks!.onPreToolUse!({ toolName: "anything" } as never, { sessionId: "test" });
    expect(response).toEqual({ permissionDecision: "allow" });
  });

  it("hooks.onPreToolUse denies tools not in any allowlist", async () => {
    const config = defaultConfig({ allowedCliTools: ["glob"] });
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config,
      supportsReasoningEffort: false,
    });
    const response = await result.hooks!.onPreToolUse!({ toolName: "bash" } as never, { sessionId: "test" });
    expect(response).toEqual({ permissionDecision: "deny" });
  });

  it("hooks.onPreToolUse allows tools in MCP server allowlist", async () => {
    const config = defaultConfig({
      allowedCliTools: [],
      mcpServers: {
        myServer: {
          type: "local",
          command: "node",
          args: ["server.js"],
          allowedTools: ["custom_tool"],
        } as never,
      },
    });
    const result = createSessionConfig({
      model: "gpt-4",
      logger,
      config,
      supportsReasoningEffort: false,
    });
    const response = await result.hooks!.onPreToolUse!({ toolName: "custom_tool" } as never, { sessionId: "test" });
    expect(response).toEqual({ permissionDecision: "allow" });
  });
});
