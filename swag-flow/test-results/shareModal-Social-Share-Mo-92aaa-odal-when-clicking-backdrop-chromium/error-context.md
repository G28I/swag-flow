# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: shareModal.spec.ts >> Social Share Modal & Canonical Copy Link E2E >> closes Share Modal when clicking backdrop
- Location: e2e\shareModal.spec.ts:73:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button[title=\'Share this thread\']').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button[title=\'Share this thread\']').first()

```

```yaml
- complementary:
  - link "S Swag-flow":
    - /url: /
  - navigation:
    - link "Arena":
      - /url: /
    - link "Leaderboard":
      - /url: /leaderboard
    - link "Models":
      - /url: /models
  - separator
  - text: Your Threads
  - button "New Thread"
  - paragraph: No threads yet. Enter a prompt to start one, or sign in to sync history across devices.
  - button "Sign In →"
  - button "Sign In"
  - button "Toggle theme"
- banner: Swag-flow / Swag-flow G 0/2 N 0/2 L 1/2
- main:
  - heading "Concurrently Compare Models" [level=2]
  - paragraph: Choose up to three models from the picker, ask anything below, and watch responses stream in parallel columns. Select the best output to record a vote.
  - text: "M MiniMax: MiniMax M3 (free)"
  - button
  - text: "G Google: Lyria 3 Pro Preview"
  - button
  - text: "G Google: Lyria 3 Clip Preview"
  - button
  - button "Model Controls"
  - textbox "Ask anything. Enter to send, shift + enter for a new line"
  - button "Add Model"
  - button [disabled]
- alert
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Social Share Modal & Canonical Copy Link E2E", () => {
  4  |   test("opens Share Modal, renders social targets, and copies canonical URL", async ({ page }) => {
  5  |     await page.goto("/");
  6  | 
  7  |     const textarea = page.locator("textarea[placeholder*='Ask anything']");
  8  |     await expect(textarea).toBeVisible();
  9  |     await textarea.fill("Compare AI models");
  10 |     await textarea.press("Enter");
  11 | 
  12 |     await page.waitForTimeout(3000);
  13 | 
  14 |     // Click top navigation share button
  15 |     const shareButton = page.locator("button[title='Share this thread']").first();
  16 |     await expect(shareButton).toBeVisible({ timeout: 5000 });
  17 |     await shareButton.click();
  18 | 
  19 |     // Verify modal appears
  20 |     const modal = page.locator("[role='dialog'][aria-labelledby='share-modal-title']");
  21 |     await expect(modal).toBeVisible();
  22 | 
  23 |     // Verify modal header title
  24 |     const modalTitle = page.locator("#share-modal-title");
  25 |     await expect(modalTitle).toHaveText("Share Comparison");
  26 | 
  27 |     // Verify canonical URL input box
  28 |     const urlInput = page.locator("#share-link-input");
  29 |     await expect(urlInput).toBeVisible();
  30 |     const urlValue = await urlInput.inputValue();
  31 |     expect(urlValue).toContain("http");
  32 |     expect(urlValue).not.toContain("anonToken=");
  33 |     expect(urlValue).not.toContain("secret=");
  34 | 
  35 |     // Verify social media platform links exist
  36 |     const whatsappLink = page.locator("a[aria-label='Share on WhatsApp']");
  37 |     await expect(whatsappLink).toBeVisible();
  38 |     await expect(whatsappLink).toHaveAttribute("href", /api\.whatsapp\.com/);
  39 | 
  40 |     const twitterLink = page.locator("a[aria-label='Share on X']");
  41 |     await expect(twitterLink).toBeVisible();
  42 |     await expect(twitterLink).toHaveAttribute("href", /twitter\.com/);
  43 | 
  44 |     const facebookLink = page.locator("a[aria-label='Share on Facebook']");
  45 |     await expect(facebookLink).toBeVisible();
  46 |     await expect(facebookLink).toHaveAttribute("href", /facebook\.com/);
  47 | 
  48 |     const linkedinLink = page.locator("a[aria-label='Share on LinkedIn']");
  49 |     await expect(linkedinLink).toBeVisible();
  50 |     await expect(linkedinLink).toHaveAttribute("href", /linkedin\.com/);
  51 | 
  52 |     const redditLink = page.locator("a[aria-label='Share on Reddit']");
  53 |     await expect(redditLink).toBeVisible();
  54 |     await expect(redditLink).toHaveAttribute("href", /reddit\.com/);
  55 | 
  56 |     // Verify Instagram button copies link and displays guide prompt
  57 |     const instagramButton = page.locator("button[aria-label='Copy link for Instagram']");
  58 |     await expect(instagramButton).toBeVisible();
  59 |     await instagramButton.click();
  60 |     const instagramToast = page.locator("text=Link copied to clipboard! Paste directly into your Instagram Story or DM.");
  61 |     await expect(instagramToast).toBeVisible();
  62 | 
  63 |     // Verify Copy Link button updates UI state
  64 |     const copyButton = page.locator("button:has-text('Copy')").first();
  65 |     await copyButton.click();
  66 |     await expect(page.locator("button:has-text('Copied!')")).toBeVisible();
  67 | 
  68 |     // Close modal via Escape key
  69 |     await page.keyboard.press("Escape");
  70 |     await expect(modal).not.toBeVisible();
  71 |   });
  72 | 
  73 |   test("closes Share Modal when clicking backdrop", async ({ page }) => {
  74 |     await page.goto("/");
  75 | 
  76 |     const textarea = page.locator("textarea[placeholder*='Ask anything']");
  77 |     await expect(textarea).toBeVisible();
  78 |     await textarea.fill("Test backdrop close");
  79 |     await textarea.press("Enter");
  80 | 
  81 |     await page.waitForTimeout(3000);
  82 | 
  83 |     const shareButton = page.locator("button[title='Share this thread']").first();
> 84 |     await expect(shareButton).toBeVisible({ timeout: 5000 });
     |                               ^ Error: expect(locator).toBeVisible() failed
  85 |     await shareButton.click();
  86 | 
  87 |     const modal = page.locator("[role='dialog'][aria-labelledby='share-modal-title']");
  88 |     await expect(modal).toBeVisible();
  89 | 
  90 |     // Click backdrop outside modal box
  91 |     await modal.click({ position: { x: 10, y: 10 } });
  92 |     await expect(modal).not.toBeVisible();
  93 |   });
  94 | });
  95 | 
```