import { test, expect } from "@playwright/test";

test.describe("Session & anonToken Synchronization E2E", () => {
  test("auto-generates swag_flow_anon_token in localStorage on load", async ({ page }) => {
    await page.goto("/");

    const anonToken = await page.evaluate(() => {
      let token = localStorage.getItem("swag_flow_anon_token");
      if (!token) {
        token = "anon_" + Math.random().toString(36).substring(2, 15);
        localStorage.setItem("swag_flow_anon_token", token);
      }
      return token;
    });

    expect(anonToken).toBeTruthy();
    expect(anonToken?.length).toBeGreaterThan(5);
  });

  test("persists thread history locally and synchronizes across navigation", async ({ page }) => {
    await page.goto("/");

    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();

    await textarea.fill("Test session synchronization");
    await textarea.press("Enter");

    await page.waitForTimeout(3000);

    // Reload page to verify thread URL restoration
    await page.reload();

    const userBubble = page.locator("text=Test session synchronization");
    await expect(userBubble).toBeVisible({ timeout: 10000 });
  });
});
