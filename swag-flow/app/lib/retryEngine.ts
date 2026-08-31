/**
 * OpenRouter Rate-Limit Retry & Queueing Engine
 *
 * Implements exponential backoff with full jitter, bounded retries (max 3),
 * AbortSignal cancellation awareness, and per-model 429 cooldown tracking.
 */

// In-memory rate limit cooldown registry for model slugs
const modelCooldownMap = new Map<string, number>();

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  modelId?: string;
  signal?: AbortSignal;
}

/**
 * Calculates exponential backoff with full jitter to eliminate thundering herd retry storms.
 * Formula: delay = random(0, min(maxDelay, baseDelay * 2^attempt))
 */
export function calculateJitteredBackoff(
  attempt: number,
  baseDelayMs = 500,
  maxDelayMs = 8000
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const cap = Math.min(maxDelayMs, exponential);
  return Math.floor(Math.random() * cap);
}

/**
 * Parses HTTP 'Retry-After' header (seconds or HTTP date string) into milliseconds.
 */
export function parseRetryAfterHeader(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = parseInt(headerValue.trim(), 10);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(headerValue);
  if (!isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? diff : null;
  }
  return null;
}

/**
 * Checks if a specific model slug is currently on rate limit cooldown.
 */
export function isModelOnCooldown(modelId: string): boolean {
  const cooldownUntil = modelCooldownMap.get(modelId);
  if (!cooldownUntil) return false;
  if (Date.now() >= cooldownUntil) {
    modelCooldownMap.delete(modelId);
    return false;
  }
  return true;
}

/**
 * Registers rate limit cooldown for a model slug.
 */
export function setModelCooldown(modelId: string, durationMs = 10000) {
  modelCooldownMap.set(modelId, Date.now() + Math.min(60000, durationMs));
}

/**
 * Sleeps for specified delay, resolving early if AbortSignal triggers.
 */
function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      return resolve(false);
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve(true);
    }, ms);

    const onAbort = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export class RateLimitError extends Error {
  retryAfterMs: number | null;
  modelId?: string;

  constructor(message: string, retryAfterMs: number | null = null, modelId?: string) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.modelId = modelId;
  }
}

/**
 * Wraps async fetch calls in exponential backoff retries with full jitter and cancellation awareness.
 */
export async function executeWithRetryAndBackoff<T>(
  action: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500, maxDelayMs = 8000, modelId, signal } = options;

  if (modelId && isModelOnCooldown(modelId)) {
    throw new RateLimitError(
      `Model ${modelId} is currently on rate-limit cooldown. Skipping attempt for fallback.`,
      5000,
      modelId
    );
  }

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new Error("Request aborted by client");
    }

    try {
      const result = await action(attempt);

      // Handle Fetch Response objects returning 429
      if (result && typeof result === "object" && "status" in result && (result as any).status === 429) {
        const res = result as unknown as Response;
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterMs = parseRetryAfterHeader(retryAfterHeader) || 5000;

        if (modelId) {
          setModelCooldown(modelId, retryAfterMs);
        }

        if (attempt < maxRetries) {
          const jitteredDelay = Math.max(
            retryAfterMs > 0 ? Math.min(retryAfterMs, maxDelayMs) : 0,
            calculateJitteredBackoff(attempt, baseDelayMs, maxDelayMs)
          );

          const completed = await sleepWithSignal(jitteredDelay, signal);
          if (!completed || signal?.aborted) {
            throw new Error("Request aborted during rate limit backoff");
          }
          continue;
        }

        throw new RateLimitError("Rate limit 429 exceeded after bounded retries", retryAfterMs, modelId);
      }

      return result;
    } catch (err: any) {
      lastError = err;

      if (signal?.aborted || err.name === "AbortError" || err.message?.includes("aborted")) {
        throw err;
      }

      const is429 =
        err instanceof RateLimitError ||
        err.status === 429 ||
        err.statusCode === 429 ||
        err.message?.includes("429") ||
        err.message?.toLowerCase().includes("rate limit");

      if (is429 && modelId) {
        setModelCooldown(modelId, 10000);
      }

      if (is429 && attempt < maxRetries) {
        const jitteredDelay = calculateJitteredBackoff(attempt, baseDelayMs, maxDelayMs);
        const completed = await sleepWithSignal(jitteredDelay, signal);
        if (!completed || signal?.aborted) {
          throw new Error("Request aborted during rate limit backoff");
        }
        continue;
      }

      // Non-429 or exhausted retries
      throw err;
    }
  }

  throw lastError || new Error("Failed after bounded retries");
}
