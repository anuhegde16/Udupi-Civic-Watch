# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: lightbox.spec.ts >> officer report detail page >> next/prev arrows cycle the counter
- Location: e2e/lightbox.spec.ts:161:7

# Error details

```
Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://localhost/staff/login
Call log:
  - navigating to "http://localhost/staff/login", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "This page isn’t working" [level=1] [ref=e7]
    - paragraph [ref=e8]:
      - strong [ref=e9]: localhost
      - text: is currently unable to handle this request.
    - generic [ref=e10]: HTTP ERROR 502
  - button "Reload" [ref=e13] [cursor=pointer]
```

# Test source

```ts
  1   | /**
  2   |  * e2e: Photo lightbox — regression guard for image-URL / storage-path changes
  3   |  *
  4   |  * Covers 3 of the 7 surfaces where the lightbox is wired:
  5   |  *   1. Citizen /track/:id   — public, no login required
  6   |  *   2. Officer report detail — login as field officer
  7   |  *   3. Admin reports list   — login as control-center admin
  8   |  *
  9   |  * The test report is seeded by e2e/global-setup.ts and has:
  10  |  *   - 2 report photos (picsum)
  11  |  *   - status="cleaned" with 2 cleanup photos (picsum)
  12  |  *
  13  |  * Run: npx playwright test e2e/lightbox.spec.ts
  14  |  */
  15  | 
  16  | import { test, expect, type Page } from "@playwright/test";
  17  | import { readFileSync } from "fs";
  18  | import path from "path";
  19  | 
  20  | // Report ID is seeded by e2e/global-setup.ts and written to this file
  21  | const REPORT_ID = parseInt(
  22  |   readFileSync(path.join(__dirname, ".test-report-id"), "utf8").trim(),
  23  |   10,
  24  | );
  25  | 
  26  | // Sanity guard — fail fast if the seed file is missing or corrupt
  27  | if (isNaN(REPORT_ID) || REPORT_ID <= 0) {
  28  |   throw new Error(
  29  |     `Invalid REPORT_ID (${REPORT_ID}) — run global-setup or check e2e/.test-report-id`,
  30  |   );
  31  | }
  32  | 
  33  | // ── Helpers ────────────────────────────────────────────────────────────────────
  34  | 
  35  | /** Wait for the lightbox dialog to be visible. */
  36  | async function waitForLightbox(page: Page) {
  37  |   const dialog = page.getByRole("dialog", { name: "Full screen image viewer" });
  38  |   await expect(dialog).toBeVisible({ timeout: 8_000 });
  39  |   return dialog;
  40  | }
  41  | 
  42  | /** The counter pill "N / total" inside the lightbox. */
  43  | function counterText(page: Page) {
  44  |   return page.locator('[role="dialog"]').locator("text=/\\d+ \\/ \\d+/");
  45  | }
  46  | 
  47  | async function loginAs(page: Page, email: string, password: string, loginPath: string) {
> 48  |   await page.goto(loginPath, { waitUntil: "load" });
      |              ^ Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://localhost/staff/login
  49  | 
  50  |   // The form uses FormLabel which renders a <label> — use placeholder or
  51  |   // fill by input name since the react-hook-form labels are text nodes.
  52  |   await page.locator('input[type="email"], input[autocomplete="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="phone" i]').first().fill(email);
  53  |   await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  54  |   await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  55  | 
  56  |   // Wait for redirect away from login
  57  |   await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 12_000 });
  58  | }
  59  | 
  60  | // ── Surface 1: Citizen track page (/track/:id) ────────────────────────────────
  61  | 
  62  | test.describe("citizen /track page", () => {
  63  |   test.beforeEach(async ({ page }) => {
  64  |     await page.goto(`/track/${REPORT_ID}`, { waitUntil: "load" });
  65  |     // Wait until React has mounted and the report heading is visible
  66  |     await expect(page.getByText(/Report Status/i).first()).toBeVisible({ timeout: 12_000 });
  67  |   });
  68  | 
  69  |   test("clicking report thumbnail opens lightbox", async ({ page }) => {
  70  |     const thumbBtn = page
  71  |       .getByRole("button", { name: /view reported photo 1 full screen/i })
  72  |       .first();
  73  |     await expect(thumbBtn).toBeVisible({ timeout: 8_000 });
  74  |     await thumbBtn.click();
  75  | 
  76  |     await waitForLightbox(page);
  77  |     await expect(page.locator('[role="dialog"] img')).toBeVisible();
  78  |   });
  79  | 
  80  |   test("next/prev arrows change the counter", async ({ page }) => {
  81  |     const thumbBtn = page
  82  |       .getByRole("button", { name: /view reported photo 1 full screen/i })
  83  |       .first();
  84  |     await thumbBtn.click();
  85  |     await waitForLightbox(page);
  86  | 
  87  |     // With 2 photos the counter shows "1 / 2"
  88  |     await expect(counterText(page)).toHaveText(/1 \/ \d+/, { timeout: 5_000 });
  89  | 
  90  |     await page.getByRole("button", { name: /next image/i }).click();
  91  |     await expect(counterText(page)).toHaveText(/2 \/ \d+/, { timeout: 5_000 });
  92  |   });
  93  | 
  94  |   test("Escape key closes the lightbox", async ({ page }) => {
  95  |     await page
  96  |       .getByRole("button", { name: /view reported photo 1 full screen/i })
  97  |       .first()
  98  |       .click();
  99  |     await waitForLightbox(page);
  100 | 
  101 |     await page.keyboard.press("Escape");
  102 |     await expect(
  103 |       page.getByRole("dialog", { name: "Full screen image viewer" }),
  104 |     ).not.toBeVisible({ timeout: 5_000 });
  105 |   });
  106 | 
  107 |   test("close button closes the lightbox", async ({ page }) => {
  108 |     await page
  109 |       .getByRole("button", { name: /view reported photo 1 full screen/i })
  110 |       .first()
  111 |       .click();
  112 |     await waitForLightbox(page);
  113 | 
  114 |     await page.getByRole("button", { name: /close/i }).click();
  115 |     await expect(
  116 |       page.getByRole("dialog", { name: "Full screen image viewer" }),
  117 |     ).not.toBeVisible({ timeout: 5_000 });
  118 |   });
  119 | 
  120 |   test("cleanup photo thumbnails open lightbox", async ({ page }) => {
  121 |     const cleanupBtn = page.getByRole("button", {
  122 |       name: /view cleanup photo 1 full screen/i,
  123 |     });
  124 |     if (!(await cleanupBtn.isVisible().catch(() => false))) {
  125 |       test.skip();
  126 |       return;
  127 |     }
  128 |     await cleanupBtn.click();
  129 |     await waitForLightbox(page);
  130 |     await expect(page.locator('[role="dialog"] img')).toBeVisible();
  131 |   });
  132 | });
  133 | 
  134 | // ── Surface 2: Officer report detail (/officer/report/:id) ────────────────────
  135 | 
  136 | test.describe("officer report detail page", () => {
  137 |   test.beforeEach(async ({ page }) => {
  138 |     await loginAs(
  139 |       page,
  140 |       "pradeep.preetham@gamil.com",
  141 |       "pradeep.preetham@gamil.com",
  142 |       "/staff/login",
  143 |     );
  144 |     await page.goto(`/officer/report/${REPORT_ID}`, { waitUntil: "load" });
  145 |     await expect(page.getByText(`Report #${REPORT_ID}`)).toBeVisible({
  146 |       timeout: 12_000,
  147 |     });
  148 |   });
```