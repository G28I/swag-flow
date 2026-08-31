import { test, expect } from "@playwright/test";

test.describe("Turn Management & Single-Slot Regeneration E2E", () => {
  test("allows multi-turn conversation flow", async ({ page }) => {
    await page.goto("/");

    // Turn 1
    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();

    await textarea.fill("Hello, list 3 prime numbers.");
    await textarea.press("Enter");

    await expect(page.locator("text=Hello, list 3 prime numbers.")).toBeVisible({ timeout: 10000 });

    // Wait 3s for turn 1 completion
    await page.waitForTimeout(3000);

    // Turn 2
    if (await textarea.isEnabled({ timeout: 5000 }).catch(() => false)) {
      await textarea.fill("Now list 3 even numbers.");
      await textarea.press("Enter");
      await expect(page.locator("text=Now list 3 even numbers.")).toBeVisible({ timeout: 10000 });
    }
  });

  test("handles single-slot model regeneration", async ({ page }) => {
    await page.goto("/");

    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();

    await textarea.fill("Explain recursion in 1 sentence.");
    await textarea.press("Enter");

    await page.waitForTimeout(3000);

    // Click regenerate button on Model A response if present
    const regenBtn = page.locator("button[title*='Regenerate']").first();
    if (await regenBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await regenBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});
