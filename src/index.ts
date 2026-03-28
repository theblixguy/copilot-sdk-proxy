// Server
export { createServer } from "#/server.js";
export { type AppContext } from "#/context.js";

// Copilot SDK wrapper
export {
  CopilotService,
  type CopilotServiceOptions,
} from "#/copilot-service.js";

// Conversation management
export {
  DefaultConversationManager,
  type Conversation,
  type ConversationManager,
} from "#/conversation-manager.js";

// Streaming core
export {
  runSessionStreaming,
  createCommonEventHandler,
  type StreamProtocol,
  type CommonEventHandler,
} from "#/providers/shared/streaming-core.js";
export {
  SSE_HEADERS,
  sendSSEEvent,
  sendSSEComment,
  currentTimestamp,
  formatCompaction,
  recordUsageEvent,
} from "#/providers/shared/streaming-utils.js";

// Re-export all SDK types so consumers don't need a direct @github/copilot-sdk dependency
export type * from "@github/copilot-sdk";

// Handler pipeline
export {
  runHandlerPipeline,
  type HandlerPipeline,
  type BaseHandlerOptions,
} from "#/providers/shared/handler-core.js";

// Session config
export {
  createSessionConfig,
  type SessionConfigOptions,
} from "#/providers/shared/session-config.js";

// Model resolution
export {
  normalizeModelId,
  resolveModel,
  resolveModelForSession,
  type ModelResolution,
  type ModelMatch,
} from "#/providers/shared/model-resolver.js";

// Errors
export {
  sendOpenAIError,
  sendAnthropicError,
  validateRequest,
} from "#/providers/shared/errors.js";

// Stats
export {
  Stats,
  type StatsSnapshot,
  type UsageData,
  type ModelMetricsSnapshot,
} from "#/stats.js";

// Logger
export { Logger, LOG_LEVELS, LEVEL_PRIORITY, type LogLevel } from "#/logger.js";

// Config
export {
  loadConfig,
  loadAllProviderConfigs,
  resolveConfigPath,
  type ServerConfig,
  type AllProviderConfigs,
  type MCPLocalServer,
  type MCPRemoteServer,
  type MCPServer,
  type ApprovalRule,
  type ReasoningEffort,
  type ProviderName,
  type ProviderMode,
} from "#/config.js";
export {
  ServerConfigSchema,
  ProviderConfigSchema,
  MCPLocalServerSchema,
  MCPRemoteServerSchema,
  MCPServerSchema,
  ApprovalRuleSchema,
  ReasoningEffortSchema,
  PROVIDER_NAMES,
  type RawServerConfig,
} from "#/schemas/config.js";

// UI
export {
  bold,
  dim,
  red,
  green,
  cyan,
  yellow,
  symbols,
  createSpinner,
  printBanner,
  printUsageSummary,
  type Spinner,
  type BannerInfo,
} from "#/ui.js";

// CLI validators
export {
  parsePort,
  parseLogLevel,
  parseProvider,
  parseIdleTimeout,
  isProviderName,
} from "#/cli-validators.js";

// Provider types and registry
export { type Provider } from "#/providers/types.js";
export { providers, createAutoProvider } from "#/providers/index.js";

// OpenAI provider
export {
  OpenAIRequestSchema,
  extractContentText,
  extractSystemMessages,
  type Message,
  type OpenAIRequest,
  type ChatCompletionChunk,
  type Choice,
  type ModelsResponse,
} from "#/providers/openai/schemas.js";
export { createModelsHandler } from "#/providers/openai/models.js";
export {
  createCompletionsHandler,
  type CompletionsHandlerOptions,
} from "#/providers/openai/handler.js";
export {
  OpenAIProtocol,
  handleStreaming as handleOpenAIStreaming,
} from "#/providers/openai/streaming.js";

// Claude provider
export {
  AnthropicRequestSchema,
  extractAnthropicSystem,
  type AnthropicMessage,
  type AnthropicRequest,
  type ContentBlock,
  type AnthropicErrorResponse,
  type CountTokensResponse,
  type AnthropicToolDefinition,
  type ContentBlockStopEvent,
} from "#/providers/claude/schemas.js";
export { createCountTokensHandler } from "#/providers/claude/count-tokens.js";
export {
  createMessagesHandler,
  type MessagesHandlerOptions,
} from "#/providers/claude/handler.js";
export {
  AnthropicProtocol,
  handleAnthropicStreaming,
  startReply,
} from "#/providers/claude/streaming.js";
export { formatAnthropicPrompt } from "#/providers/claude/prompt.js";

// Codex provider
export {
  ResponsesRequestSchema,
  filterFunctionTools,
  genId,
  type ResponsesRequest,
  type ResponseObject,
  type OutputItem,
  type FunctionCallOutput,
  type FunctionCallOutputItem,
} from "#/providers/codex/schemas.js";
export {
  createResponsesHandler,
  type ResponsesHandlerOptions,
} from "#/providers/codex/handler.js";
export {
  ResponsesProtocol,
  handleResponsesStreaming,
  nextSeq,
  startResponseStream,
  type SeqCounter,
} from "#/providers/codex/streaming.js";
export {
  extractFunctionCallOutputs,
  formatResponsesPrompt,
} from "#/providers/codex/prompt.js";

// Individual providers
export { openaiProvider } from "#/providers/openai/provider.js";
export { claudeProvider } from "#/providers/claude/provider.js";
export { codexProvider } from "#/providers/codex/provider.js";
