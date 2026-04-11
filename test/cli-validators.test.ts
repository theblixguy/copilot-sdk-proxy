import { describe, it, expect } from "vitest";
import {
  parsePort,
  parseLogLevel,
  parseProvider,
  parseIdleTimeout,
  isProviderName,
} from "#cli-validators.js";

describe("parsePort", () => {
  it("parses a valid port", () => {
    expect(parsePort("8080")).toBe(8080);
  });

  it("accepts port 1", () => {
    expect(parsePort("1")).toBe(1);
  });

  it("accepts port 65535", () => {
    expect(parsePort("65535")).toBe(65535);
  });

  it("throws on port 0", () => {
    expect(() => parsePort("0")).toThrow('Invalid port "0"');
  });

  it("throws on port above 65535", () => {
    expect(() => parsePort("65536")).toThrow('Invalid port "65536"');
  });

  it("throws on negative port", () => {
    expect(() => parsePort("-1")).toThrow('Invalid port "-1"');
  });

  it("throws on non-numeric string", () => {
    expect(() => parsePort("abc")).toThrow('Invalid port "abc"');
  });

  it("throws on empty string", () => {
    expect(() => parsePort("")).toThrow('Invalid port ""');
  });

  it("truncates floating point to integer", () => {
    expect(parsePort("80.5")).toBe(80);
  });
});

describe("parseLogLevel", () => {
  it.each(["none", "error", "warning", "info", "debug", "all"] as const)(
    "accepts %s",
    (level) => {
      expect(parseLogLevel(level)).toBe(level);
    },
  );

  it("throws on invalid level", () => {
    expect(() => parseLogLevel("verbose")).toThrow(
      'Invalid log level "verbose"',
    );
  });

  it("throws on empty string", () => {
    expect(() => parseLogLevel("")).toThrow('Invalid log level ""');
  });
});

describe("isProviderName", () => {
  it.each(["openai", "claude", "codex"] as const)(
    "returns true for %s",
    (name) => {
      expect(isProviderName(name)).toBe(true);
    },
  );

  it("returns false for unknown provider", () => {
    expect(isProviderName("gemini")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isProviderName("")).toBe(false);
  });
});

describe("parseProvider", () => {
  it.each(["openai", "claude", "codex"] as const)("accepts %s", (name) => {
    expect(parseProvider(name)).toBe(name);
  });

  it("throws on invalid provider", () => {
    expect(() => parseProvider("gemini")).toThrow('Invalid provider "gemini"');
  });

  it("throws on empty string", () => {
    expect(() => parseProvider("")).toThrow('Invalid provider ""');
  });
});

describe("parseIdleTimeout", () => {
  it("parses a valid timeout", () => {
    expect(parseIdleTimeout("60")).toBe(60);
  });

  it("accepts zero (disabled)", () => {
    expect(parseIdleTimeout("0")).toBe(0);
  });

  it("throws on negative value", () => {
    expect(() => parseIdleTimeout("-1")).toThrow('Invalid idle timeout "-1"');
  });

  it("throws on non-numeric value", () => {
    expect(() => parseIdleTimeout("abc")).toThrow('Invalid idle timeout "abc"');
  });

  it("throws on empty string", () => {
    expect(() => parseIdleTimeout("")).toThrow('Invalid idle timeout ""');
  });

  it("truncates floating point to integer", () => {
    expect(parseIdleTimeout("3.5")).toBe(3);
  });
});
