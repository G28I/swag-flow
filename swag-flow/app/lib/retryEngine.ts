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
 * Calculates exponential backoff with full jitter to eliminate thundering herd retry storms.
 * Formula: delay = random(0, min(maxDelay, baseDelay * 2^attempt))
 */
export function calculateJitteredBackoff(
  attempt: number,
  baseDelayMs = DEFAULT_RETRY_CONFIG.baseDelayMs,
  maxDelayMs = DEFAULT_RETRY_CONFIG.maxDelayMs,
  randomFn: () => number = Math.random
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const upperBound = Math.min(maxDelayMs, exponential);
  const delay = Math.floor(randomFn() * upperBound);
  return Math.max(0, Math.min(maxDelayMs, delay));
}

/**
 * Parses HTTP 'Retry-After' header (seconds integer or HTTP-date string) into milliseconds.
 * Clamps result to maxCooldownMs to prevent infinite server delays.
 */
export function parseRetryAfterHeader(
  headerValue: string | null | undefined,
  maxCooldownMs = DEFAULT_RETRY_CONFIG.maxCooldownMs
): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;

  // 1. Integer seconds format (e.g., "12")
  const seconds = parseInt(trimmed, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    const ms = seconds * 1000;
    return Math.min(maxCooldownMs, ms);
  }

  // 2. HTTP-date format (e.g., "Wed, 21 Oct 2026 07:28:00 GMT")
  const dateMs = Date.parse(trimmed);
  if (!isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    if (diff <= 0) return 0;
    return Math.min(maxCooldownMs, diff);
  }

  return null;
}

/**
 * Cancellation-aware abortable delay helper.
 * Immediately rejects/exits when signal.aborted is triggered.
 */
export async function delayWithAbort(
  delayMs: number,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    throw new RetryEngineError("Request aborted by client", "ABORTED");
  }

  if (delayMs <= 0) return;

  return new Promise<void>((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;

    const onAbort = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new RetryEngineError("Request aborted by client during retry delay", "ABORTED"));
    };

    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export interface ExecuteRetryOptions extends RetryConfig {
  cooldownKey?: string;
  signal?: AbortSignal;
  streamStarted?: boolean; // Streaming safety flag: true if body bytes have already been consumed
  onBackoff?: (attempt: number, delayMs: number) => void;
}

/**
 * Wraps OpenRouter requests in exponential backoff retries with full jitter,
 * cancellation awareness, Retry-After header parsing, and pre-stream safety rules.
 */
export async function executeWithRetryAndBackoff<T>(
  action: (attempt: number) => Promise<T>,
  options: ExecuteRetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_RETRY_CONFIG.maxRetries,
    baseDelayMs = DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs = DEFAULT_RETRY_CONFIG.maxDelayMs,
    maxCooldownMs = DEFAULT_RETRY_CONFIG.maxCooldownMs,
    randomFn = Math.random,
    cooldownKey,
    signal,
    streamStarted = false,
    onBackoff,
  } = options;

  // 1. Check if provider/model is already on cooldown
  if (cooldownKey && isModelOnCooldown(cooldownKey)) {
    const remaining = getCooldownRemaining(cooldownKey);
    throw new RetryEngineError(
      `Model/Provider '${cooldownKey}' is currently on rate limit cooldown (${remaining}ms remaining). Skipping for fallback.`,
      "RATE_LIMITED",
      429,
      remaining,
      cooldownKey
    );
  }

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 2. Cancellation check before starting attempt
    if (signal?.aborted) {
      throw new RetryEngineError("Request aborted by client before attempt", "ABORTED");
    }

    try {
      const result = await action(attempt);

      // Inspect Response status for 429
      if (result && typeof result === "object" && "status" in result && typeof (result as any).status === "number") {
        const res = result as unknown as Response;

        if (res.status === 429) {
          // Streaming Safety Rule: Never retry a request after body stream consumption has started
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
            // Determine delay: prefer server-provided Retry-After delay if valid, else calculate full jitter backoff
            const delayMs =
              serverRetryAfterMs !== null && serverRetryAfterMs > 0
                ? Math.min(maxDelayMs, serverRetryAfterMs)
                : calculateJitteredBackoff(attempt, baseDelayMs, maxDelayMs, randomFn);

            if (onBackoff) {
              onBackoff(attempt, delayMs);
            }

            // Cancellation-aware wait
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
      }

      return result;
    } catch (err: any) {
      lastError = err;

      // Immediately propagate cancellation errors without retrying or fallback errors
      if (err instanceof RetryEngineError && err.kind === "ABORTED") {
        throw err;
      }
      if (signal?.aborted || err.name === "AbortError" || err.message?.includes("aborted")) {
        throw new RetryEngineError("Request aborted by client", "ABORTED");
      }

      const is429 =
        err?.status === 429 ||
        err?.statusCode === 429 ||
        (err instanceof RetryEngineError && err.status === 429) ||
        err?.message?.includes("429");

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

        if (cooldownKey) {
          registerCooldown(cooldownKey, 10000);
        }

        if (attempt < maxRetries) {
          const delayMs = calculateJitteredBackoff(attempt, baseDelayMs, maxDelayMs, randomFn);
          await delayWithAbort(delayMs, signal);
          continue;
        }

        throw new RetryEngineError(
          `Rate limit 429 persisted after ${maxRetries} retries`,
          "RETRY_EXHAUSTED",
          429,
          10000,
          cooldownKey
        );
      }

      // Non-429 errors (401, 403, 400, 500, network errors) are NOT retried
      throw err instanceof RetryEngineError
        ? err
        : new RetryEngineError(
            err.message || "Non-retryable network error",
            "NON_RETRYABLE",
            err.status,
            null,
            cooldownKey
          );
    }
  }

  throw (
    lastError ||
    new RetryEngineError("Failed after bounded retries", "RETRY_EXHAUSTED", 429, null, cooldownKey)
  );
}
