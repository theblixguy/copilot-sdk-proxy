import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runHandlerPipeline,
  type HandlerPipeline,
} from "#providers/shared/handler-core.js";
import type { AppContext } from "#context.js";
import type {
  Conversation,
  ConversationManager,
} from "#conversation-manager.js";
import type { CopilotSession, ModelInfo } from "@github/copilot-sdk";
import { Logger } from "#logger.js";
import { Stats } from "#stats.js";

const logger = new Logger("none");

const AVAILABLE_MODELS: ModelInfo[] = [
  { id: "gpt-4", capabilities: { supports: { reasoningEffort: false } } },
  {
    id: "claude-sonnet-4-5",
    capabilities: { supports: { reasoningEffort: false } },
  },
  {
    id: "claude-opus-4-5",
    capabilities: { supports: { reasoningEffort: true } },
  },
] as ModelInfo[];

interface MockSessionResult {
  session: CopilotSession;
  setModel: ReturnType<typeof vi.fn>;
}

function mockSession(): MockSessionResult {
  const setModel = vi.fn().mockResolvedValue(undefined);
  const session = {
    on: () => () => {},
    send: vi.fn().mockResolvedValue(undefined),
    setModel,
    abort: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    getMessages: vi.fn().mockReturnValue([]),
  } as unknown as CopilotSession;
  return { session, setModel };
}

function mockReply(): { reply: unknown } {
  const reply = {
    sent: false,
    raw: {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    },
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn(),
  };
  return { reply };
}

interface TestReq {
  model: string;
  stream?: boolean;
}

function createPipeline(): HandlerPipeline<TestReq> {
  return {
    sendError: vi.fn(),
    extractSystemMessage: () => undefined,
    formatPrompt: () => "test prompt",
    messageCount: () => 1,
    stream: vi.fn().mockResolvedValue(true),
  };
}

function createConversation(opts: {
  model?: string;
  session?: CopilotSession | null;
}): Conversation {
  return {
    id: "test-conv",
    session: opts.session ?? null,
    sentMessageCount: 1,
    isPrimary: true,
    model: opts.model ?? null,
    sessionActive: false,
    hadError: false,
  };
}

function createCtx(overrides?: {
  listModels?: () => Promise<ModelInfo[]>;
}): AppContext {
  return {
    service: {
      cwd: "/tmp",
      listModels:
        overrides?.listModels ?? (() => Promise.resolve(AVAILABLE_MODELS)),
      createSession: vi.fn().mockResolvedValue(mockSession().session),
    } as unknown as AppContext["service"],
    logger,
    config: {
      allowedCliTools: ["*"],
      autoApprovePermissions: true,
      bodyLimit: 10 * 1024 * 1024,
      requestTimeoutMs: 0,
      mcpServers: {},
    },
    port: 8080,
    stats: new Stats(),
  };
}

describe("model switching on reuse", () => {
  let setModel: ReturnType<typeof vi.fn>;
  let conversation: Conversation;
  let handler: (req: TestReq, reply: never) => Promise<void>;

  beforeEach(() => {
    const mock = mockSession();
    setModel = mock.setModel;
    conversation = createConversation({
      model: "gpt-4",
      session: mock.session,
    });
    const manager: ConversationManager = {
      findForNewRequest: () => ({ conversation, isReuse: true }),
      remove: vi.fn(),
      clearPrimary: vi.fn(),
    };
    handler = runHandlerPipeline(
      createCtx(),
      manager,
      createPipeline(),
    ) as typeof handler;
  });

  async function switchTo(model: string): Promise<void> {
    await handler({ model }, mockReply().reply as never);
  }

  it("calls setModel and updates conversation.model when models differ", async () => {
    await switchTo("claude-sonnet-4-5");

    expect(setModel).toHaveBeenCalledWith("claude-sonnet-4-5", {});
    expect(conversation.model).toBe("claude-sonnet-4-5");
  });

  it("does not call setModel when models match", async () => {
    await switchTo("gpt-4");

    expect(setModel).not.toHaveBeenCalled();
    expect(conversation.model).toBe("gpt-4");
  });

  it("keeps old model when setModel throws", async () => {
    setModel.mockRejectedValue(new Error("switch failed"));

    await switchTo("claude-sonnet-4-5");

    expect(setModel).toHaveBeenCalledWith("claude-sonnet-4-5", {});
    expect(conversation.model).toBe("gpt-4");
  });

  it("keeps old model when requested model is not available", async () => {
    await switchTo("nonexistent-model");

    expect(setModel).not.toHaveBeenCalled();
    expect(conversation.model).toBe("gpt-4");
  });

  it("passes reasoningEffort to setModel when model supports it", async () => {
    const mock = mockSession();
    setModel = mock.setModel;
    const conv = createConversation({ model: "gpt-4", session: mock.session });
    const ctx = createCtx();
    ctx.config.reasoningEffort = "high";
    const mgr: ConversationManager = {
      findForNewRequest: () => ({ conversation: conv, isReuse: true }),
      remove: vi.fn(),
      clearPrimary: vi.fn(),
    };
    const switchHandler = runHandlerPipeline(
      ctx,
      mgr,
      createPipeline(),
    ) as typeof handler;

    await switchHandler(
      { model: "claude-opus-4-5" },
      mockReply().reply as never,
    );

    expect(setModel).toHaveBeenCalledWith("claude-opus-4-5", {
      reasoningEffort: "high",
    });
  });

  it("resolves model family fallback before switching", async () => {
    conversation.model = "claude-sonnet-4-5";

    await switchTo("claude-opus-4-5");

    expect(setModel).toHaveBeenCalledWith("claude-opus-4-5", {});
    expect(conversation.model).toBe("claude-opus-4-5");
  });
});
