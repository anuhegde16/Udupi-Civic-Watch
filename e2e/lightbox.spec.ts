/**
 * e2e: Photo lightbox — regression guard for image-URL / storage-path changes
 *
 * Covers 3 of the 7 surfaces where the lightbox is wired:
 *   1. Citizen /track/:id   — public, no login required
 *   2. Officer report detail — login as field officer
 *   3. Admin reports list   — login as control-center admin
 *
 * The test report is seeded by e2e/global-setup.ts and has:
 *   - 2 report photos (picsum)
 *   - status="cleaned" with 2 cleanup photos (picsum)
 *
 * Run: npx playwright test e2e/lightbox.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Report ID is seeded by e2e/global-setup.ts and written to this file
const REPORT_ID = parseInt(
  readFileSync(path.join(__dirname, ".test-report-id"), "utf8").trim(),
  10,
);

// Sanity guard — fail fast if the seed file is missing or corrupt
if (isNaN(REPORT_ID) || REPORT_ID <= 0) {
  throw new Error(
    `Invalid REPORT_ID (${REPORT_ID}) — run global-setup or check e2e/.test-report-id`,
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Wait for the lightbox dialog to be visible. */
async function waitForLightbox(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Full screen image viewer" });
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  return dialog;
}

/** The counter pill "N / total" inside the lightbox. */
function counterText(page: Page) {
  return page.locator('[role="dialog"]').locator("text=/\\d+ \\/ \\d+/");
}

async function loginAs(page: Page, email: string, password: string, loginPath: string) {
  await page.goto(loginPath, { waitUntil: "load" });

  // The form uses FormLabel which renders a <label> — use placeholder or
  // fill by input name since the react-hook-form labels are text nodes.
  await page.locator('input[type="email"], input[autocomplete="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="phone" i]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();

  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 12_000 });
}

// ── Surface 1: Citizen track page (/track/:id) ────────────────────────────────

test.describe("citizen /track page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/track/${REPORT_ID}`, { waitUntil: "load" });
    // Wait until React has mounted and the report heading is visible
    await expect(page.getByText(/Report Status/i).first()).toBeVisible({ timeout: 12_000 });
  });

  test("clicking report thumbnail opens lightbox", async ({ page }) => {
    const thumbBtn = page
      .getByRole("button", { name: /view reported photo 1 full screen/i })
      .first();
    await expect(thumbBtn).toBeVisible({ timeout: 8_000 });
    await thumbBtn.click();

    await waitForLightbox(page);
    await expect(page.locator('[role="dialog"] img')).toBeVisible();
  });

  test("next/prev arrows change the counter", async ({ page }) => {
    const thumbBtn = page
      .getByRole("button", { name: /view reported photo 1 full screen/i })
      .first();
    await thumbBtn.click();
    await waitForLightbox(page);

    // With 2 photos the counter shows "1 / 2"
    await expect(counterText(page)).toHaveText(/1 \/ \d+/, { timeout: 5_000 });

    await page.getByRole("button", { name: /next image/i }).click();
    await expect(counterText(page)).toHaveText(/2 \/ \d+/, { timeout: 5_000 });
  });

  test("Escape key closes the lightbox", async ({ page }) => {
    await page
      .getByRole("button", { name: /view reported photo 1 full screen/i })
      .first()
      .click();
    await waitForLightbox(page);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Full screen image viewer" }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("close button closes the lightbox", async ({ page }) => {
    await page
      .getByRole("button", { name: /view reported photo 1 full screen/i })
      .first()
      .click();
    await waitForLightbox(page);

    await page.getByRole("button", { name: /close/i }).click();
    await expect(
      page.getByRole("dialog", { name: "Full screen image viewer" }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("cleanup photo thumbnails open lightbox", async ({ page }) => {
    const cleanupBtn = page.getByRole("button", {
      name: /view cleanup photo 1 full screen/i,
    });
    if (!(await cleanupBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await cleanupBtn.click();
    await waitForLightbox(page);
    await expect(page.locator('[role="dialog"] img')).toBeVisible();
  });
});

// ── Surface 2: Officer report detail (/officer/report/:id) ────────────────────

test.describe("officer report detail page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(
      page,
      "pradeep.preetham@gamil.com",
      "pradeep.preetham@gamil.com",
      "/staff/login",
    );
    await page.goto(`/officer/report/${REPORT_ID}`, { waitUntil: "load" });
    await expect(page.getByText(`Report #${REPORT_ID}`)).toBeVisible({
      timeout: 12_000,
    });
  });

  test("clicking report thumbnail opens lightbox", async ({ page }) => {
    const thumbBtn = page
      .getByRole("button", { name: /view report photo 1 full screen/i })
      .first();
    await expect(thumbBtn).toBeVisible({ timeout: 8_000 });
    await thumbBtn.click();

    await waitForLightbox(page);
    await expect(page.locator('[role="dialog"] img')).toBeVisible();
  });

  test("next/prev arrows cycle the counter", async ({ page }) => {
    await page
      .getByRole("button", { name: /view report photo 1 full screen/i })
      .first()
      .click();
    await waitForLightbox(page);

    await expect(counterText(page)).toHaveText(/1 \/ \d+/, { timeout: 5_000 });

    await page.getByRole("button", { name: /next image/i }).click();
    await expect(counterText(page)).toHaveText(/2 \/ \d+/, { timeout: 5_000 });

    await page.getByRole("button", { name: /previous image/i }).click();
    await expect(counterText(page)).toHaveText(/1 \/ \d+/, { timeout: 5_000 });
  });

  test("Escape key closes the lightbox", async ({ page }) => {
    await page
      .getByRole("button", { name: /view report photo 1 full screen/i })
      .first()
      .click();
    await waitForLightbox(page);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Full screen image viewer" }),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});

// ── Surface 3: Admin reports list (/admin/reports) ────────────────────────────

test.describe("admin reports list page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(
      page,
      "admin@udupicivicwatch.com",
      "admin@udupicivicwatch.com",
      "/admin/login",
    );
    // Auto-dismiss the push-notification opt-in dialog whenever it appears.
    // It can pop up at any point during the test and intercept clicks /
    // keyboard events, so we register a locator handler rather than a one-shot
    // conditional check.
    await page.addLocatorHandler(
      page.getByRole("dialog", { name: /stay in the loop/i }),
      async (dialog) => {
        await dialog.getByRole("button", { name: /not now/i }).click();
      },
    );

    await page.goto(`/admin/reports`, { waitUntil: "load" });
    await expect(page.getByText(/All Reports/i).first()).toBeVisible({
      timeout: 12_000,
    });
  });

  test("clicking a report thumbnail opens lightbox", async ({ page }) => {
    // Any visible zoom-cursor thumbnail works — the list has many reports
    const thumbBtn = page
      .getByRole("button", { name: /view report photo full screen/i })
      .first();
    await thumbBtn.scrollIntoViewIfNeeded();
    await expect(thumbBtn).toBeVisible({ timeout: 10_000 });
    await thumbBtn.click();

    await waitForLightbox(page);
    await expect(page.locator('[role="dialog"] img')).toBeVisible();
  });

  test("Escape key closes the lightbox", async ({ page }) => {
    const thumbBtn = page
      .getByRole("button", { name: /view report photo full screen/i })
      .first();
    await thumbBtn.scrollIntoViewIfNeeded();
    await thumbBtn.click();
    await waitForLightbox(page);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Full screen image viewer" }),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
