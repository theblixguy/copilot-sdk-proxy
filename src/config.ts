import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, dirname, isAbsolute } from "node:path";
import JSON5 from "json5";
import type { Logger } from "./logger.js";
import {
  ServerConfigSchema,
  PROVIDER_NAMES,
  type ProviderName,
  type MCPServer,
  type RawServerConfig,
} from "./schemas/config.js";

export type {
  MCPLocalServer,
  MCPRemoteServer,
  MCPServer,
  ApprovalRule,
  ReasoningEffort,
  ProviderName,
} from "./schemas/config.js";

export type { ProviderMode } from "./schemas/config.js";

export type ServerConfig = Omit<RawServerConfig, ProviderName | "requestTimeout"> & {
  mcpServers: Record<string, MCPServer>;
  requestTimeoutMs: number;
};

const BYTES_PER_MIB = 1024 * 1024;
const MS_PER_MINUTE = 60_000;

const DEFAULT_CONFIG = {
  mcpServers: {},
  allowedCliTools: ["*"],
  bodyLimit: 10 * BYTES_PER_MIB,
  requestTimeoutMs: 0,
  autoApprovePermissions: true,
} satisfies ServerConfig;

function resolveServerPaths(
  servers: Record<string, MCPServer>,
  configDir: string,
): Record<string, MCPServer> {
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      "args" in server
        ? {
            ...server,
            args: server.args.map((arg) =>
              arg.startsWith("./") || arg.startsWith("../")
                ? resolve(configDir, arg)
                : arg,
            ),
          }
        : server,
    ]),
  );
}

export function resolveConfigPath(
  projectCwd: string | undefined,
  processCwd: string,
  defaultPath: string,
): string {
  if (projectCwd) {
    const projectConfig = resolve(projectCwd, "config.json5");
    if (existsSync(projectConfig)) return projectConfig;
  }
  const localConfig = resolve(processCwd, "config.json5");
  if (existsSync(localConfig)) return localConfig;
  return defaultPath;
}

type ParsedConfig = {
  data: RawServerConfig;
  configDir: string;
};

async function parseConfigFile(
  configPath: string,
  logger: Logger,
): Promise<ParsedConfig | null> {
  const absolutePath = isAbsolute(configPath)
    ? configPath
    : resolve(process.cwd(), configPath);

  let text: string;
  try {
    text = await readFile(absolutePath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.warn(`No config file at ${absolutePath}, using defaults`);
      return null;
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = JSON5.parse(text);
  } catch (err) {
    throw new Error(
      `Failed to parse config file: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Config file must contain a JSON5 object");
  }

  const parseResult = ServerConfigSchema.safeParse(raw);
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0];
    if (!firstError) {
      throw new Error("Invalid config: validation failed");
    }
    const path = firstError.path.join(".");
    throw new Error(
      `Invalid config${path ? ` at "${path}"` : ""}: ${firstError.message}`
    );
  }

  return { data: parseResult.data, configDir: dirname(absolutePath) };
}

function buildServerConfig(
  parsed: RawServerConfig,
  configDir: string,
  provider: ProviderName,
): ServerConfig {
  return {
    allowedCliTools: parsed.allowedCliTools,
    autoApprovePermissions: parsed.autoApprovePermissions,
    reasoningEffort: parsed.reasoningEffort,
    bodyLimit: parsed.bodyLimit * BYTES_PER_MIB,
    requestTimeoutMs: parsed.requestTimeout * MS_PER_MINUTE,
    mcpServers: resolveServerPaths(parsed[provider].mcpServers, configDir),
  };
}

export async function loadConfig(
  configPath: string,
  logger: Logger,
  provider: ProviderName,
): Promise<ServerConfig> {
  const result = await parseConfigFile(configPath, logger);
  if (!result) return DEFAULT_CONFIG;
  return buildServerConfig(result.data, result.configDir, provider);
}

export type AllProviderConfigs = {
  providers: Record<ProviderName, ServerConfig>;
  shared: ServerConfig;
};

export async function loadAllProviderConfigs(
  configPath: string,
  logger: Logger,
): Promise<AllProviderConfigs> {
  const result = await parseConfigFile(configPath, logger);
  const providers = Object.fromEntries(
    PROVIDER_NAMES.map((name) => [
      name,
      result ? buildServerConfig(result.data, result.configDir, name) : DEFAULT_CONFIG,
    ]),
  ) as Record<ProviderName, ServerConfig>;

  // Reuse buildServerConfig for shared fields, override mcpServers to empty.
  // The provider arg is arbitrary since shared fields are provider-independent.
  const shared: ServerConfig = result
    ? { ...buildServerConfig(result.data, result.configDir, "openai"), mcpServers: {} }
    : DEFAULT_CONFIG;

  return { providers, shared };
}
