import type { ModelInfo } from "@github/copilot-sdk";
import type { CopilotService } from "../../copilot-service.js";
import type { ReasoningEffort } from "../../config.js";
import type { Logger } from "../../logger.js";

export function normalizeModelId(id: string): string {
  return id.replace(/-\d{8}$/, "").replace(/\./g, "-");
}

// Group models by family for fallback matching by grabbing everything before
// the first digit (e.g. "claude-sonnet-4-5" becomes "claude-sonnet-",
// "o3-mini" becomes "o", "gpt-5" becomes "gpt-"). The longest-prefix
// matching within the family handles disambiguation.
function extractFamily(id: string): string {
  const match = id.match(/^(.*?)\d/);
  return match?.[1] ?? id;
}

export function resolveModel(
  requestedModel: string,
  availableModels: ModelInfo[],
  logger?: Logger,
): string | undefined {
  if (availableModels.some((m) => m.id === requestedModel)) {
    return requestedModel;
  }

  const normalizedRequest = normalizeModelId(requestedModel);
  const normalizedMatch = availableModels.find(
    (m) => normalizeModelId(m.id) === normalizedRequest,
  );
  if (normalizedMatch) {
    logger?.debug(
      `Model "${requestedModel}" resolved to "${normalizedMatch.id}" (normalized match)`,
    );
    return normalizedMatch.id;
  }

  // Requested version may not exist in Copilot yet (e.g. opus 4.6 falls back to opus 4.5),
  // so fall back to the closest model in the same family.
  const requestFamily = extractFamily(normalizedRequest);
  const familyMatches = availableModels.filter(
    (m) => extractFamily(normalizeModelId(m.id)) === requestFamily,
  );

  let best: ModelInfo | undefined;
  let bestLen = 0;
  for (const m of familyMatches) {
    const norm = normalizeModelId(m.id);
    let len = 0;
    const minLen = Math.min(normalizedRequest.length, norm.length);
    while (len < minLen && normalizedRequest[len] === norm[len]) len++;
    if (len > bestLen) {
      bestLen = len;
      best = m;
    }
  }

  if (!best) return undefined;

  logger?.warn(
    `Model "${requestedModel}" not available, falling back to "${best.id}" (closest in family)`,
  );
  return best.id;
}

export type ModelResolution =
  | { ok: true; model: string; supportsReasoningEffort: boolean }
  | { ok: false; error: string };

export async function resolveModelForSession(
  service: CopilotService,
  requestedModel: string,
  config: { reasoningEffort?: ReasoningEffort | undefined },
  logger: Logger,
): Promise<ModelResolution> {
  try {
    const models = await service.listModels();
    const resolved = resolveModel(requestedModel, models, logger);
    if (!resolved) {
      return {
        ok: false,
        error: `Model "${requestedModel}" is not available. Available models: ${models.map((m) => m.id).join(", ")}`,
      };
    }

    let supportsReasoningEffort = false;
    if (config.reasoningEffort) {
      const modelInfo = models.find((m) => m.id === resolved);
      supportsReasoningEffort =
        modelInfo?.capabilities.supports.reasoningEffort ?? false;
      if (!supportsReasoningEffort) {
        logger.debug(
          `Model "${resolved}" does not support reasoning effort, ignoring config`,
        );
      }
    }

    return { ok: true, model: resolved, supportsReasoningEffort };
  } catch (err) {
    logger.warn("Failed to list models, passing model through as-is:", err);
    return { ok: true, model: requestedModel, supportsReasoningEffort: false };
  }
}
