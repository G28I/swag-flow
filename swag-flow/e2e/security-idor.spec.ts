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

  test("prevents rendering cached transcripts from different anonymous identities before authorization", async ({ page }) => {
    await page.goto("/");

    // Inject a cached transcript belonging to a different anonToken
    await page.evaluate(() => {
      localStorage.setItem(
        "arena_cache_unauthorized_thread_xyz",
        JSON.stringify({
          anonToken: "different_identity_token_9999",
          turns: [
            {
              id: "turn1",
              prompt: "Confidential prompt content",
              winnerModel: null,
              activeCount: 1,
              models: [{ id: "model1", name: "Model 1" }],
              responses: { modelA: { text: "Confidential response", error: null, metrics: null, isStreaming: false, messageId: "m1" } },
              promptId: "p1",
            },
          ],
        })
      );
    });

    // Navigate to unauthorized thread
    await page.goto("/?thread=unauthorized_thread_xyz");

    // Confidential prompt content MUST NOT be visible in the DOM
    const confidentialBubble = page.locator("text=Confidential prompt content");
    await expect(confidentialBubble).not.toBeVisible();
  });

  test("purges local cache when thread history load returns non-200", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const anonToken = localStorage.getItem("swag_flow_anon_token") || "token_123";
      localStorage.setItem(
        "arena_cache_unauthorized_thread_xyz",
        JSON.stringify({
          anonToken,
          turns: [
            {
              id: "turn1",
              prompt: "Private secret content",
              winnerModel: null,
              activeCount: 1,
              models: [{ id: "model1", name: "Model 1" }],
              responses: { modelA: { text: "Secret data", error: null, metrics: null, isStreaming: false, messageId: "m1" } },
              promptId: "p1",
            },
          ],
        })
      );
    });

    // Navigate to unauthorized thread URL
    await page.goto("/?thread=unauthorized_thread_xyz");

    // Wait for network response to ensure history fetch completes and purges cache
    await page.waitForTimeout(2000);

    const cachedItem = await page.evaluate(() => localStorage.getItem("arena_cache_unauthorized_thread_xyz"));
    expect(cachedItem).toBeNull();
  });
});
