import { randomUUID } from "node:crypto";
import type { CopilotSession } from "@github/copilot-sdk";
import type { Logger } from "#/logger.js";

export interface Conversation {
  id: string;
  session: CopilotSession | null;
  sentMessageCount: number;
  isPrimary: boolean;
  model: string | null;
  sessionActive: boolean;
  hadError: boolean;
}

export interface ConversationManager {
  findForNewRequest(): { conversation: Conversation; isReuse: boolean };
  remove(id: string): void;
  clearPrimary(): void;
}

export class DefaultConversationManager implements ConversationManager {
  private readonly conversations = new Map<string, Conversation>();
  private readonly logger: Logger;
  private primaryId: string | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  create(options?: { isPrimary?: boolean }): Conversation {
    const id = randomUUID();
    const isPrimary = options?.isPrimary ?? false;
    const conversation: Conversation = {
      id,
      session: null,
      sentMessageCount: 0,
      isPrimary,
      model: null,
      sessionActive: false,
      hadError: false,
    };
    this.conversations.set(id, conversation);

    if (isPrimary) {
      this.primaryId = id;
    }

    this.logger.debug(
      `Created conversation ${id} (primary=${String(isPrimary)}, active: ${String(this.conversations.size)})`,
    );
    return conversation;
  }

  getPrimary(): Conversation | null {
    if (!this.primaryId) return null;
    return this.conversations.get(this.primaryId) ?? null;
  }

  clearPrimary(): void {
    if (this.primaryId) {
      this.conversations.delete(this.primaryId);
      this.logger.debug(
        `Cleared primary conversation ${this.primaryId} (active: ${String(this.conversations.size)})`,
      );
      this.primaryId = null;
    }
  }

  findForNewRequest(): { conversation: Conversation; isReuse: boolean } {
    // Isolated conversations pile up when the primary is busy, so clean
    // up any that finished before we allocate more
    for (const [id, conv] of this.conversations) {
      if (!conv.isPrimary && !conv.sessionActive) {
        this.conversations.delete(id);
        this.logger.debug(
          `Evicted stale conversation ${id} (active: ${String(this.conversations.size)})`,
        );
      }
    }

    const primary = this.getPrimary();
    if (primary) {
      if (primary.sessionActive || !primary.session) {
        this.logger.debug(
          `Primary ${primary.id} is unavailable, creating isolated conversation`,
        );
        return { conversation: this.create(), isReuse: false };
      }
      this.logger.debug(`Reusing primary conversation ${primary.id}`);
      return { conversation: primary, isReuse: true };
    }
    return { conversation: this.create({ isPrimary: true }), isReuse: false };
  }

  remove(convId: string): void {
    const conv = this.conversations.get(convId);
    if (conv) {
      this.conversations.delete(convId);
      if (convId === this.primaryId) {
        this.primaryId = null;
      }
      this.logger.debug(
        `Removed conversation ${convId} (active: ${String(this.conversations.size)})`,
      );
    }
  }

  get size(): number {
    return this.conversations.size;
  }
}
