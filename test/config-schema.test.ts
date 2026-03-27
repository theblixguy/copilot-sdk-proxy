import { describe, it, expect } from "vitest";
import { ServerConfigSchema } from "#/schemas/config.js";

describe("ServerConfigSchema", () => {
  it("provides defaults for all fields", () => {
    const result = ServerConfigSchema.parse({});
    expect(result.openai.mcpServers).toEqual({});
    expect(result.claude.mcpServers).toEqual({});
    expect(result.codex.mcpServers).toEqual({});
    expect(result.allowedCliTools).toEqual([]);
    expect(result.bodyLimit).toBe(10);
    expect(result.autoApprovePermissions).toBe(true);
  });

  it("parses a valid full config", () => {
    const result = ServerConfigSchema.parse({
      openai: {
        mcpServers: {
          test: {
            type: "local",
            command: "node",
            args: ["server.js"],
          },
        },
      },
      allowedCliTools: ["glob", "grep"],
      bodyLimit: 5,
      reasoningEffort: "high",
      autoApprovePermissions: ["read", "write"],
    });
    expect(result.openai.mcpServers.test).toBeDefined();
    expect(result.claude.mcpServers).toEqual({});
    expect(result.allowedCliTools).toEqual(["glob", "grep"]);
    expect(result.bodyLimit).toBe(5);
    expect(result.reasoningEffort).toBe("high");
    expect(result.autoApprovePermissions).toEqual(["read", "write"]);
  });

  it("accepts remote MCP server config", () => {
    const result = ServerConfigSchema.parse({
      claude: {
        mcpServers: {
          remote: {
            type: "http",
            url: "https://example.com/mcp",
          },
        },
      },
    });
    expect(result.claude.mcpServers.remote).toBeDefined();
  });

  it("accepts SSE-type MCP server config", () => {
    const result = ServerConfigSchema.parse({
      openai: {
        mcpServers: {
          sse: {
            type: "sse",
            url: "https://example.com/sse",
            headers: { Authorization: "Bearer token" },
          },
        },
      },
    });
    expect(result.openai.mcpServers.sse).toBeDefined();
  });

  it("accepts stdio-type MCP server config", () => {
    const result = ServerConfigSchema.parse({
      codex: {
        mcpServers: {
          stdio: {
            type: "stdio",
            command: "python",
            args: ["server.py"],
            env: { PATH: "/usr/bin" },
          },
        },
      },
    });
    expect(result.codex.mcpServers.stdio).toBeDefined();
  });

  it("rejects bodyLimit exceeding 100", () => {
    const result = ServerConfigSchema.safeParse({ bodyLimit: 200 });
    expect(result.success).toBe(false);
  });

  it("rejects negative bodyLimit", () => {
    const result = ServerConfigSchema.safeParse({ bodyLimit: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects wildcard mixed with other CLI tools", () => {
    const result = ServerConfigSchema.safeParse({
      allowedCliTools: ["*", "glob"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts wildcard alone", () => {
    const result = ServerConfigSchema.parse({ allowedCliTools: ["*"] });
    expect(result.allowedCliTools).toEqual(["*"]);
  });

  it("accepts boolean autoApprovePermissions", () => {
    expect(
      ServerConfigSchema.parse({ autoApprovePermissions: true })
        .autoApprovePermissions,
    ).toBe(true);
    expect(
      ServerConfigSchema.parse({ autoApprovePermissions: false })
        .autoApprovePermissions,
    ).toBe(false);
  });

  it("accepts array autoApprovePermissions with valid kinds", () => {
    const result = ServerConfigSchema.parse({
      autoApprovePermissions: ["read", "write", "shell"],
    });
    expect(result.autoApprovePermissions).toEqual(["read", "write", "shell"]);
  });

  it("accepts valid reasoning effort values", () => {
    for (const effort of ["low", "medium", "high", "xhigh"]) {
      const result = ServerConfigSchema.parse({ reasoningEffort: effort });
      expect(result.reasoningEffort).toBe(effort);
    }
  });

  it("rejects invalid reasoning effort value", () => {
    const result = ServerConfigSchema.safeParse({ reasoningEffort: "extreme" });
    expect(result.success).toBe(false);
  });

  it("rejects MCP server with empty command", () => {
    const result = ServerConfigSchema.safeParse({
      openai: {
        mcpServers: {
          bad: { type: "local", command: "", args: [] },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("defaults requestTimeout to 0", () => {
    const result = ServerConfigSchema.parse({});
    expect(result.requestTimeout).toBe(0);
  });

  it("accepts valid requestTimeout in minutes", () => {
    const result = ServerConfigSchema.parse({ requestTimeout: 5 });
    expect(result.requestTimeout).toBe(5);
  });

  it("accepts fractional requestTimeout", () => {
    const result = ServerConfigSchema.parse({ requestTimeout: 0.5 });
    expect(result.requestTimeout).toBe(0.5);
  });

  it("rejects negative requestTimeout", () => {
    const result = ServerConfigSchema.safeParse({ requestTimeout: -1 });
    expect(result.success).toBe(false);
  });
});
