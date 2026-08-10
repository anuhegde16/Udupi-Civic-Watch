/**
 * The Command Center Team Roster must show ALL staff — legacy Saligrama field
 * officers AND the Udupi hierarchy (engineers, health inspectors, supervisors,
 * community mobilisers) — with working panchayat and role filters.
 *
 * The regression this guards: the roster previously read only the legacy
 * `officers` table, so Udupi Municipality staff were invisible to the Command
 * Center and could not be managed at all.
 */

import { test, expect, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login", { waitUntil: "load" });
  await page
    .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    .first()
    .fill("admin@udupicivicwatch.com");
  await page
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill("admin@udupicivicwatch.com");
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 15_000 });
}

/**
 * The push opt-in dialog is shown on a timer, so it can pop up mid-test and its
 * overlay swallows every click. Wait it out, dismiss it, and confirm no dialog
 * overlay is left covering the page before interacting with the roster.
 */
async function dismissPushDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: /stay in the loop/i });
  await dialog.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /not now/i }).click();
  }
  await expect(page.locator('[data-component-name="DialogOverlay"]')).toHaveCount(0, {
    timeout: 10_000,
  });
}

async function summaryCounts(page: Page) {
  const text = await page.getByTestId("roster-summary").innerText();
  const m = text.match(/(\d+)\s+of\s+(\d+)/i);
  if (!m) throw new Error(`Unexpected roster summary: ${text}`);
  return { shown: Number(m[1]), total: Number(m[2]) };
}

test.describe("Command Center team roster", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/officers", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /team roster/i })).toBeVisible();
    await expect(page.getByTestId("roster-summary")).toBeVisible({ timeout: 20_000 });
    await dismissPushDialog(page);
  });

  test("shows Udupi hierarchy staff alongside Saligrama field officers", async ({ page }) => {
    const { shown, total } = await summaryCounts(page);
    expect(total).toBeGreaterThan(0);
    expect(shown).toBe(total);

    // Every staff source must be represented, not just the legacy officers table
    for (const type of [
      "environmental_engineer",
      "health_inspector",
      "supervisor",
      "field_officer",
    ]) {
      await expect(page.getByTestId(`roster-count-${type}`)).toBeVisible();
    }

    // Cards actually render for both the legacy and hierarchy sources
    await expect(page.locator('[data-staff-type="supervisor"]').first()).toBeVisible();
    await expect(page.locator('[data-staff-type="field_officer"]').first()).toBeVisible();
  });

  test("filtering by panchayat narrows the roster to that panchayat's staff", async ({ page }) => {
    const { total } = await summaryCounts(page);

    await page.getByTestId("filter-panchayat").click();
    await page.getByRole("option", { name: "Udupi", exact: true }).click();

    await expect
      .poll(async () => (await summaryCounts(page)).shown, { timeout: 10_000 })
      .toBeLessThan(total);

    // Saligrama-only legacy field officers must drop out of the Udupi view
    await expect(page.locator('[data-staff-type="field_officer"]')).toHaveCount(0);
    await expect(page.locator('[data-staff-type="supervisor"]').first()).toBeVisible();
  });

  test("manage dialog exposes ward assignment and password change for a supervisor", async ({
    page,
  }) => {
    await page.getByTestId("filter-role").click();
    await page.getByRole("option", { name: "Supervisor", exact: true }).click();

    const card = page.locator('[data-staff-type="supervisor"]').first();
    await expect(card).toBeVisible();
    await card.getByTestId("staff-card-toggle").click();
    await card.getByTestId("staff-manage").click();

    const dialog = page.getByRole("dialog").last();
    await expect(dialog.getByText(/ward assignment/i)).toBeVisible();
    await expect(dialog.getByText(/change password/i)).toBeVisible();
    await expect(dialog.getByLabel("New Password", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel(/confirm password/i)).toBeVisible();
    // Supervisors are hierarchy staff — their reporting line is editable here
    await expect(dialog.getByText(/reports to \(health inspector\)/i)).toBeVisible();
  });
});
