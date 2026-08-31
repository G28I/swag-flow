/**
 * Real-Time Cost & Efficiency Analytics Engine
 *
 * Normalizes OpenRouter provider billing usage payloads, computes per-generation
 * efficiency metrics, preserves cost provenance, and generates comparative insights
 * for arena turns.
 */

export interface GenerationUsage {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  reasoningTokens?: number | null;
  cachedTokens?: number | null;
  costUsd?: number | null;
  costSource?: "openrouter" | "calculated" | "estimated" | "unknown";
  capturedAt?: string;
  actualModel?: string | null;
  modelRequested?: string | null;
}

export interface GenerationEfficiencyMetrics {
  ttftMs?: number | null;
  latencyMs?: number | null;
  throughputTokensPerSecond?: number | null;
  costPer1kCompletionTokens?: number | null;
  costPer1kTotalTokens?: number | null;
  usage?: GenerationUsage;
}

export interface ModelResponseEntry {
  modelId: string;
  modelName: string;
  text: string;
  error?: string | null;
  metrics?: {
    ttft?: number | null;
    latency?: number | null;
    tokensPerSec?: number | null;
    tokenCount?: number | null;
    costUsd?: number | null;
    costSource?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    reasoningTokens?: number | null;
    cachedTokens?: number | null;
    actualModel?: string | null;
  } | null;
}

export interface TurnComparisonInsights {
  cheapestModelId: string | null;
  fastestTtftModelId: string | null;
  highestThroughputModelId: string | null;
  mostTokenEfficientModelId: string | null;
}

/**
 * Normalizes OpenRouter SSE usage payloads and fallback estimates into a uniform GenerationUsage object.
 */
export function normalizeUsage(
  rawUsage: Record<string, unknown> | null | undefined,
  options: {
    modelRequested?: string;
    actualModelUsed?: string;
    fallbackOccurred?: boolean;
    costOverrideUsd?: number | null;
  } = {}
): GenerationUsage {
  const { modelRequested, actualModelUsed, costOverrideUsd } = options;

  if (!rawUsage || typeof rawUsage !== "object") {
    const isFreeModel = (actualModelUsed || modelRequested || "").toLowerCase().includes(":free");
    return {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      reasoningTokens: null,
      cachedTokens: null,
      costUsd: isFreeModel ? 0.0 : costOverrideUsd ?? null,
      costSource: isFreeModel ? "openrouter" : costOverrideUsd !== undefined && costOverrideUsd !== null ? "calculated" : "unknown",
      capturedAt: new Date().toISOString(),
      actualModel: actualModelUsed || modelRequested || null,
      modelRequested: modelRequested || null,
    };
  }

  const u = rawUsage as Record<string, unknown> & {
    prompt_tokens?: number;
    promptTokens?: number;
    completion_tokens?: number;
    completionTokens?: number;
    total_tokens?: number;
    totalTokens?: number;
    reasoning_tokens?: number;
    cost?: number;
    costUsd?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
    prompt_tokens_details?: { cached_tokens?: number };
  };

  const promptTokens = typeof u.prompt_tokens === "number" ? u.prompt_tokens : typeof u.promptTokens === "number" ? u.promptTokens : null;
  const completionTokens = typeof u.completion_tokens === "number" ? u.completion_tokens : typeof u.completionTokens === "number" ? u.completionTokens : null;
  const totalTokens = typeof u.total_tokens === "number" ? u.total_tokens : typeof u.totalTokens === "number" ? u.totalTokens : (promptTokens || 0) + (completionTokens || 0) || null;

  const reasoningTokens = typeof u.reasoning_tokens === "number" ? u.reasoning_tokens : typeof u.completion_tokens_details?.reasoning_tokens === "number" ? u.completion_tokens_details.reasoning_tokens : null;
  const cachedTokens = typeof u.prompt_tokens_details?.cached_tokens === "number" ? u.prompt_tokens_details.cached_tokens : null;

  let costUsd: number | null = null;
  let costSource: "openrouter" | "calculated" | "estimated" | "unknown" = "unknown";

  const isFreeModel = (actualModelUsed || modelRequested || "").toLowerCase().includes(":free");

  if (typeof u.cost === "number") {
    costUsd = u.cost;
    costSource = "openrouter";
  } else if (typeof u.costUsd === "number") {
    costUsd = u.costUsd;
    costSource = "openrouter";
  } else if (isFreeModel) {
    costUsd = 0.0;
    costSource = "openrouter";
  } else if (typeof costOverrideUsd === "number") {
    costUsd = costOverrideUsd;
    costSource = "calculated";
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens,
    cachedTokens,
    costUsd,
    costSource,
    capturedAt: new Date().toISOString(),
    actualModel: actualModelUsed || modelRequested || null,
    modelRequested: modelRequested || null,
  };
}

/**
 * Calculates derived efficiency metrics (cost per 1k tokens, throughput, latency ms).
 */
export function calculateEfficiencyMetrics(
  usage: GenerationUsage | null | undefined,
  ttftSec?: number | null,
  latencySec?: number | null,
  tokensPerSec?: number | null
): GenerationEfficiencyMetrics {
  const ttftMs = typeof ttftSec === "number" && ttftSec >= 0 ? Math.round(ttftSec * 1000) : null;
  const latencyMs = typeof latencySec === "number" && latencySec >= 0 ? Math.round(latencySec * 1000) : null;
  const throughputTokensPerSecond = typeof tokensPerSec === "number" && tokensPerSec >= 0 ? Math.round(tokensPerSec * 10) / 10 : null;

  let costPer1kCompletionTokens: number | null = null;
  let costPer1kTotalTokens: number | null = null;

  if (usage?.costUsd !== undefined && usage.costUsd !== null && usage.costUsd > 0) {
    if (usage.completionTokens && usage.completionTokens > 0) {
      costPer1kCompletionTokens = (usage.costUsd / usage.completionTokens) * 1000;
    }
    if (usage.totalTokens && usage.totalTokens > 0) {
      costPer1kTotalTokens = (usage.costUsd / usage.totalTokens) * 1000;
    }
  }

  return {
    ttftMs,
    latencyMs,
    throughputTokensPerSecond,
    costPer1kCompletionTokens,
    costPer1kTotalTokens,
    usage: usage || undefined,
  };
}

/**
 * Ranks models within an arena comparison turn based on observable metrics.
 * Unknown or incomplete values are left unranked without fabricating fake rankings.
 */
export function getTurnComparisonInsights(
  entries: ModelResponseEntry[]
): TurnComparisonInsights {
  const validEntries = entries.filter((e) => !e.error && e.metrics);

  let cheapestModelId: string | null = null;
  let fastestTtftModelId: string | null = null;
  let highestThroughputModelId: string | null = null;
  let mostTokenEfficientModelId: string | null = null;

  // 1. Cheapest Model (requires valid costUsd for ALL completed entries)
  const entriesWithCost = validEntries.filter(
    (e) => typeof e.metrics?.costUsd === "number" && e.metrics.costUsd >= 0
  );
  if (entriesWithCost.length === validEntries.length && validEntries.length > 1) {
    const sortedByCost = [...entriesWithCost].sort((a, b) => (a.metrics!.costUsd! - b.metrics!.costUsd!));
    cheapestModelId = sortedByCost[0].modelId;
  }

  // 2. Fastest TTFT
  const entriesWithTtft = validEntries.filter(
    (e) => typeof e.metrics?.ttft === "number" && e.metrics.ttft > 0
  );
  if (entriesWithTtft.length > 1) {
    const sortedByTtft = [...entriesWithTtft].sort((a, b) => a.metrics!.ttft! - b.metrics!.ttft!);
    fastestTtftModelId = sortedByTtft[0].modelId;
  }

  // 3. Highest Throughput
  const entriesWithThroughput = validEntries.filter(
    (e) => typeof e.metrics?.tokensPerSec === "number" && e.metrics.tokensPerSec > 0
  );
  if (entriesWithThroughput.length > 1) {
    const sortedByThroughput = [...entriesWithThroughput].sort(
      (a, b) => b.metrics!.tokensPerSec! - a.metrics!.tokensPerSec!
    );
    highestThroughputModelId = sortedByThroughput[0].modelId;
  }

  // 4. Most Token Efficient (lowest completion tokens for valid responses)
  const entriesWithTokens = validEntries.filter(
    (e) =>
      (typeof e.metrics?.completionTokens === "number" && e.metrics.completionTokens > 0) ||
      (typeof e.metrics?.tokenCount === "number" && e.metrics.tokenCount > 0)
  );
  if (entriesWithTokens.length > 1) {
    const sortedByTokens = [...entriesWithTokens].sort((a, b) => {
      const tokA = a.metrics!.completionTokens ?? a.metrics!.tokenCount ?? 999999;
      const tokB = b.metrics!.completionTokens ?? b.metrics!.tokenCount ?? 999999;
      return tokA - tokB;
    });
    mostTokenEfficientModelId = sortedByTokens[0].modelId;
  }

  return {
    cheapestModelId,
    fastestTtftModelId,
    highestThroughputModelId,
    mostTokenEfficientModelId,
  };
}
