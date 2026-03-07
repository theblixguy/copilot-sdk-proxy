import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import type { AppContext } from "../src/context.js";
import type { Provider } from "../src/providers/types.js";
import { Logger } from "../src/logger.js";
import { Stats } from "../src/stats.js";

const noopProvider: Provider = {
  name: "test",
  routes: [],
  register() {},
};

function createCtx(
  pingImpl: AppContext["service"]["ping"],
): AppContext {
  return {
    service: { ping: pingImpl } as unknown as AppContext["service"],
    logger: new Logger("none"),
    config: {
      mcpServers: {},
      allowedCliTools: [],
      bodyLimit: 10 * 1024 * 1024,
      autoApprovePermissions: true,
    },
    port: 0,
    stats: new Stats(),
  };
}

describe("GET /health", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with status ok when ping succeeds", async () => {
    const ctx = createCtx(() =>
      Promise.resolve({ message: "health", timestamp: 1000 }),
    );
    app = await createServer(ctx, noopProvider);

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", message: "health", timestamp: 1000 });
  });

  it("returns 503 with error message when ping fails", async () => {
    const ctx = createCtx(() =>
      Promise.reject(new Error("connection lost")),
    );
    app = await createServer(ctx, noopProvider);

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "error", message: "connection lost" });
  });

  it("returns 503 with fallback message for non-Error throws", async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const ctx = createCtx(() => Promise.reject("something"));
    app = await createServer(ctx, noopProvider);

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "error", message: "Unknown error" });
  });
});
