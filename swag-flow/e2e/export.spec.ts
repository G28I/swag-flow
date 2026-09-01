import { test, expect } from "@playwright/test";

test.describe("Multi-Format Export E2E", () => {
  test("opens export modal and renders live Markdown report preview", async ({ page }) => {
    await page.goto("/");

    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();

    await textarea.fill("Compare speed of light and speed of sound.");
    await textarea.press("Enter");

    await page.waitForTimeout(3000);

    // Click Export Report button in top subheader
    const exportBtn = page.locator("button:has-text('Export Report')").first();
    await expect(exportBtn).toBeVisible({ timeout: 5000 });
    await exportBtn.click();

    // Verify Export Modal opens
    const modalTitle = page.locator("text=Export Comparison Report");
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    // Verify scope buttons exist
    const fullThreadBtn = page.locator("button:has-text('Full Thread')");
    await expect(fullThreadBtn).toBeVisible();

    // Verify export format options exist
    await expect(page.locator("button:has-text('Markdown')")).toBeVisible();
    await expect(page.locator("button:has-text('JSON Payload')")).toBeVisible();
    await expect(page.locator("button:has-text('Print / Save PDF')")).toBeVisible();

    // Verify live preview renders
    const previewContainer = page.locator("text=Live Report Preview");
    await expect(previewContainer).toBeVisible();
  });
});
