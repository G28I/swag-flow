import { test, expect } from "@playwright/test";

test.describe("Bug Report Feature", () => {
  test("opens Bug Report Modal when clicking Bug icon and submits report", async ({ page }) => {
    await page.goto("/");

    // Locate and click Bug Report button
    const bugButton = page.locator('button[aria-label="Report a Bug"]');
    await expect(bugButton).toBeVisible();
    await bugButton.click();

    // Verify modal elements
    const modalTitle = page.locator("#bug-modal-title");
    await expect(modalTitle).toHaveText("Report a Bug");

    // Select category and enter description
    await page.click("text=UI / Visual");
    await page.fill("#bug-description", "E2E Test: UI layout alignment check.");

    // Submit report
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify success feedback
    await expect(page.locator("text=Thank You!")).toBeVisible();
  });
});
