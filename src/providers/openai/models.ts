import type { FastifyRequest, FastifyReply } from "fastify";
import type { AppContext } from "../../context.js";
import { currentTimestamp } from "./schemas.js";
import type { ModelsResponse } from "./schemas.js";
import { sendOpenAIError } from "../shared/errors.js";

export function createModelsHandler({ service, logger }: AppContext) {
  return async function handleModels(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const models = await service.listModels();

      const response = {
        object: "list",
        data: models.map((m) => ({
          id: m.id,
          object: "model" as const,
          created: currentTimestamp(),
          owned_by: "github-copilot",
        })),
      } satisfies ModelsResponse;

      reply.send(response);
    } catch (err) {
      logger.error("Couldn't fetch models:", err);
      sendOpenAIError(reply, 500, "api_error", "Failed to list models");
    }
  };
}
