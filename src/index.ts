// Server
export { createServer } from "./server.js";
export { type AppContext } from "./context.js";

// Copilot SDK wrapper
export { CopilotService, type CopilotServiceOptions } from "./copilot-service.js";

// Conversation management
export { DefaultConversationManager, type Conversation, type ConversationManager } from "./conversation-manager.js";

// Streaming
export { runSessionStreaming, type StreamProtocol } from "./providers/shared/streaming-core.js";
export {
  SSE_HEADERS,
  sendSSEEvent,
  sendSSEComment,
  formatCompaction,
  recordUsageEvent,
} from "./providers/shared/streaming-utils.js";

// Re-export all SDK types so consumers don't need a direct @github/copilot-sdk dependency
export type * from "@github/copilot-sdk";

// Session config
export { createSessionConfig, type SessionConfigOptions } from "./providers/shared/session-config.js";

// Model resolution
export { resolveModel, resolveModelForSession, type ModelResolution } from "./providers/shared/model-resolver.js";

// Errors
export { sendOpenAIError, sendAnthropicError } from "./providers/shared/errors.js";

// Stats
export { Stats, type StatsSnapshot, type UsageData, type ModelMetricsSnapshot } from "./stats.js";

// Logger
export { Logger, LEVEL_PRIORITY, type LogLevel } from "./logger.js";

// Config
export {
  loadConfig,
  resolveConfigPath,
  type ServerConfig,
  type MCPLocalServer,
  type MCPRemoteServer,
  type MCPServer,
  type ApprovalRule,
  type ReasoningEffort,
} from "./config.js";
export { ServerConfigSchema, type RawServerConfig } from "./schemas/config.js";

// UI
export {
  bold, dim, red, green, cyan, yellow,
  symbols,
  createSpinner,
  printBanner,
  printUsageSummary,
  type Spinner,
  type BannerInfo,
} from "./ui.js";

// CLI validators
export {
  parsePort,
  parseLogLevel,
  parseProvider,
  parseIdleTimeout,
  isProviderName,
} from "./cli-validators.js";

// Provider types and registry
export { type Provider } from "./providers/types.js";
export { providers, type ProviderName } from "./providers/index.js";

// OpenAI provider schemas and formatters
export {
  ChatCompletionRequestSchema,
  extractContentText,
  currentTimestamp as openaiCurrentTimestamp,
  type ChatCompletionMessage,
  type ChatCompletionRequest,
  type ChatCompletionChunk,
  type Choice,
  type Model,
  type ModelsResponse,
} from "./providers/openai/schemas.js";
export { formatPrompt } from "./providers/openai/prompt.js";
export { createModelsHandler } from "./providers/openai/models.js";
export { createCompletionsHandler, type HandlerOptions } from "./providers/openai/handler.js";
export { handleStreaming as handleOpenAIStreaming } from "./providers/openai/streaming.js";

// Claude provider schemas and formatters
export {
  AnthropicMessagesRequestSchema,
  extractAnthropicSystem,
  type AnthropicMessage,
  type AnthropicToolDefinition,
  type AnthropicMessagesRequest,
  type TextBlock,
  type ToolUseBlock,
  type ToolResultBlock,
  type ContentBlock,
  type AnthropicSSEEvent,
  type MessageStartEvent,
  type ContentBlockStartEvent,
  type ContentBlockDeltaEvent,
  type ContentBlockStopEvent,
  type MessageDeltaEvent,
  type MessageStopEvent,
  type AnthropicErrorResponse,
  type CountTokensResponse,
} from "./providers/claude/schemas.js";
export { formatAnthropicPrompt } from "./providers/claude/prompt.js";
export { createCountTokensHandler } from "./providers/claude/count-tokens.js";
export { createMessagesHandler, type MessagesHandlerOptions } from "./providers/claude/handler.js";
export { startReply, AnthropicProtocol, handleAnthropicStreaming } from "./providers/claude/streaming.js";

// Codex provider schemas and formatters
export {
  ResponsesRequestSchema,
  filterFunctionTools,
  currentTimestamp as codexCurrentTimestamp,
  genId,
  type InputItem,
  type InputMessage,
  type FunctionCallInput,
  type FunctionCallOutputInput,
  type ResponsesTool,
  type ResponsesRequest,
  type MessageContent,
  type MessageOutputItem,
  type FunctionCallOutputItem,
  type OutputItem,
  type ResponseObject,
} from "./providers/codex/schemas.js";
export {
  formatResponsesPrompt,
  extractInstructions,
  extractFunctionCallOutputs,
} from "./providers/codex/prompt.js";
export { createResponsesHandler, type ResponsesHandlerOptions } from "./providers/codex/handler.js";
export {
  type SeqCounter,
  nextSeq,
  startResponseStream,
  ResponsesProtocol,
  handleResponsesStreaming,
} from "./providers/codex/streaming.js";

// Individual providers
export { openaiProvider } from "./providers/openai/provider.js";
export { claudeProvider } from "./providers/claude/provider.js";
export { codexProvider } from "./providers/codex/provider.js";
