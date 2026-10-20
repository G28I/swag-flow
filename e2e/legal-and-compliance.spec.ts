import { test, expect } from "@playwright/test";

test.describe("Phase 1: Legal & Compliance", () => {
  test("Privacy Policy page (/privacy) displays actual data practices, pseudonymous telemetry, and verified retention", async ({
    page,
  }) => {
    await page.goto("/privacy");

    // Header and title
    await expect(page.locator("h1")).toHaveText("Privacy Policy");
    await expect(page.getByText("Privacy & Data Transparency")).toBeVisible();

    // Verify key documented data practices & pseudonymous telemetry
    await expect(page.getByText("Authentication & Identity")).toBeVisible();
    await expect(page.getByText("swag_flow_anon_token").first()).toBeVisible();
    await expect(page.getByText("Prompts & Model Responses")).toBeVisible();
    await expect(page.getByText("Benchmark Votes & Telemetry")).toBeVisible();
    await expect(page.getByText("OpenRouter:")).toBeVisible();
    await expect(page.getByText("Product and performance telemetry")).toBeVisible();

    // Verify retention schedules & verified contact
    await expect(page.getByText("Verified Retention & Deletion Schedules")).toBeVisible();
    await expect(page.getByText("Bug Reports (90-Day Purge)")).toBeVisible();
    await expect(page.getByText("GitHub Issue Tracker:")).toBeVisible();
    await expect(page.getByText("30 calendar days")).toBeVisible();

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

    // Verify accessible checkbox names
    const functionalToggle = dialog.getByRole("checkbox", {
      name: /Functional Storage/i,
    });
    const analyticsToggle = dialog.getByRole("checkbox", {
      name: /Analytics.*Telemetry/i,
    });
    await expect(functionalToggle).toBeVisible();
    await expect(analyticsToggle).toBeVisible();

    // Close modal with Escape
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

  test("Cookie Consent Banner appears, allows customization, and persists choices across reloads", async ({
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

    // Check accessible checkboxes
    const functionalToggle = dialog.getByRole("checkbox", {
      name: /Functional Storage/i,
    });
    const analyticsToggle = dialog.getByRole("checkbox", {
      name: /Analytics.*Telemetry/i,
    });
    await expect(functionalToggle).toBeVisible();
    await expect(analyticsToggle).toBeVisible();

    // Modify choices: uncheck functional, check analytics
    await functionalToggle.setChecked(false, { force: true });
    await analyticsToggle.setChecked(true, { force: true });

    // Save preferences
    const saveBtn = dialog.getByRole("button", { name: "Save Preferences" });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Banner and dialog should be closed
    await expect(dialog).not.toBeVisible();
    await expect(banner).not.toBeVisible();

    // Verify localStorage persistence matches exact chosen boolean values
    const savedConsent = await page.evaluate(() =>
      window.localStorage.getItem("swag_flow_cookie_consent")
    );
    expect(savedConsent).not.toBeNull();
    const parsed = JSON.parse(savedConsent || "{}");
    expect(parsed.necessary).toBe(true);
    expect(parsed.functional).toBe(false);
    expect(parsed.analytics).toBe(true);

    // Verify persistence across page reload
    await page.reload();
    await expect(banner).not.toBeVisible();

    // Test reopening cookie settings from the sidebar "Cookies" link
    const cookiesSidebarLink = page.getByRole("button", { name: "Cookies" });
    await expect(cookiesSidebarLink).toBeVisible();
    await cookiesSidebarLink.click();
    await expect(dialog).toBeVisible();

    // Assert that the saved toggle choices remain preserved inside the modal
    await expect(functionalToggle).not.toBeChecked();
    await expect(analyticsToggle).toBeChecked();

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("Rejecting non-essential storage disables functional cache writes without breaking Arena", async ({
    page,
  }) => {
    // Pre-seed strictly necessary anon token to verify it is retained upon rejection
    await page.addInitScript(() => {
      window.localStorage.setItem("swag_flow_anon_token", "anon-token-strictly-necessary");
    });

    await page.goto("/");

    // Locate banner and click Reject Non-Essential
    const banner = page.getByRole("region", { name: "Cookie and Privacy Consent" });
    await expect(banner).toBeVisible();
    const rejectBtn = banner.getByRole("button", { name: "Reject Non-Essential" });
    await rejectBtn.click();

    await expect(banner).not.toBeVisible();

    // Verify consent recorded with functional: false, analytics: false
    const consent = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("swag_flow_cookie_consent") || "{}")
    );
    expect(consent.functional).toBe(false);
    expect(consent.analytics).toBe(false);
    expect(consent.necessary).toBe(true);

    // Verify strictly necessary token is retained
    const anonToken = await page.evaluate(() =>
      window.localStorage.getItem("swag_flow_anon_token")
    );
    expect(anonToken).toBe("anon-token-strictly-necessary");

    // Verify no functional cache was written
    const arenaCache = await page.evaluate(() =>
      window.localStorage.getItem("arena_cache_current")
    );
    const anonThreads = await page.evaluate(() =>
      window.localStorage.getItem("swag_flow_anon_threads")
    );
    expect(arenaCache).toBeNull();
    expect(anonThreads).toBeNull();
  });

  test("Withdrawing functional consent immediately purges cached data while preserving necessary tokens", async ({
    page,
  }) => {
    // 1. Seed initial accepted consent and cached draft/thread data
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "swag_flow_cookie_consent",
        JSON.stringify({ necessary: true, functional: true, analytics: true })
      );
      window.localStorage.setItem("arena_cache_test_thread", JSON.stringify({ turns: [] }));
      window.localStorage.setItem(
        "swag_flow_anon_threads",
        JSON.stringify([{ id: "test-thread", title: "Test" }])
      );
      window.localStorage.setItem("swag_flow_anon_token", "test-necessary-token");
    });

    await page.goto("/");

    // 2. Open preferences modal from sidebar
    const cookiesBtn = page.getByRole("button", { name: "Cookies" });
    await cookiesBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // 3. Click "Reject All Non-Essential" inside modal
    const rejectAllBtn = dialog.getByRole("button", { name: "Reject All Non-Essential" });
    await rejectAllBtn.click();

    await expect(dialog).not.toBeVisible();

    // 4. Verify optional storage items were purged from localStorage
    const cachedThread = await page.evaluate(() =>
      window.localStorage.getItem("arena_cache_test_thread")
    );
    const anonThreads = await page.evaluate(() =>
      window.localStorage.getItem("swag_flow_anon_threads")
    );
    expect(cachedThread).toBeNull();
    expect(anonThreads).toBeNull();

    // 5. Verify strictly necessary tokens were preserved
    const anonToken = await page.evaluate(() =>
      window.localStorage.getItem("swag_flow_anon_token")
    );
    const consent = await page.evaluate(() =>
      window.localStorage.getItem("swag_flow_cookie_consent")
    );
    expect(anonToken).toBe("test-necessary-token");
    expect(consent).not.toBeNull();
    const parsedConsent = JSON.parse(consent || "{}");
    expect(parsedConsent.functional).toBe(false);
    expect(parsedConsent.analytics).toBe(false);
  });

  test("Telemetry API returns HTTP 403 when analytics consent is absent or disabled", async ({
    request,
  }) => {
    // 1. Direct call without consent cookie -> HTTP 403
    const resNoCookie = await request.post("/api/arena/telemetry", {
      data: {
        eventName: "prompt_submitted",
        metadata: { modelCount: 3 },
      },
    });
    expect(resNoCookie.status()).toBe(403);
    const jsonNoCookie = await resNoCookie.json();
    expect(jsonNoCookie.error).toBe("Analytics consent required.");

    // 2. Direct call with consent cookie where analytics is false -> HTTP 403
    const disabledConsent = encodeURIComponent(
      JSON.stringify({ necessary: true, functional: false, analytics: false })
    );
    const resDisabled = await request.post("/api/arena/telemetry", {
      headers: {
        Cookie: `swag_flow_cookie_consent=${disabledConsent}`,
      },
      data: {
        eventName: "prompt_submitted",
        metadata: { modelCount: 3 },
      },
    });
    expect(resDisabled.status()).toBe(403);

    // 3. Direct call with consent cookie where analytics is true -> HTTP 200
    const enabledConsent = encodeURIComponent(
      JSON.stringify({ necessary: true, functional: true, analytics: true })
    );
    const resEnabled = await request.post("/api/arena/telemetry", {
      headers: {
        Cookie: `swag_flow_cookie_consent=${enabledConsent}`,
      },
      data: {
        eventName: "prompt_submitted",
        metadata: { modelCount: 3 },
      },
    });
    expect(resEnabled.status()).toBe(200);
  });

  test("Preferences dialog traps keyboard focus and restores focus upon closing", async ({
    page,
  }) => {
    await page.goto("/");

    // Open from banner Customize button to test focus moving in and restoring
    const customizeBtn = page.getByRole("button", { name: "Customize" });
    await expect(customizeBtn).toBeVisible();
    await customizeBtn.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Verify focus moved into dialog close button
    const closeBtn = dialog.getByLabel("Close cookie preferences");
    await expect(closeBtn).toBeFocused();

    // Press Tab and verify focus remains within the dialog
    await page.keyboard.press("Tab");
    const activeInDialog = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.closest('[role="dialog"]') !== null;
    });
    expect(activeInDialog).toBe(true);

    // Press Escape to close modal
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // Verify focus is restored to the trigger button
    await expect(customizeBtn).toBeFocused();
  });

  test("Application remains functional and does not crash when storage is blocked", async ({
    page,
  }) => {
    // Simulate throwing SecurityError when localStorage is blocked by browser policy
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get: () => {
          throw new DOMException("Access is denied for this document", "SecurityError");
        },
      });
    });

    await page.goto("/privacy");
    await expect(page.locator("h1")).toHaveText("Privacy Policy");

    await page.goto("/");
    await expect(page.getByText("Cookie & Data Preferences")).toBeVisible();
  });
});
