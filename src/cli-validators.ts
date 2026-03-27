import { LEVEL_PRIORITY, type LogLevel } from "#/logger.js";
import { PROVIDER_NAMES, type ProviderName } from "#/schemas/config.js";

const VALID_LOG_LEVELS = Object.keys(LEVEL_PRIORITY) as LogLevel[];

function isLogLevel(value: string): value is LogLevel {
  return value in LEVEL_PRIORITY;
}

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value);
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
  if (!isLogLevel(value)) {
    throw new Error(
      `Invalid log level "${value}". Valid: ${VALID_LOG_LEVELS.join(", ")}`,
    );
  }
  return value;
}

export function parseProvider(value: string): ProviderName {
  if (!isProviderName(value)) {
    throw new Error(
      `Invalid provider "${value}". Valid: ${PROVIDER_NAMES.join(", ")}`,
    );
  }
  return value;
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
