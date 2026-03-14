import type { SessionConfig, MCPServerConfig } from "@github/copilot-sdk";
import type { ServerConfig, ApprovalRule } from "../../config.js";
import type { Logger } from "../../logger.js";

export interface SessionConfigOptions {
  model: string;
  systemMessage?: string | undefined;
  logger: Logger;
  config: ServerConfig;
  supportsReasoningEffort: boolean;
  cwd?: string | undefined;
  provider?: SessionConfig["provider"];
}

function isApproved(rule: ApprovalRule, kind: string): boolean {
  if (typeof rule === "boolean") return rule;
  return rule.some((k) => k === kind);
}

export function createSessionConfig({
  model,
  systemMessage,
  logger,
  config,
  supportsReasoningEffort,
  cwd,
  provider,
}: SessionConfigOptions): SessionConfig {
  return {
    clientName: "copilot-sdk-proxy",
    model,
    streaming: true,
    infiniteSessions: { enabled: true },
    workingDirectory: cwd ?? process.cwd(),
    ...(provider && { provider }),

    ...(systemMessage && {
      systemMessage: {
        mode: "replace" as const,
        content: systemMessage,
      },
    }),

    mcpServers: Object.fromEntries(
      Object.entries(config.mcpServers).map(([name, server]) => [
        name,
        { ...server, tools: ["*"] } as MCPServerConfig,
      ]),
    ),

    ...(config.allowedCliTools.length > 0 && {
      availableTools: config.allowedCliTools,
    }),
    ...(config.reasoningEffort && supportsReasoningEffort && {
      reasoningEffort: config.reasoningEffort,
    }),

    onUserInputRequest: (request) => {
      logger.debug(`User input requested: "${request.question}"`);
      return Promise.resolve({
        answer:
          "User input is not available. Ask your question in your response instead.",
        wasFreeform: true,
      });
    },

    onPermissionRequest: (request) => {
      const approved = isApproved(config.autoApprovePermissions, request.kind);
      logger.debug(
        `Permission "${request.kind}": ${approved ? "approved" : "denied"}`,
      );
      return Promise.resolve(
        approved
          ? { kind: "approved" as const }
          : { kind: "denied-by-rules" as const, rules: [] },
      );
    },

    hooks: {
      onPreToolUse: (input) => {
        const toolName = input.toolName;

        if (config.allowedCliTools.includes("*") || config.allowedCliTools.includes(toolName)) {
          logger.debug(`Tool "${toolName}": allowed (CLI)`);
          return Promise.resolve({ permissionDecision: "allow" as const });
        }

        for (const [serverName, server] of Object.entries(config.mcpServers)) {
          const allowlist = server.allowedTools ?? [];
          if (allowlist.includes("*") || allowlist.includes(toolName)) {
            logger.debug(`Tool "${toolName}": allowed (${serverName})`);
            return Promise.resolve({ permissionDecision: "allow" as const });
          }
        }

        logger.debug(`Tool "${toolName}": denied (not in any allowlist)`);
        return Promise.resolve({ permissionDecision: "deny" as const });
      },

      onPostToolUse: (input) => {
        logger.debug(`Tool executed: ${input.toolName}`, input.toolArgs);
      },

      onErrorOccurred: (input) => {
        logger.warn(`SDK error (${input.errorContext}, ${input.recoverable ? "recoverable" : "not recoverable"}): ${input.error}`);
        if (input.recoverable && (input.errorContext === "model_call" || input.errorContext === "tool_execution")) {
          return { errorHandling: "retry" as const, retryCount: 2 };
        }
        return undefined;
      },
    },
  };
}
