import { test, expect } from "@playwright/test";

test.describe("Security, IDOR Protection & Cache Purge E2E", () => {
  test("denies stream access for invalid anonToken on victim thread (IDOR prevention)", async ({ request }) => {
    const response = await request.post("/api/arena/stream", {
      data: {
        threadId: "unauthorized_victim_thread_999",
        parentId: "unauthorized_victim_prompt_999",
        model: "google/gemini-2.0-flash-exp:free",
        anonToken: "attacker_anon_token_2",
      },
      headers: {
        "x-anon-token": "attacker_anon_token_2",
      },
    });

    // Should return 403 authorization failure or 404 not found
    expect([403, 404, 429]).toContain(response.status());
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

    // Navigate to unauthorized thread
    await page.goto("/?thread=unauthorized_thread_xyz");
    await page.waitForResponse((res) => res.url().includes("/api/arena/threads?id=unauthorized_thread_xyz"));

    // Cache should be purged on non-200 status
    const cachedItem = await page.evaluate(() => localStorage.getItem("arena_cache_unauthorized_thread_xyz"));
    expect(cachedItem).toBeNull();
  });

  test("prevents anonymous token impersonation of Clerk user ID during thread fork", async ({ request }) => {
    const response = await request.post("/api/arena/threads/fork", {
      data: {
        sourceThreadId: "clerk-user-private-thread-id",
        anonToken: "user_2bX9kL9999999999999", // Impersonation attempt using raw Clerk user ID string
      },
      headers: {
        "x-anon-token": "user_2bX9kL9999999999999",
      },
    });

    // Should return 403 or 404 (authorization failure) and NEVER 200
    expect([403, 404]).toContain(response.status());
  });

  test("prevents rendering cached transcripts before server ownership check even with matching anonToken", async ({ page }) => {
    await page.goto("/");

    // Inject a cached transcript with matching anonToken for thread_unauthorized_403
    await page.evaluate(() => {
      const anonToken = localStorage.getItem("swag_flow_anon_token") || "token_123";
      localStorage.setItem(
        "arena_cache_thread_unauthorized_403",
        JSON.stringify({
          anonToken,
          turns: [
            {
              id: "turn1",
              prompt: "Private secret prompt text",
              winnerModel: null,
              activeCount: 1,
              models: [{ id: "model1", name: "Model 1" }],
              responses: { modelA: { text: "Private response", error: null, metrics: null, isStreaming: false, messageId: "m1" } },
              promptId: "p1",
            },
          ],
        })
      );
    });

    await page.goto("/?thread=thread_unauthorized_403");

    // Before or during request, transcript MUST NOT be rendered
    const privateBubble = page.locator("text=Private secret prompt text");
    await expect(privateBubble).not.toBeVisible();
  });
});
