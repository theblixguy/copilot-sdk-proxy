import { describe, it, expect } from "vitest";
import { DefaultConversationManager } from "../src/conversation-manager.js";
import { Logger } from "../src/logger.js";

const logger = new Logger("none");

function createManager(): DefaultConversationManager {
  return new DefaultConversationManager(logger);
}

describe("DefaultConversationManager", () => {
  describe("create", () => {
    it("returns a conversation with a unique id", () => {
      const manager = createManager();
      const a = manager.create();
      const b = manager.create();
      expect(a.id).toBeTruthy();
      expect(b.id).toBeTruthy();
      expect(a.id).not.toBe(b.id);
    });

    it("initialises conversation fields", () => {
      const conv = createManager().create();
      expect(conv.session).toBeNull();
      expect(conv.sentMessageCount).toBe(0);
      expect(conv.isPrimary).toBe(false);
      expect(conv.sessionActive).toBe(false);
      expect(conv.hadError).toBe(false);
    });

    it("marks conversation as primary when requested", () => {
      const conv = createManager().create({ isPrimary: true });
      expect(conv.isPrimary).toBe(true);
    });

    it("increments size", () => {
      const manager = createManager();
      expect(manager.size).toBe(0);
      manager.create();
      expect(manager.size).toBe(1);
      manager.create();
      expect(manager.size).toBe(2);
    });
  });

  describe("getPrimary", () => {
    it("returns null when no primary exists", () => {
      expect(createManager().getPrimary()).toBeNull();
    });

    it("returns the primary conversation", () => {
      const manager = createManager();
      const conv = manager.create({ isPrimary: true });
      expect(manager.getPrimary()).toBe(conv);
    });
  });

  describe("remove", () => {
    it("removes conversation and decrements size", () => {
      const manager = createManager();
      const conv = manager.create();
      expect(manager.size).toBe(1);
      manager.remove(conv.id);
      expect(manager.size).toBe(0);
    });

    it("is a no-op for unknown id", () => {
      const manager = createManager();
      manager.create();
      manager.remove("unknown");
      expect(manager.size).toBe(1);
    });

    it("clears primaryId when removing the primary", () => {
      const manager = createManager();
      const conv = manager.create({ isPrimary: true });
      manager.remove(conv.id);
      expect(manager.getPrimary()).toBeNull();
    });
  });

  describe("clearPrimary", () => {
    it("removes the primary conversation", () => {
      const manager = createManager();
      manager.create({ isPrimary: true });
      expect(manager.size).toBe(1);
      manager.clearPrimary();
      expect(manager.size).toBe(0);
      expect(manager.getPrimary()).toBeNull();
    });

    it("is a no-op when no primary exists", () => {
      const manager = createManager();
      manager.create();
      expect(manager.size).toBe(1);
      manager.clearPrimary();
      expect(manager.size).toBe(1);
    });
  });

  describe("findForNewRequest", () => {
    it("creates a new primary when none exists", () => {
      const manager = createManager();
      const { conversation, isReuse } = manager.findForNewRequest();
      expect(isReuse).toBe(false);
      expect(conversation.isPrimary).toBe(true);
      expect(manager.getPrimary()).toBe(conversation);
    });

    it("reuses idle primary with a session", () => {
      const manager = createManager();
      const primary = manager.create({ isPrimary: true });
      primary.session = { on: () => () => {} } as never;

      const { conversation, isReuse } = manager.findForNewRequest();
      expect(isReuse).toBe(true);
      expect(conversation).toBe(primary);
    });

    it("creates isolated conversation when primary is busy", () => {
      const manager = createManager();
      const primary = manager.create({ isPrimary: true });
      primary.session = { on: () => () => {} } as never;
      primary.sessionActive = true;

      const { conversation, isReuse } = manager.findForNewRequest();
      expect(isReuse).toBe(false);
      expect(conversation.isPrimary).toBe(false);
      expect(conversation).not.toBe(primary);
      expect(manager.getPrimary()).toBe(primary);
    });

    it("evicts idle non-primary conversations", () => {
      const manager = createManager();
      const primary = manager.create({ isPrimary: true });
      primary.session = { on: () => () => {} } as never;
      primary.sessionActive = true;

      const isolated = manager.create();
      isolated.sessionActive = true;
      isolated.sessionActive = false;
      expect(manager.size).toBe(2);

      primary.sessionActive = false;
      manager.findForNewRequest();
      expect(manager.size).toBe(1);
      expect(manager.getPrimary()).toBe(primary);
    });

    it("does NOT evict active non-primary conversations", () => {
      const manager = createManager();
      const primary = manager.create({ isPrimary: true });
      primary.session = { on: () => () => {} } as never;
      primary.sessionActive = true;

      const isolated = manager.create();
      isolated.sessionActive = true;
      expect(manager.size).toBe(2);

      manager.findForNewRequest();
      expect(manager.size).toBe(3);
    });

    it("does NOT evict primary conversation", () => {
      const manager = createManager();
      const primary = manager.create({ isPrimary: true });
      primary.session = { on: () => () => {} } as never;

      manager.findForNewRequest();
      expect(manager.getPrimary()).toBe(primary);
      expect(manager.size).toBe(1);
    });
  });
});
