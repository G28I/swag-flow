import { test, expect } from "@playwright/test";

test.describe("Phase 1: Legal & Compliance", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to simulate fresh user visit
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test("Privacy Policy page (/privacy) displays actual data practices and controls", async ({
    page,
  }) => {
    await page.goto("/privacy");

    // Header and title
    await expect(page.locator("h1")).toHaveText("Privacy Policy");
    await expect(page.getByText("Privacy & Data Transparency")).toBeVisible();

    // Verify key documented data practices
    await expect(page.getByText("Authentication & Identity")).toBeVisible();
    await expect(page.getByText("swag_flow_anon_token").first()).toBeVisible();
    await expect(page.getByText("Prompts & Model Responses")).toBeVisible();
    await expect(page.getByText("Benchmark Votes & Telemetry")).toBeVisible();
    await expect(page.getByText("OpenRouter:")).toBeVisible();

    // Verify Cookie Settings modal triggers from privacy policy
    const cookieSettingsBtn = page.getByRole("button", { name: "Cookie Settings" });
    await expect(cookieSettingsBtn).toBeVisible();
    await cookieSettingsBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#cookie-preferences-title")).toHaveText("Cookie & Storage Settings");
    await expect(dialog.getByText("Strictly Necessary", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Functional Storage (Local Drafts)")).toBeVisible();
    await expect(dialog.getByText("Analytics & Performance Telemetry")).toBeVisible();

    // Close modal
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // Back to Arena link
    const backBtn = page.getByRole("link", { name: "Back to Arena" });
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(page).toHaveURL("/");
  });

  test("Terms of Service page (/terms) displays acceptable use and AI disclaimers", async ({
    page,
  }) => {
    await page.goto("/terms");

    // Header and title
    await expect(page.locator("h1")).toHaveText("Terms of Service");
    await expect(page.getByText("Rules & Fair Play")).toBeVisible();

    // Key required clauses
    await expect(page.getByText("Purpose of the Platform")).toBeVisible();
    await expect(page.getByText("AI-Generated Content Disclaimer")).toBeVisible();
    await expect(page.getByText("Acceptable Use & Prohibited Prompts")).toBeVisible();
    await expect(page.getByText("Benchmark Voting Integrity")).toBeVisible();
    await expect(page.getByText("Disclaimer of Warranties & Limitation of Liability")).toBeVisible();

    // Navigation back to Arena
    const backBtn = page.getByRole("link", { name: "Back to Arena" });
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(page).toHaveURL("/");
  });

  test("Cookie Consent Banner appears, allows customization, and persists choices", async ({
    page,
  }) => {
    await page.goto("/");

    // Locate floating consent banner
    const banner = page.getByRole("region", { name: "Cookie and Privacy Consent" });
    await expect(banner).toBeVisible();
    await expect(page.getByText("Cookie & Data Preferences")).toBeVisible();

    // Test Customize button opens preferences dialog
    const customizeBtn = banner.getByRole("button", { name: "Customize" });
    await expect(customizeBtn).toBeVisible();
    await customizeBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#cookie-preferences-title")).toHaveText("Cookie & Storage Settings");

    // Test saving preferences
    const saveBtn = dialog.getByRole("button", { name: "Save Preferences" });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Banner and dialog should be closed
    await expect(dialog).not.toBeVisible();
    await expect(banner).not.toBeVisible();

    // Verify localStorage persistence
    const savedConsent = await page.evaluate(() =>
      window.localStorage.getItem("swag_flow_cookie_consent")
    );
    expect(savedConsent).not.toBeNull();
    const parsed = JSON.parse(savedConsent || "{}");
    expect(parsed.necessary).toBe(true);
    expect(typeof parsed.functional).toBe("boolean");
    expect(typeof parsed.analytics).toBe("boolean");

    // Test reopening cookie settings from the sidebar "Cookies" link
    const cookiesSidebarLink = page.getByRole("button", { name: "Cookies" });
    await expect(cookiesSidebarLink).toBeVisible();
    await cookiesSidebarLink.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
