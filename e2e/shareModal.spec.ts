import { test, expect } from "@playwright/test";

test.describe("Social Share Modal & Canonical Copy Link E2E", () => {
  test("opens Share Modal, renders social targets, and copies canonical URL", async ({ page }) => {
    await page.goto("/");

    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();
    await textarea.fill("Compare AI models");
    await textarea.press("Enter");

    await page.waitForTimeout(3000);

    // Click top navigation share button
    const shareButton = page.locator("button[title='Share this thread']").first();
    await expect(shareButton).toBeVisible({ timeout: 5000 });
    await shareButton.click();

    // Verify modal appears
    const modal = page.locator("[role='dialog'][aria-labelledby='share-modal-title']");
    await expect(modal).toBeVisible();

    // Verify modal header title
    const modalTitle = page.locator("#share-modal-title");
    await expect(modalTitle).toHaveText("Share Comparison");

    // Verify canonical URL input box
    const urlInput = page.locator("#share-link-input");
    await expect(urlInput).toBeVisible();
    const urlValue = await urlInput.inputValue();
    expect(urlValue).toContain("http");
    expect(urlValue).not.toContain("anonToken=");
    expect(urlValue).not.toContain("secret=");

    // Verify social media platform links exist
    const whatsappLink = page.locator("a[aria-label='Share on WhatsApp']");
    await expect(whatsappLink).toBeVisible();
    await expect(whatsappLink).toHaveAttribute("href", /api\.whatsapp\.com/);

    const twitterLink = page.locator("a[aria-label='Share on X']");
    await expect(twitterLink).toBeVisible();
    await expect(twitterLink).toHaveAttribute("href", /twitter\.com/);

    const facebookLink = page.locator("a[aria-label='Share on Facebook']");
    await expect(facebookLink).toBeVisible();
    await expect(facebookLink).toHaveAttribute("href", /facebook\.com/);

    const linkedinLink = page.locator("a[aria-label='Share on LinkedIn']");
    await expect(linkedinLink).toBeVisible();
    await expect(linkedinLink).toHaveAttribute("href", /linkedin\.com/);

    const redditLink = page.locator("a[aria-label='Share on Reddit']");
    await expect(redditLink).toBeVisible();
    await expect(redditLink).toHaveAttribute("href", /reddit\.com/);

    // Verify Instagram button copies link and displays guide prompt
    const instagramButton = page.locator("button[aria-label='Copy link for Instagram']");
    await expect(instagramButton).toBeVisible();
    await instagramButton.click();
    const instagramToast = page.locator("text=Link copied to clipboard! Paste directly into your Instagram Story or DM.");
    await expect(instagramToast).toBeVisible();

    // Verify Copy Link button updates UI state
    const copyButton = page.locator("button:has-text('Copy')").first();
    await copyButton.click();
    await expect(page.locator("button:has-text('Copied!')")).toBeVisible();

    // Close modal via Escape key
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
  });

  test("closes Share Modal when clicking backdrop", async ({ page }) => {
    await page.goto("/");

    const textarea = page.locator("textarea[placeholder*='Ask anything']");
    await expect(textarea).toBeVisible();
    await textarea.fill("Test backdrop close");
    await textarea.press("Enter");

    await page.waitForTimeout(3000);

    const shareButton = page.locator("button[title='Share this thread']").first();
    await expect(shareButton).toBeVisible({ timeout: 5000 });
    await shareButton.click();

    const modal = page.locator("[role='dialog'][aria-labelledby='share-modal-title']");
    await expect(modal).toBeVisible();

    // Click backdrop outside modal box
    await modal.click({ position: { x: 10, y: 10 } });
    await expect(modal).not.toBeVisible();
  });
});
