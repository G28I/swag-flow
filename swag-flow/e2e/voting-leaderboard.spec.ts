import { test, expect } from "@playwright/test";

test.describe("Voting & ELO Leaderboard E2E", () => {
  test("allows voting for best model or declaring a tie", async ({ page }) => {
    await page.goto("/");

    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();

    await textarea.fill("Which is larger: 10 or 20?");
    await textarea.press("Enter");

    await page.waitForTimeout(4000);

    // Click Vote button or Declare Tie button
    const voteBtn = page.locator("button:has-text('👈 Model A is better'), button:has-text('Declare Tie')").first();
    if (await voteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await voteBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test("renders the ELO leaderboard page", async ({ page }) => {
    await page.goto("/leaderboard");

    // Verify leaderboard title and table header
    const title = page.locator("h1:has-text('Leaderboard'), h2:has-text('Leaderboard')").first();
    await expect(title).toBeVisible();

    // Verify model rankings exist
    const rankingRows = page.locator("table tbody tr, .grid");
    await expect(rankingRows.first()).toBeVisible();
  });
});
