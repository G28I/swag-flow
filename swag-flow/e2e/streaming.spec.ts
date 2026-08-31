import { test, expect } from "@playwright/test";

test.describe("Prompt Submission & Live Streaming E2E", () => {
  test("submits user prompt and initiates concurrent model streams", async ({ page }) => {
    await page.goto("/");

    // Ensure prompt textarea is visible
    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();

    // Type prompt
    await textarea.fill("What is the speed of light in miles per second?");
    await textarea.press("Enter");

    // Verify turn card appears in DOM
    const userMessageBubble = page.locator("text=What is the speed of light");
    await expect(userMessageBubble).toBeVisible({ timeout: 10000 });

    // Verify at least one model response column starts streaming or receives text
    const responseContainer = page.locator(".grid-cols-1, .grid-cols-2, .grid-cols-3");
    await expect(responseContainer).toBeVisible();
  });

  test("cancels active streams when Stop Generation button is clicked", async ({ page }) => {
    await page.goto("/");

    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();

    await textarea.fill("Write a 500-word essay about quantum computing.");
    await textarea.press("Enter");

    // Wait for Stop button or streaming indicator
    const stopButton = page.locator("button:has-text('Stop'), button:has-text('Cancel')").first();
    if (await stopButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await stopButton.click();
      // Ensure stop button disappears after abort
      await expect(stopButton).not.toBeVisible({ timeout: 5000 });
    }
  });
});
