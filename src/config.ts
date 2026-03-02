import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, dirname, isAbsolute } from "node:path";
import JSON5 from "json5";
import type { Logger } from "./logger.js";
import {
  ServerConfigSchema,
  type MCPServer,
  type RawServerConfig,
} from "./schemas/config.js";

export type {
  MCPLocalServer,
  MCPRemoteServer,
  MCPServer,
  ApprovalRule,
  ReasoningEffort,
} from "./schemas/config.js";

export type ServerConfig = Omit<RawServerConfig, "bodyLimitMiB"> & {
  mcpServers: Record<string, MCPServer>;
  bodyLimit: number;
};

const BYTES_PER_MIB = 1024 * 1024;

const DEFAULT_CONFIG = {
  mcpServers: {},
  allowedCliTools: ["*"],
  bodyLimit: 10 * BYTES_PER_MIB,
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

export async function loadConfig(
  configPath: string,
  logger: Logger,
): Promise<ServerConfig> {
  const absolutePath = isAbsolute(configPath)
    ? configPath
    : resolve(process.cwd(), configPath);

  let text: string;
  try {
    text = await readFile(absolutePath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.warn(`No config file at ${absolutePath}, using defaults`);
      return DEFAULT_CONFIG;
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

  const configDir = dirname(absolutePath);
  const parsed = parseResult.data;
  const config: ServerConfig = {
    allowedCliTools: parsed.allowedCliTools,
    autoApprovePermissions: parsed.autoApprovePermissions,
    reasoningEffort: parsed.reasoningEffort,
    bodyLimit: parsed.bodyLimitMiB * BYTES_PER_MIB,
    mcpServers: resolveServerPaths(parsed.mcpServers, configDir),
  };

  return config;
}
