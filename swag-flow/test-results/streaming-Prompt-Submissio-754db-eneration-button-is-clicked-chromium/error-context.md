# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: streaming.spec.ts >> Prompt Submission & Live Streaming E2E >> cancels active streams when Stop Generation button is clicked
- Location: e2e\streaming.spec.ts:24:7

# Error details

```
Error: expect(locator).not.toBeVisible() failed

Locator:  locator('button:has-text(\'Stop\'), button:has-text(\'Cancel\')').first()
Expected: not visible
Received: visible
Timeout:  5000ms

Call log:
  - Expect "not toBeVisible" with timeout 5000ms
  - waiting for locator('button:has-text(\'Stop\'), button:has-text(\'Cancel\')').first()
    10 × locator resolved to <button title="Stop streaming this response" class="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm">…</button>
       - unexpected value "visible"
    3 × locator resolved to <button type="button" title="Stop all streaming models" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer">…</button>
      - unexpected value "visible"

```

```yaml
- button "Stop All"
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Prompt Submission & Live Streaming E2E", () => {
  4  |   test("submits user prompt and initiates concurrent model streams", async ({ page }) => {
  5  |     await page.goto("/");
  6  | 
  7  |     // Ensure prompt textarea is visible
  8  |     const textarea = page.locator("textarea[placeholder*='Ask anything']");
  9  |     await expect(textarea).toBeVisible();
  10 | 
  11 |     // Type prompt
  12 |     await textarea.fill("What is the speed of light in miles per second?");
  13 |     await textarea.press("Enter");
  14 | 
  15 |     // Verify turn card appears in DOM
  16 |     const userMessageBubble = page.locator("text=What is the speed of light");
  17 |     await expect(userMessageBubble).toBeVisible({ timeout: 10000 });
  18 | 
  19 |     // Verify at least one model response column starts streaming or receives text
  20 |     const responseContainer = page.locator(".grid-cols-1, .grid-cols-2, .grid-cols-3");
  21 |     await expect(responseContainer).toBeVisible();
  22 |   });
  23 | 
  24 |   test("cancels active streams when Stop Generation button is clicked", async ({ page }) => {
  25 |     await page.goto("/");
  26 | 
  27 |     const textarea = page.locator("textarea[placeholder*='Ask anything']");
  28 |     await expect(textarea).toBeVisible();
  29 | 
  30 |     await textarea.fill("Write a 500-word essay about quantum computing.");
  31 |     await textarea.press("Enter");
  32 | 
  33 |     // Wait for Stop button or streaming indicator
  34 |     const stopButton = page.locator("button:has-text('Stop'), button:has-text('Cancel')").first();
  35 |     if (await stopButton.isVisible({ timeout: 5000 }).catch(() => false)) {
  36 |       await stopButton.click();
  37 |       // Ensure stop button disappears after abort
> 38 |       await expect(stopButton).not.toBeVisible({ timeout: 5000 });
     |                                    ^ Error: expect(locator).not.toBeVisible() failed
  39 |     }
  40 |   });
  41 | });
  42 | 
```