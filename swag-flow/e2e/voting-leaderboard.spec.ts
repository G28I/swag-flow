import { test, expect } from "@playwright/test";

test.describe("Voting & ELO Leaderboard E2E", () => {
  test("allows voting for best model or declaring a tie", async ({ page }) => {
    await page.goto("/");

    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();

    await textarea.fill("Which is larger: 10 or 20?");
    await textarea.press("Enter");

    await page.waitForTimeout(4000);

    // Required vote control visibility & click assertion
    const voteBtn = page.locator("button:has-text('👈 Model A is better'), button:has-text('Declare Tie')").first();
    await expect(voteBtn).toBeVisible({ timeout: 10000 });
    await voteBtn.click();
    await page.waitForTimeout(1000);
  });

  test("renders the ELO leaderboard page with model rankings", async ({ page }) => {
    await page.goto("/leaderboard");

    // Verify leaderboard title and table header
    const title = page.locator("h1:has-text('Leaderboard'), h2:has-text('Leaderboard')").first();
    await expect(title).toBeVisible();

    // Verify specific leaderboard ranking container or model row renders
    const rankingTableOrGrid = page.locator("table, .grid");
    await expect(rankingTableOrGrid.first()).toBeVisible({ timeout: 5000 });
  });
});
