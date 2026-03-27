import type { FastifyReply } from "fastify";
import type { z } from "zod";
import type { Logger } from "#/logger.js";

type ErrorType = "invalid_request_error" | "api_error";
type SendError = (
  reply: FastifyReply,
  status: number,
  type: ErrorType,
  message: string,
) => void;

export function sendOpenAIError(
  reply: FastifyReply,
  status: number,
  type: ErrorType,
  message: string,
): void {
  reply.status(status).send({ error: { message, type } });
}

export function sendAnthropicError(
  reply: FastifyReply,
  status: number,
  type: ErrorType,
  message: string,
): void {
  reply.status(status).send({
    type: "error",
    error: { type, message },
  });
}

export function validateRequest<T>(
  schema: z.ZodType<T>,
  body: unknown,
  reply: FastifyReply,
  sendError: SendError,
  logger: Logger,
): T | undefined {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const firstIssue = result.error.issues[0];
  const message = firstIssue?.message ?? "Invalid request body";
  const path = firstIssue?.path.join(".") || "root";
  logger.warn(`Schema validation failed: ${message} (path: ${path})`);
  sendError(reply, 400, "invalid_request_error", message);
  return undefined;
}
