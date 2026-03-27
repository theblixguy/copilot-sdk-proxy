import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadConfig,
  loadAllProviderConfigs,
  resolveConfigPath,
} from "#/config.js";
import { Logger } from "#/logger.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

const { existsSync } = await import("node:fs");
const { readFile } = await import("node:fs/promises");

const mockExistsSync = vi.mocked(existsSync);
const mockReadFile = vi.mocked(readFile);

describe("resolveConfigPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns project config when projectCwd is set and file exists", () => {
    mockExistsSync.mockReturnValue(true);
    const result = resolveConfigPath("/project", "/cwd", "/default");
    expect(result).toBe("/project/config.json5");
  });

  it("falls back to processCwd config when project config does not exist", () => {
    mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const result = resolveConfigPath("/project", "/cwd", "/default");
    expect(result).toBe("/cwd/config.json5");
  });

  it("falls back to defaultPath when neither project nor local config exists", () => {
    mockExistsSync.mockReturnValue(false);
    const result = resolveConfigPath("/project", "/cwd", "/default");
    expect(result).toBe("/default");
  });

  it("skips project check when projectCwd is undefined", () => {
    mockExistsSync.mockReturnValue(false);
    const result = resolveConfigPath(undefined, "/cwd", "/default");
    expect(result).toBe("/default");
    expect(mockExistsSync).toHaveBeenCalledTimes(1);
  });
});

describe("loadConfig", () => {
  const logger = new Logger("none");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns defaults when config file does not exist", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockReadFile.mockRejectedValue(err);

    const config = await loadConfig(
      "/nonexistent/config.json5",
      logger,
      "openai",
    );
    expect(config.allowedCliTools).toEqual(["*"]);
    expect(config.autoApprovePermissions).toBe(true);
    expect(config.bodyLimit).toBe(10 * 1024 * 1024);
  });

  it("throws on non-ENOENT read errors", async () => {
    mockReadFile.mockRejectedValue(new Error("permission denied"));
    await expect(
      loadConfig("/forbidden/config.json5", logger, "openai"),
    ).rejects.toThrow("permission denied");
  });

  it("throws on invalid JSON5", async () => {
    mockReadFile.mockResolvedValue("not valid json5 {{{{" as never);
    await expect(loadConfig("/bad.json5", logger, "openai")).rejects.toThrow(
      "Failed to parse config file",
    );
  });

  it("throws when config is not an object", async () => {
    mockReadFile.mockResolvedValue('"just a string"' as never);
    await expect(loadConfig("/str.json5", logger, "openai")).rejects.toThrow(
      "Config file must contain a JSON5 object",
    );
  });

  it("parses a valid config", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        allowedCliTools: ["glob"],
        bodyLimit: 5,
        autoApprovePermissions: false,
      }) as never,
    );

    const config = await loadConfig("/valid/config.json5", logger, "openai");
    expect(config.allowedCliTools).toEqual(["glob"]);
    expect(config.bodyLimit).toBe(5 * 1024 * 1024);
    expect(config.autoApprovePermissions).toBe(false);
  });

  it("resolves relative MCP server paths against config directory", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        openai: {
          mcpServers: {
            test: {
              type: "local",
              command: "node",
              args: ["./server.js", "--flag"],
            },
          },
        },
      }) as never,
    );

    const config = await loadConfig("/project/config.json5", logger, "openai");
    expect(config.mcpServers.test).toBeDefined();
    const server = config.mcpServers.test!;
    if ("args" in server) {
      expect(server.args[0]).toContain("/project/server.js");
      expect(server.args[1]).toBe("--flag");
    }
  });

  it("loads provider-specific MCP servers", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        openai: {
          mcpServers: { a: { type: "local", command: "node", args: [] } },
        },
        claude: {
          mcpServers: { b: { type: "local", command: "python", args: [] } },
        },
      }) as never,
    );

    const openaiConfig = await loadConfig(
      "/project/config.json5",
      logger,
      "openai",
    );
    expect(openaiConfig.mcpServers.a).toBeDefined();
    expect(openaiConfig.mcpServers.b).toBeUndefined();

    const claudeConfig = await loadConfig(
      "/project/config.json5",
      logger,
      "claude",
    );
    expect(claudeConfig.mcpServers.b).toBeDefined();
    expect(claudeConfig.mcpServers.a).toBeUndefined();
  });

  it("rejects invalid config schema", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        bodyLimit: -5,
      }) as never,
    );

    await expect(
      loadConfig("/invalid-schema.json5", logger, "openai"),
    ).rejects.toThrow("Invalid config");
  });
});

describe("loadAllProviderConfigs", () => {
  const logger = new Logger("none");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns defaults for all providers when config file does not exist", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockReadFile.mockRejectedValue(err);

    const result = await loadAllProviderConfigs("/missing.json5", logger);
    for (const name of ["openai", "claude", "codex"] as const) {
      expect(result.providers[name].allowedCliTools).toEqual(["*"]);
      expect(result.providers[name].mcpServers).toEqual({});
    }
    expect(result.shared.mcpServers).toEqual({});
  });

  it("gives each provider its own MCP servers", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        openai: {
          mcpServers: { a: { type: "local", command: "node", args: [] } },
        },
        claude: {
          mcpServers: { b: { type: "local", command: "python", args: [] } },
        },
      }) as never,
    );

    const result = await loadAllProviderConfigs(
      "/project/config.json5",
      logger,
    );
    expect(Object.keys(result.providers.openai.mcpServers)).toEqual(["a"]);
    expect(Object.keys(result.providers.claude.mcpServers)).toEqual(["b"]);
    expect(result.providers.codex.mcpServers).toEqual({});
  });

  it("shared config has empty mcpServers and shared settings", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        allowedCliTools: ["glob"],
        bodyLimit: 5,
        openai: {
          mcpServers: { a: { type: "local", command: "node", args: [] } },
        },
      }) as never,
    );

    const result = await loadAllProviderConfigs(
      "/project/config.json5",
      logger,
    );
    expect(result.shared.mcpServers).toEqual({});
    expect(result.shared.allowedCliTools).toEqual(["glob"]);
    expect(result.shared.bodyLimit).toBe(5 * 1024 * 1024);
  });
});
