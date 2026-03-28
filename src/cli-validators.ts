import { z } from "zod";
import { LOG_LEVELS, type LogLevel } from "#/logger.js";
import { PROVIDER_NAMES, type ProviderName } from "#/schemas/config.js";

const LogLevelSchema = z.enum(LOG_LEVELS);
const ProviderNameSchema = z.enum(PROVIDER_NAMES);

export function isProviderName(value: string): value is ProviderName {
  return ProviderNameSchema.safeParse(value).success;
}

const MAX_PORT = 65535;

export function parsePort(value: string): number {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`Invalid port "${value}". Must be 1-${String(MAX_PORT)}.`);
  }
  return port;
}

export function parseLogLevel(value: string): LogLevel {
  const result = LogLevelSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid log level "${value}". Valid: ${LOG_LEVELS.join(", ")}`,
    );
  }
  return result.data;
}

export function parseProvider(value: string): ProviderName {
  const result = ProviderNameSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid provider "${value}". Valid: ${PROVIDER_NAMES.join(", ")}`,
    );
  }
  return result.data;
}

export function parseIdleTimeout(value: string): number {
  const minutes = parseInt(value, 10);
  if (isNaN(minutes) || minutes < 0) {
    throw new Error(
      `Invalid idle timeout "${value}". Must be a non-negative integer (minutes).`,
    );
  }
  return minutes;
}
