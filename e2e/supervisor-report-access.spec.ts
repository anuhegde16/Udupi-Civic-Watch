/**
 * e2e: Supervisor report-card → detail navigation + ward-access boundary
 *
 * Regression guard for the supervisor card-to-detail flow and the key access
 * boundary: a supervisor can reach their own report workspace from a dashboard
 * card, and receives a "Report unavailable" result for a report outside their
 * assigned wards.
 *
 * Fixtures (seeded by e2e/global-setup.ts):
 *   - e2e/.supervisor-in-ward-id  — report inside Udupi Ward 1 / Kola
 *     (lat=13.355311, lng=74.701861, confirmed inside by geofences.json)
 *   - e2e/.supervisor-out-ward-id — report outside all Udupi ward polygons
 *     (lat=12.0, lng=77.0)
 *
 * Supervisor under test: Mr. Nagarjun D Amin
 *   email:    8431564819@phone.local
 *   password: Udupi@1234
 *   wards:    Ward 1/Kola, Ward 2/Vadabhandeshwara, Ward 3/Malpe Central
 *
 * Run: npx playwright test e2e/supervisor-report-access.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// ── Fixture IDs ───────────────────────────────────────────────────────────────

const IN_WARD_ID = parseInt(
  readFileSync(path.join(__dirname, ".supervisor-in-ward-id"), "utf8").trim(),
  10,
);
const OUT_WARD_ID = parseInt(
  readFileSync(path.join(__dirname, ".supervisor-out-ward-id"), "utf8").trim(),
  10,
);

if (isNaN(IN_WARD_ID) || IN_WARD_ID <= 0) {
  throw new Error(
    `Invalid IN_WARD_ID (${IN_WARD_ID}) — run global-setup or check e2e/.supervisor-in-ward-id`,
  );
}
if (isNaN(OUT_WARD_ID) || OUT_WARD_ID <= 0) {
  throw new Error(
    `Invalid OUT_WARD_ID (${OUT_WARD_ID}) — run global-setup or check e2e/.supervisor-out-ward-id`,
  );
}

// ── Supervisor credentials ────────────────────────────────────────────────────
const SV_EMAIL = "8431564819@phone.local";
const SV_PASSWORD = "Udupi@1234";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAsSupervisor(page: Page) {
  await page.goto("/staff/login", { waitUntil: "load" });
  await page
    .locator(
      'input[type="email"], input[autocomplete="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="phone" i]',
    )
    .first()
    .fill(SV_EMAIL);
  await page
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill(SV_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  // Wait until the browser leaves the login page
  await page.waitForURL((url) => !url.pathname.includes("login"), {
    timeout: 15_000,
  });
}

// ── Suite: supervisor dashboard card → detail navigation ─────────────────────

test.describe("supervisor dashboard → report detail", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto("/supervisor/dashboard", { waitUntil: "load" });
    // Wait for the report list to settle — either a card or an empty-state message
    await expect(
      page.getByRole("button", { name: /view report/i }).first()
        .or(page.getByText(/no reports found/i).first()),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("supervisor dashboard shows View report buttons for ward reports", async ({
    page,
  }) => {
    // At least one in-ward report card must be present (the seeded fixture lives
    // inside Ward 1 / Kola, which is one of this supervisor's assigned wards).
    const viewBtn = page.getByRole("button", { name: /view report/i }).first();
    await expect(viewBtn).toBeVisible({ timeout: 10_000 });
  });

  test("clicking View report navigates to /supervisor/report/:id", async ({
    page,
  }) => {
    // Click the first available card's "View report" button — any in-ward report
    // works for this routing check.
    const viewBtn = page.getByRole("button", { name: /view report/i }).first();
    await expect(viewBtn).toBeVisible({ timeout: 10_000 });
    await viewBtn.click();

    // Must land on the supervisor-specific report route (not /officer/report/…)
    await page.waitForURL(
      (url) => /\/supervisor\/report\/\d+/.test(url.pathname),
      { timeout: 12_000 },
    );
    expect(page.url()).toMatch(/\/supervisor\/report\/\d+/);
  });

  test("card image button for in-ward report also navigates to /supervisor/report/:id", async ({
    page,
  }) => {
    // The image area of a card is also a button that calls openReport().
    // Find a card that contains the seeded in-ward report ID and click its image.
    const inWardIdSpan = page.locator(`span:has-text("#${IN_WARD_ID}")`).first();
    await expect(inWardIdSpan).toBeVisible({ timeout: 15_000 });

    // The image button sits directly inside the card image area and has an
    // aria-label of "Open report {id}"
    const imageBtn = page.getByRole("button", {
      name: `Open report ${IN_WARD_ID}`,
    });
    await expect(imageBtn).toBeVisible({ timeout: 8_000 });
    await imageBtn.click();

    await page.waitForURL(
      (url) => url.pathname === `/supervisor/report/${IN_WARD_ID}`,
      { timeout: 12_000 },
    );
    expect(page.url()).toMatch(`/supervisor/report/${IN_WARD_ID}`);
  });
});

// ── Suite: supervisor report detail page — in-ward report ────────────────────

test.describe("supervisor report detail — in-ward report", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSupervisor(page);
    await page.goto(`/supervisor/report/${IN_WARD_ID}`, { waitUntil: "load" });
  });

  test("detail page renders the report heading", async ({ page }) => {
    await expect(page.getByText(`Report #${IN_WARD_ID}`)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("detail page shows the supervisor ward subtitle", async ({ page }) => {
    await expect(
      page.getByText(/assigned report in your ward/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("detail page shows supervisor action controls", async ({ page }) => {
    // At least one status-change button must be visible (Mark as In Progress or
    // Add cleanup evidence) — confirms the supervisor action rail rendered.
    await expect(
      page
        .getByRole("button", { name: /mark as in progress/i })
        .or(page.getByRole("button", { name: /add cleanup evidence/i }))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ── Suite: supervisor report detail page — out-of-ward report ────────────────

test.describe("supervisor report detail — out-of-ward report", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSupervisor(page);
    // Navigate directly to a report that is outside the supervisor's wards.
    // The component fetches /api/supervisor/reports (ward-filtered list) and
    // throws when the report ID is absent from the results.
    await page.goto(`/supervisor/report/${OUT_WARD_ID}`, { waitUntil: "load" });
  });

  test("shows Report unavailable text for an out-of-ward report", async ({
    page,
  }) => {
    // The error state renders an h1 "Report unavailable" — match it as text
    // to avoid relying on an ARIA role that may vary by viewport.
    await expect(
      page.getByText(/report unavailable/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("shows the ward-restriction explanation", async ({ page }) => {
    await expect(
      page.getByText(/not available in your assigned wards/i),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("does not render status-change controls for an out-of-ward report", async ({
    page,
  }) => {
    // Confirm the error state is present before checking absence of controls
    await expect(
      page.getByText(/not available in your assigned wards/i),
    ).toBeVisible({ timeout: 20_000 });

    // Status-update controls must not be present
    await expect(
      page.getByRole("button", { name: /mark as in progress/i }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /add cleanup evidence/i }),
    ).not.toBeVisible();
  });
});
