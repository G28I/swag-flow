/**
 * OpenRouter Rate-Limit Retry & Queueing Engine
 *
 * Implements exponential backoff with full jitter, bounded retries (max 3),
 * AbortSignal cancellation awareness, Retry-After header parsing, pre-stream
 * safety checks, and multi-dimensional cooldown tracking.
 *
 * Note: Cooldown state is process-local and in-memory. In multi-instance / replica
 * deployments, cooldowns are enforced per-instance rather than globally distributed.
 */

export type RetryErrorKind =
  | "ABORTED"
  | "RETRY_EXHAUSTED"
  | "RATE_LIMITED"
  | "NON_RETRYABLE"
  | "NETWORK_ERROR";

export class RetryEngineError extends Error {
  kind: RetryErrorKind;
  status?: number;
  retryAfterMs?: number | null;
  cooldownKey?: string;

  constructor(
    message: string,
    kind: RetryErrorKind,
    status?: number,
    retryAfterMs?: number | null,
    cooldownKey?: string
  ) {
    super(message);
    this.name = "RetryEngineError";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.cooldownKey = cooldownKey;
  }
}

export interface RetryConfig {
  maxRetries?: number; // Number of retries after initial attempt (default 3 => total up to 4 attempts)
  baseDelayMs?: number; // Base exponential delay (default 500ms)
  maxDelayMs?: number; // Upper bound delay (default 8000ms)
  maxCooldownMs?: number; // Upper bound cooldown (default 60000ms)
  randomFn?: () => number; // Random generator function for deterministic testing
}

export const DEFAULT_RETRY_CONFIG: Required<Omit<RetryConfig, "randomFn">> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  maxCooldownMs: 60000,
};

// Process-local cooldown registry: key -> expiration timestamp (ms)
const cooldownRegistry = new Map<string, number>();

/**
 * Constructs a multi-dimensional cooldown key matching OpenRouter provider/model scope.
 * Format: "provider:model" (e.g. "openrouter:google/gemini-2.0-flash-exp:free")
 */
export function getCooldownKey(provider: string, model: string): string {
  const p = (provider || "openrouter").toLowerCase().trim();
  const m = (model || "unknown").trim();
  return `${p}:${m}`;
}

/**
 * Registers an active rate limit cooldown for a provider/model key.
 */
export function registerCooldown(key: string, durationMs: number): void {
  if (!key) return;
  const expiresAt = Date.now() + Math.max(0, durationMs);
  cooldownRegistry.set(key, expiresAt);
}

/**
 * Checks if a provider/model key is currently on rate limit cooldown.
 */
export function isModelOnCooldown(key: string): boolean {
  if (!key) return false;
  const expiresAt = cooldownRegistry.get(key);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    cooldownRegistry.delete(key);
    return false;
  }
  return true;
}

/**
 * Calculates remaining cooldown duration in milliseconds.
 */
export function getCooldownRemaining(key: string): number {
  if (!key) return 0;
  const expiresAt = cooldownRegistry.get(key);
  if (!expiresAt) return 0;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) {
    cooldownRegistry.delete(key);
    return 0;
  }
  return remaining;
}

/**
 * Clears all active cooldowns (useful for test isolation).
 */
export function clearAllCooldowns(): void {
  cooldownRegistry.clear();
}

/**
 * Parses HTTP Retry-After header value into milliseconds.
 * Supports both delta-seconds (e.g. "12") and HTTP-date strings (e.g. "Wed, 21 Oct 2026 07:28:00 GMT").
 */
export function parseRetryAfterHeader(headerValue: string | null | undefined, maxCooldownMs: number = 60000): number | null {
  if (!headerValue || typeof headerValue !== "string") return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;

  // 1. Numeric seconds
  const numericSeconds = Number(trimmed);
  if (!isNaN(numericSeconds) && numericSeconds >= 0) {
    const ms = numericSeconds * 1000;
    return Math.min(ms, maxCooldownMs);
  }

  // 2. HTTP-Date
  const dateMs = Date.parse(trimmed);
  if (!isNaN(dateMs)) {
    const deltaMs = dateMs - Date.now();
    return Math.min(Math.max(0, deltaMs), maxCooldownMs);
  }

  return null;
}

/**
 * Calculates exponential backoff with full jitter to avoid thundering herd.
 * Formula: random(0, min(maxDelayMs, baseDelayMs * 2^attempt))
 */
export function calculateJitteredBackoff(
  attempt: number,
  baseDelayMs: number = 500,
  maxDelayMs: number = 8000,
  randomFn: () => number = Math.random
): number {
  const expFactor = Math.pow(2, Math.max(0, attempt));
  const maxTempDelay = Math.min(maxDelayMs, baseDelayMs * expFactor);
  const rand = typeof randomFn === "function" ? randomFn() : Math.random();
  return Math.floor(rand * maxTempDelay);
}

/**
 * Helper to sleep with AbortSignal cancellation support.
 */
export function delayWithAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new RetryEngineError("Request aborted by client during retry delay", "ABORTED"));
    }

    let timer: NodeJS.Timeout | null = null;

    const onAbort = () => {
      if (timer) clearTimeout(timer);
      reject(new RetryEngineError("Request aborted by client during retry delay", "ABORTED"));
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, Math.max(0, ms));
  });
}

/**
 * Wraps an async fetch/action call with rate-limit retry, full-jitter exponential backoff,
 * pre-call cooldown checks, and cancellation support.
 */
export async function executeWithRetryAndBackoff<T>(
  action: (attemptIndex: number) => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    maxCooldownMs?: number;
    cooldownKey?: string;
    signal?: AbortSignal | null;
    randomFn?: () => number;
    onBackoff?: (attempt: number, delayMs: number) => void;
    streamStarted?: boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_RETRY_CONFIG.maxRetries,
    baseDelayMs = DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs = DEFAULT_RETRY_CONFIG.maxDelayMs,
    maxCooldownMs = DEFAULT_RETRY_CONFIG.maxCooldownMs,
    cooldownKey,
    signal,
    randomFn = Math.random,
    onBackoff,
    streamStarted = false,
  } = options;

  // 1. Cancellation check before starting initial attempt
  if (signal?.aborted) {
    throw new RetryEngineError("Request aborted by client before attempt", "ABORTED");
  }

  // 2. Pre-call cooldown check
  if (cooldownKey && isModelOnCooldown(cooldownKey)) {
    const remainingMs = getCooldownRemaining(cooldownKey);
    throw new RetryEngineError(
      `Model/provider "${cooldownKey}" is currently on rate-limit cooldown. Please retry in ${Math.ceil(remainingMs / 1000)}s.`,
      "RATE_LIMITED",
      429,
      remainingMs,
      cooldownKey
    );
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new RetryEngineError("Request aborted by client", "ABORTED");
    }

    try {
      const result = await action(attempt);

      if (result && typeof result === "object" && "status" in result && typeof (result as Record<string, unknown>).status === "number") {
        const res = result as unknown as Response;

        if (res.status === 429) {
          if (streamStarted) {
            throw new RetryEngineError(
              "Rate limit 429 received after stream body consumption started. Replay suppressed for stream safety.",
              "NON_RETRYABLE",
              429,
              null,
              cooldownKey
            );
          }

          const retryAfterHeader = res.headers.get("retry-after");
          const serverRetryAfterMs = parseRetryAfterHeader(retryAfterHeader, maxCooldownMs);

          const cooldownMs = serverRetryAfterMs !== null ? serverRetryAfterMs : 10000;
          if (cooldownKey) {
            registerCooldown(cooldownKey, cooldownMs);
          }

          if (attempt < maxRetries) {
            const delayMs =
              serverRetryAfterMs !== null && serverRetryAfterMs > 0
                ? Math.min(maxDelayMs, serverRetryAfterMs)
                : calculateJitteredBackoff(attempt, baseDelayMs, maxDelayMs, randomFn);

            if (onBackoff) {
              onBackoff(attempt, delayMs);
            }

            await delayWithAbort(delayMs, signal);
            continue;
          }

          if (cooldownKey) {
            const existingReset = cooldownRegistry.get(cooldownKey);
            const remaining = existingReset ? existingReset - Date.now() : 0;
            if (!existingReset || remaining < cooldownMs) {
              registerCooldown(cooldownKey, cooldownMs);
            }
          }

          throw new RetryEngineError(
            `Rate limit 429 persisted after ${maxRetries + 1} attempts (${maxRetries} retries). Exiting for model fallback.`,
            "RETRY_EXHAUSTED",
            429,
            cooldownMs,
            cooldownKey
          );
        }
      }

      // On successful response, remove any active cooldown for this model key
      if (cooldownKey) {
        cooldownRegistry.delete(cooldownKey);
      }

      return result;
    } catch (err: unknown) {
      lastError = err;

      if (err instanceof RetryEngineError && err.kind === "ABORTED") {
        throw err;
      }

      const errObj = err as Record<string, unknown> | null;
      const errName = typeof errObj?.name === "string" ? errObj.name : "";
      const errMessage = typeof errObj?.message === "string" ? errObj.message : "";
      const errStatus = typeof errObj?.status === "number" ? errObj.status : typeof errObj?.statusCode === "number" ? errObj.statusCode : null;

      if (signal?.aborted || errName === "AbortError" || errMessage.includes("aborted")) {
        throw new RetryEngineError("Request aborted by client", "ABORTED");
      }

      const is429 =
        errStatus === 429 ||
        (err instanceof RetryEngineError && err.status === 429) ||
        errMessage.includes("429");

      if (is429) {
        if (streamStarted) {
          throw new RetryEngineError(
            "Rate limit 429 received after stream body consumption started. Replay suppressed.",
            "NON_RETRYABLE",
            429,
            null,
            cooldownKey
          );
        }

        const cooldownMs = (err as RetryEngineError)?.retryAfterMs ?? 10000;
        if (cooldownKey) {
          registerCooldown(cooldownKey, cooldownMs);
        }

        if (attempt < maxRetries) {
          const delayMs = calculateJitteredBackoff(attempt, baseDelayMs, maxDelayMs, randomFn);
          if (onBackoff) {
            onBackoff(attempt, delayMs);
          }
          await delayWithAbort(delayMs, signal);
          continue;
        }

        throw new RetryEngineError(
          `Rate limit 429 persisted after ${maxRetries + 1} attempts (${maxRetries} retries). Exiting for model fallback.`,
          "RETRY_EXHAUSTED",
          429,
          cooldownMs,
          cooldownKey
        );
      }

      if (attempt === maxRetries) {
        throw err;
      }

      const delayMs = calculateJitteredBackoff(attempt, baseDelayMs, maxDelayMs, randomFn);
      if (onBackoff) {
        onBackoff(attempt, delayMs);
      }
      await delayWithAbort(delayMs, signal);
    }
  }

  throw lastError || new Error("Retry operation failed");
}
