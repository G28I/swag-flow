import { test, expect } from "@playwright/test";

test.describe("Resilience & Provider Error Fallbacks E2E", () => {
  test("handles missing or invalid parameters gracefully", async ({ request }) => {
    const response = await request.post("/api/arena/prompt", {
      data: {}, // Missing required 'prompt'
    });

    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.error).toBeTruthy();
  });

  test("handles stream request errors gracefully", async ({ request }) => {
    const response = await request.post("/api/arena/stream", {
      data: {
        threadId: "",
        parentId: "",
        model: "",
      },
    });

    expect(response.status()).toBe(400);
  });
});
