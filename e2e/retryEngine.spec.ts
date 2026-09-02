import { test, expect } from "@playwright/test";
import {
  calculateJitteredBackoff,
  parseRetryAfterHeader,
  delayWithAbort,
  getCooldownKey,
  registerCooldown,
  isModelOnCooldown,
  getCooldownRemaining,
  clearAllCooldowns,
  executeWithRetryAndBackoff,
  RetryEngineError,
} from "../app/lib/retryEngine";

test.describe("OpenRouter Rate-Limit Retry Engine Specifications", () => {
  test.beforeEach(() => {
    clearAllCooldowns();
  });

  test("Phase 3: Exponential Full Jitter Backoff bounds", () => {
    // Upper bound test with randomFn = 0.999
    const delayMax = calculateJitteredBackoff(0, 500, 8000, () => 0.999);
    expect(delayMax).toBe(499);

    const delayMin = calculateJitteredBackoff(0, 500, 8000, () => 0);
    expect(delayMin).toBe(0);

    // Attempt 1 doubles upper bound (1000)
    const delayAttempt1 = calculateJitteredBackoff(1, 500, 8000, () => 0.999);
    expect(delayAttempt1).toBe(999);

    // Max cap bounds
    const delayCap = calculateJitteredBackoff(10, 500, 8000, () => 0.999);
    expect(delayCap).toBe(7992);
  });

  test("Phase 4: Retry-After Header Parsing", () => {
    expect(parseRetryAfterHeader("12")).toBe(12000);
    expect(parseRetryAfterHeader("0")).toBe(0);

    const futureDate = new Date(Date.now() + 15000).toUTCString();
    const ms = parseRetryAfterHeader(futureDate);
    expect(ms).toBeGreaterThan(10000);
    expect(ms).toBeLessThanOrEqual(16000);

    const pastDate = new Date(Date.now() - 5000).toUTCString();
    expect(parseRetryAfterHeader(pastDate)).toBe(0);

    expect(parseRetryAfterHeader(null)).toBeNull();
    expect(parseRetryAfterHeader("invalid_header")).toBeNull();

    expect(parseRetryAfterHeader("99999", 60000)).toBe(60000);
  });

  test("Phase 5: Cancellation-Aware Waiting", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(delayWithAbort(1000, controller.signal)).rejects.toThrow("Request aborted by client");

    const activeController = new AbortController();
    const promise = delayWithAbort(5000, activeController.signal);
    setTimeout(() => activeController.abort(), 50);
    await expect(promise).rejects.toThrow("Request aborted by client during retry delay");
  });

  test("Phase 8: Multi-Dimensional Cooldown Tracking", async () => {
    const key = getCooldownKey("openrouter", "google/gemini-2.0-flash-exp:free");
    expect(isModelOnCooldown(key)).toBe(false);

    registerCooldown(key, 5000);
    expect(isModelOnCooldown(key)).toBe(true);
    expect(getCooldownRemaining(key)).toBeGreaterThan(0);
  });

  test("Phase 7 & 10: Retry Policy & Pre-stream vs Post-stream Rules", async () => {
    let attempts = 0;
    const action = async () => {
      attempts++;
      if (attempts <= 2) {
        return new Response(JSON.stringify({ error: "rate limit" }), {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const res = await executeWithRetryAndBackoff(action, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
      cooldownKey: "openrouter:test-model",
    });

    expect(attempts).toBe(3);
    expect(res.status).toBe(200);
  });

  test("Phase 6: Streaming safety rule suppresses retry after stream start", async () => {
    const action = async () =>
      new Response(JSON.stringify({ error: "rate limit mid stream" }), { status: 429 });

    await expect(
      executeWithRetryAndBackoff(action, {
        maxRetries: 3,
        streamStarted: true,
      })
    ).rejects.toThrow("Rate limit 429 received after stream body consumption started");
  });

  test("Phase 11: Watchdog suspension on backoff triggers onBackoff callback", async () => {
    let attempts = 0;
    let backoffCalled = false;

    const action = async () => {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ error: "rate limit" }), {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const res = await executeWithRetryAndBackoff(action, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
      cooldownKey: "openrouter:test-watchdog",
      onBackoff: () => {
        backoffCalled = true;
      },
    });

    expect(attempts).toBe(2);
    expect(backoffCalled).toBe(true);
    expect(res.status).toBe(200);
  });
});
