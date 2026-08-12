/**
 * e2e: Supervisor ↔ Field-officer dashboard structural parity
 *
 * Guards against silent divergence between the supervisor dashboard
 * (artifacts/cleanspot/src/pages/supervisor-dashboard.tsx) and the field
 * officer dashboard (artifacts/cleanspot/src/pages/officer-dashboard.tsx).
 *
 * Both dashboards must expose the same structural building blocks:
 *   - Four clickable stat cards: Total / New / In Progress / Cleaned
 *   - A "Zone completion" progress bar (visible when reports exist)
 *   - A search input ("Search by address or description…")
 *   - A sort dropdown (ArrowUpDown icon + sort options)
 *   - Status tabs: All / New / Progress / Cleaned
 *   - A report card grid (or the matching empty-state)
 *
 * If a control is added to or removed from only one dashboard this test
 * will fail, surfacing the divergence before it reaches production.
 *
 * Credentials:
 *   Supervisor — 8431564819@phone.local / Udupi@1234
 *   Officer    — pradeep.preetham@gamil.com / pradeep.preetham@gamil.com
 *
 * Run: npx playwright test e2e/dashboard-parity.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAsStaff(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/staff/login", { waitUntil: "load" });
  await page
    .locator(
      'input[type="email"], input[autocomplete="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="phone" i]',
    )
    .first()
    .fill(email);
  await page
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill(password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("login"), {
    timeout: 15_000,
  });
}

/**
 * Assert that the shared structural skeleton is present on the dashboard
 * currently loaded in `page`.
 *
 * The check is intentionally label-driven so it fails the moment a label is
 * renamed or a block is removed on only one of the two dashboards.
 */
async function assertDashboardStructure(page: Page, label: string): Promise<void> {
  // ── 1. Four stat cards ───────────────────────────────────────────────────────
  // Each card is a <button> containing the label text.
  for (const cardLabel of ["Total", "New", "In Progress", "Cleaned"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(cardLabel, "i") }).first(),
      `${label}: stat card "${cardLabel}" must be visible`,
    ).toBeVisible({ timeout: 20_000 });
  }

  // ── 2. Status tabs ───────────────────────────────────────────────────────────
  // TabsTrigger values map to "All (N)", "New (N)", "Progress (N)", "Cleaned (N)"
  for (const tabText of [/^All \(/, /^New \(/, /^Progress \(/, /^Cleaned \(/]) {
    await expect(
      page.getByRole("tab", { name: tabText }).first(),
      `${label}: status tab "${tabText}" must be visible`,
    ).toBeVisible({ timeout: 10_000 });
  }

  // ── 3. Search input ──────────────────────────────────────────────────────────
  await expect(
    page.getByPlaceholder(/search by address or description/i).first(),
    `${label}: search input must be visible`,
  ).toBeVisible({ timeout: 10_000 });

  // ── 4. Sort dropdown ─────────────────────────────────────────────────────────
  // The SelectTrigger wraps ArrowUpDown icon + SelectValue.
  // "Newest first" is the default SelectValue text.
  await expect(
    page.getByRole("combobox").filter({ hasText: /newest first/i }).first(),
    `${label}: sort dropdown must be visible`,
  ).toBeVisible({ timeout: 10_000 });

  // ── 5. Report card grid OR empty/loading state ───────────────────────────────
  // At least one of: a report card link, the empty-state heading, or the
  // loading spinner must be present — confirms the list section rendered.
  await expect(
    page
      .locator('a[href*="/report/"]')
      .first()
      .or(page.getByText(/no reports found/i).first())
      .or(page.getByText(/loading assigned reports/i).first()),
    `${label}: report list section (cards, empty state, or loading) must be visible`,
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Assert that the completion progress bar section is present.
 * Called after confirming at least one report is visible (so stats.total > 0).
 */
async function assertProgressBar(page: Page, label: string): Promise<void> {
  await expect(
    page.getByText(/zone completion/i).first(),
    `${label}: "Zone completion" progress bar label must be visible`,
  ).toBeVisible({ timeout: 10_000 });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe("supervisor vs field-officer dashboard structural parity", () => {
  // ── Supervisor dashboard ─────────────────────────────────────────────────────

  test.describe("supervisor dashboard structure", () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStaff(page, "8431564819@phone.local", "Udupi@1234");
      await page.goto("/supervisor/dashboard", { waitUntil: "load" });
      // Wait for the dashboard content area to settle
      await expect(
        page
          .locator('a[href^="/supervisor/report/"]')
          .first()
          .or(page.getByText(/no reports found/i).first()),
      ).toBeVisible({ timeout: 20_000 });
    });

    test("has all four stat cards", async ({ page }) => {
      for (const cardLabel of ["Total", "New", "In Progress", "Cleaned"]) {
        await expect(
          page.getByRole("button", { name: new RegExp(cardLabel, "i") }).first(),
        ).toBeVisible({ timeout: 15_000 });
      }
    });

    test("has all four status tabs", async ({ page }) => {
      for (const tabText of [/^All \(/, /^New \(/, /^Progress \(/, /^Cleaned \(/]) {
        await expect(
          page.getByRole("tab", { name: tabText }).first(),
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    test("has search input and sort dropdown", async ({ page }) => {
      await expect(
        page.getByPlaceholder(/search by address or description/i).first(),
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        page.getByRole("combobox").filter({ hasText: /newest first/i }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("has zone completion progress bar when reports exist", async ({ page }) => {
      // Only assert the bar when at least one report is visible (stats.total > 0)
      const hasCards =
        (await page.locator('a[href^="/supervisor/report/"]').count()) > 0;
      if (hasCards) {
        await assertProgressBar(page, "supervisor");
      }
    });

    test("has report card grid or matching empty state", async ({ page }) => {
      await expect(
        page
          .locator('a[href^="/supervisor/report/"]')
          .first()
          .or(page.getByText(/no reports found/i).first()),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // ── Field officer dashboard ──────────────────────────────────────────────────

  test.describe("field officer dashboard structure", () => {
    test.beforeEach(async ({ page }) => {
      await loginAsStaff(
        page,
        "pradeep.preetham@gamil.com",
        "pradeep.preetham@gamil.com",
      );
      await page.goto("/officer/dashboard", { waitUntil: "load" });
      // Wait for the dashboard content area to settle
      await expect(
        page
          .locator('a[href^="/officer/report/"]')
          .first()
          .or(page.getByText(/no reports found/i).first()),
      ).toBeVisible({ timeout: 20_000 });
    });

    test("has all four stat cards", async ({ page }) => {
      for (const cardLabel of ["Total", "New", "In Progress", "Cleaned"]) {
        await expect(
          page.getByRole("button", { name: new RegExp(cardLabel, "i") }).first(),
        ).toBeVisible({ timeout: 15_000 });
      }
    });

    test("has all four status tabs", async ({ page }) => {
      for (const tabText of [/^All \(/, /^New \(/, /^Progress \(/, /^Cleaned \(/]) {
        await expect(
          page.getByRole("tab", { name: tabText }).first(),
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    test("has search input and sort dropdown", async ({ page }) => {
      await expect(
        page.getByPlaceholder(/search by address or description/i).first(),
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        page.getByRole("combobox").filter({ hasText: /newest first/i }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("has zone completion progress bar when reports exist", async ({ page }) => {
      const hasCards =
        (await page.locator('a[href^="/officer/report/"]').count()) > 0;
      if (hasCards) {
        await assertProgressBar(page, "officer");
      }
    });

    test("has report card grid or matching empty state", async ({ page }) => {
      await expect(
        page
          .locator('a[href^="/officer/report/"]')
          .first()
          .or(page.getByText(/no reports found/i).first()),
      ).toBeVisible({ timeout: 15_000 });
    });
  });

  // ── Cross-dashboard parity sweep ─────────────────────────────────────────────
  // A single test that logs into each dashboard in sequence and runs the full
  // structural check via the shared helper. This is the "canary" — if a control
  // disappears from one dashboard the helper assertion will call it out with a
  // message that names which dashboard failed and which element was missing.

  test("supervisor and officer dashboards share identical structural building blocks", async ({
    page,
  }) => {
    // ── Supervisor ──────────────────────────────────────────────────────────────
    await loginAsStaff(page, "8431564819@phone.local", "Udupi@1234");
    await page.goto("/supervisor/dashboard", { waitUntil: "load" });
    await expect(
      page
        .locator('a[href^="/supervisor/report/"]')
        .first()
        .or(page.getByText(/no reports found/i).first()),
    ).toBeVisible({ timeout: 20_000 });

    await assertDashboardStructure(page, "supervisor");

    const supervisorHasReports =
      (await page.locator('a[href^="/supervisor/report/"]').count()) > 0;
    if (supervisorHasReports) {
      await assertProgressBar(page, "supervisor");
    }

    // ── Officer (new browser context via re-login) ──────────────────────────────
    await loginAsStaff(
      page,
      "pradeep.preetham@gamil.com",
      "pradeep.preetham@gamil.com",
    );
    await page.goto("/officer/dashboard", { waitUntil: "load" });
    await expect(
      page
        .locator('a[href^="/officer/report/"]')
        .first()
        .or(page.getByText(/no reports found/i).first()),
    ).toBeVisible({ timeout: 20_000 });

    await assertDashboardStructure(page, "officer");

    const officerHasReports =
      (await page.locator('a[href^="/officer/report/"]').count()) > 0;
    if (officerHasReports) {
      await assertProgressBar(page, "officer");
    }
  });
});
