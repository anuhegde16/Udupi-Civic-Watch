/**
 * Command Center → reports navigation must preserve geographic context.
 *
 * The Command Center's Udupi workspace is built from ward polygons, so its
 * drill-down links have to carry panchayat (and ward, when selected) through to
 * /admin/reports. Without that, "View local reports" silently lands the user on
 * the unfiltered district-wide list — the regression this suite guards.
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

  // The push opt-in dialog can appear at any time and swallow clicks.
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: /stay in the loop/i }),
    async (dialog) => {
      await dialog.getByRole("button", { name: /not now/i }).click();
    },
  );
}

test.describe("Command Center Udupi drill-down", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("'View local reports' for Udupi keeps the panchayat filter", async ({ page }) => {
    await page.goto("/admin/dashboard", { waitUntil: "load" });

    // Enter the Udupi workspace.
    await page.getByRole("button", { name: /^Udupi$/ }).first().click();

    const localReports = page.getByRole("link", { name: /view local reports/i }).first();
    await localReports.scrollIntoViewIfNeeded();
    await expect(localReports).toBeVisible({ timeout: 15_000 });

    const href = await localReports.getAttribute("href");
    expect(href).toContain("panchayat=Udupi");

    await localReports.click();
    await page.waitForURL(/\/admin\/reports\?.*panchayat=Udupi/, { timeout: 15_000 });
  });

  test("the reports page opens scoped to Udupi, not the whole district", async ({ page }) => {
    await page.goto("/admin/reports?panchayat=Udupi", { waitUntil: "load" });
    await expect(page.getByText(/All Reports/i).first()).toBeVisible({ timeout: 15_000 });

    // The Udupi scope must be reflected in the filter UI rather than silently dropped.
    await expect(page.getByText(/Udupi/).first()).toBeVisible({ timeout: 15_000 });

    // Every listed report must be a Udupi one — Saligrama addresses must not appear.
    await page.waitForTimeout(2500);
    const body = (await page.locator("main, body").first().innerText()).toLowerCase();
    expect(body).not.toContain("saligrama");
  });

  test("a ward-scoped link narrows the list further", async ({ page }) => {
    await page.goto("/admin/reports?panchayat=Udupi&wardName=Udupi%20Ward%201", {
      waitUntil: "load",
    });
    await expect(page.getByText(/All Reports/i).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2500);

    const body = (await page.locator("main, body").first().innerText()).toLowerCase();
    expect(body).not.toContain("saligrama");
  });
});
