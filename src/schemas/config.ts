import { z } from "zod";

export const MCPLocalServerSchema = z.object({
  type: z.union([z.literal("local"), z.literal("stdio")]),
  command: z.string().min(1, "MCP server command cannot be empty"),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).exactOptional(),
  cwd: z.string().exactOptional(),
  allowedTools: z.array(z.string()).exactOptional(),
  timeout: z.number().positive().exactOptional(),
});

export const MCPRemoteServerSchema = z.object({
  type: z.union([z.literal("http"), z.literal("sse")]),
  url: z.url(),
  headers: z.record(z.string(), z.string()).exactOptional(),
  allowedTools: z.array(z.string()).exactOptional(),
  timeout: z.number().positive().exactOptional(),
});

export const MCPServerSchema = z.union([
  MCPLocalServerSchema,
  MCPRemoteServerSchema,
]);

const VALID_PERMISSION_KINDS = [
  "read",
  "write",
  "shell",
  "mcp",
  "url",
] as const;

export const ApprovalRuleSchema = z.union([
  z.boolean(),
  z.array(z.enum(VALID_PERMISSION_KINDS)),
]);

const VALID_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export const ReasoningEffortSchema = z.enum(VALID_REASONING_EFFORTS);

export type MCPLocalServer = z.infer<typeof MCPLocalServerSchema>;
export type MCPRemoteServer = z.infer<typeof MCPRemoteServerSchema>;
export type MCPServer = z.infer<typeof MCPServerSchema>;
export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ProviderConfigSchema = z.object({
  mcpServers: z.record(z.string(), MCPServerSchema).default({}),
  reasoningEffort: ReasoningEffortSchema.exactOptional(),
});

export const PROVIDER_NAMES = ["openai", "claude", "codex"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];
export type ProviderMode = ProviderName | "auto";

const PROVIDER_DEFAULTS = { mcpServers: {} };

export const ServerConfigSchema = z
  .object({
    openai: ProviderConfigSchema.default(PROVIDER_DEFAULTS),
    claude: ProviderConfigSchema.default(PROVIDER_DEFAULTS),
    codex: ProviderConfigSchema.default(PROVIDER_DEFAULTS),
    allowedCliTools: z
      .array(z.string())
      .refine(
        (arr) => !arr.includes("*") || arr.length === 1,
        'allowedCliTools: use ["*"] alone to allow all tools, don\'t mix with other entries',
      )
      .default([]),
    bodyLimit: z
      .number()
      .positive()
      .max(100, "bodyLimit cannot exceed 100")
      .default(10),
    requestTimeout: z.number().min(0, "requestTimeout must be >= 0").default(0),
    autoApprovePermissions: ApprovalRuleSchema.default(true),
  })
  .strict();

export type RawServerConfig = z.infer<typeof ServerConfigSchema>;
