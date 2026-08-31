import { test, expect } from "@playwright/test";

test.describe("Security, IDOR Protection & Cache Purge E2E", () => {
  test("denies stream access for invalid anonToken (IDOR prevention)", async ({ request }) => {
    const response = await request.post("/api/arena/stream", {
      data: {
        threadId: "invalid-thread-id-12345",
        parentId: "invalid-parent-id-67890",
        model: "google/gemini-2.0-flash-exp:free",
        anonToken: "unauthorized_token_attempt",
      },
      headers: {
        "x-anon-token": "unauthorized_token_attempt",
      },
    });

    // Should return 404 or 403 authorization failure
    expect([403, 404]).toContain(response.status());
  });

  test("purges local cache when thread history load returns non-200", async ({ page }) => {
    // Inject cached turn state into localStorage for unauthorized thread ID
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "arena_cache_unauthorized_thread_xyz",
        JSON.stringify([
          {
            id: "turn1",
            prompt: "Private secret content",
            winnerModel: null,
            activeCount: 1,
            models: [{ id: "model1", name: "Model 1" }],
            responses: { modelA: { text: "Secret data", error: null, metrics: null, isStreaming: false, messageId: "m1" } },
            promptId: "p1",
          },
        ])
      );
    });

    // Navigate to unauthorized thread URL
    await page.goto("/?thread=unauthorized_thread_xyz");

    // Wait for network response or timeout to ensure history fetch completes and purges cache
    await page.waitForTimeout(2000);

    const cachedItem = await page.evaluate(() => localStorage.getItem("arena_cache_unauthorized_thread_xyz"));
    expect(cachedItem).toBeNull();
  });
});
