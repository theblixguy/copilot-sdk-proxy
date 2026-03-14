import {
  CopilotClient,
  type CopilotSession,
  type SessionConfig,
  type ModelInfo,
  type GetAuthStatusResponse,
} from "@github/copilot-sdk";
import type { LogLevel, Logger } from "./logger.js";

export interface CopilotServiceOptions {
  logLevel?: LogLevel | undefined;
  logger?: Logger | undefined;
  cwd?: string | undefined;
  githubToken?: string | undefined;
}

const MODEL_CACHE_TTL_MS = 30 * 60 * 1000;

export class CopilotService {
  readonly cwd: string;
  private client: CopilotClient;
  private logger: Logger | undefined;
  private cachedModels: ModelInfo[] | undefined;
  private cachedModelsAt = 0;

  constructor(options: CopilotServiceOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.logger = options.logger;
    this.client = new CopilotClient({
      logLevel: options.logLevel ?? "error",
      cwd: this.cwd,
      env: Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] != null),
      ),
      ...(options.githubToken && {
        githubToken: options.githubToken,
        useLoggedInUser: false,
      }),
    });
  }

  async start(): Promise<void> {
    await this.client.start();
  }

  async stop(): Promise<void> {
    await this.client.stop();
  }

  async getAuthStatus(): Promise<GetAuthStatusResponse> {
    return this.client.getAuthStatus();
  }

  async ping(message?: string): Promise<{ message: string; timestamp: number; protocolVersion?: number }> {
    return this.client.ping(message);
  }

  async listModels(): Promise<ModelInfo[]> {
    if (this.cachedModels && Date.now() - this.cachedModelsAt < MODEL_CACHE_TTL_MS) {
      return this.cachedModels;
    }
    const models = await this.client.listModels();
    this.cachedModels = models;
    this.cachedModelsAt = Date.now();
    return models;
  }

  async createSession(config: SessionConfig): Promise<CopilotSession> {
    this.logger?.info("Creating session");
    return this.client.createSession(config);
  }
}
