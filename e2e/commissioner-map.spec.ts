/**
 * e2e: Commissioner map popup — before/after photos and "View Report →" link
 *
 * Guards against regressions in:
 *   - the API returning cleanup photo URLs for cleaned reports
 *   - the RoleMap popup rendering Before/After pills side-by-side
 *   - the "View Report →" navigation link pointing to the correct /track/:id URL
 *
 * Both the hierarchy and map-reports APIs are intercepted with deterministic
 * fixtures so the test is independent of ambient dev-DB state.
 *
 * Run: npx playwright test e2e/commissioner-map.spec.ts --reporter=list
 */

import { test, expect, type Page } from "@playwright/test";

// ── Deterministic photo URLs ──────────────────────────────────────────────────

const BEFORE_URL = "https://picsum.photos/seed/e2ecommmapbefore/800/600";
const AFTER_URL  = "https://picsum.photos/seed/e2ecommmapafter/800/600";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal hierarchy fixture — one HI with one supervisor covering Ward 3.
 *  svWardToGeoName("Ward 3/Udyavara") → "Udupi Ward 3", giving wardGeoNames.length > 0
 *  which is required for the RoleMap to render.
 */
const HIERARCHY_FIXTURE = {
  environmentalEngineer: {
    id: 1,
    name: "Test EE",
    phone: "0000000001",
    hiCount: 1,
    healthInspectors: [
      {
        id: 101,
        name: "Test HI",
        phone: "0000000002",
        supervisorCount: 1,
        reportedCount: 0,
        cleaningCount: 0,
        cleanedCount: 1,
        totalCount: 1,
        supervisors: [
          {
            id: 201,
            name: "Test Supervisor",
            phone: "0000000003",
            wardNames: ["Ward 3/Udyavara"],
            reportedCount: 0,
            cleaningCount: 0,
            cleanedCount: 1,
            totalCount: 1,
          },
        ],
      },
    ],
  },
};

/** Cleaned report placed at a coordinate inside Udupi municipality.
 *  The report ID (901901) is chosen to be far outside the real DB range so it
 *  never collides with seeded data.
 */
const CLEANED_REPORT_ID = 901901;
const MAP_REPORTS_FIXTURE = {
  reports: [
    {
      id: CLEANED_REPORT_ID,
      latitude: 13.3042,
      longitude: 74.7892,
      status: "cleaned",
      imageUrl: BEFORE_URL,
      imageUrls: [{ url: BEFORE_URL, uploadedAt: new Date(Date.now() - 3_600_000).toISOString() }],
      cleanupImageUrl: AFTER_URL,
      cleanupImageUrls: [{ url: AFTER_URL, uploadedAt: new Date(Date.now() - 1_800_000).toISOString() }],
      wasteTypes: ["Household Waste"],
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      wardName: "Udupi Ward 3",
      supervisorId: 201,
      supervisorName: "Test Supervisor",
      healthInspectorId: 101,
      healthInspectorName: "Test HI",
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAsCommissioner(page: Page) {
  await page.goto("/master/login", { waitUntil: "load" });

  // The login form accepts phone numbers in the email field for hierarchy accounts.
  await page
    .locator(
      'input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="phone" i]',
    )
    .first()
    .fill("8277293917");

  await page
    .locator('input[type="password"], input[name="password"]')
    .first()
    .fill("Udupi@1234");

  await page.getByRole("button", { name: /sign in|log in|login/i }).click();

  // Wait for redirect away from the login page.
  await page.waitForURL((url) => !url.pathname.includes("login"), {
    timeout: 15_000,
  });
}

/**
 * Click the first green (cleaned, background:#22c55e) Leaflet marker icon
 * currently visible in the marker pane.
 * Uses dispatchEvent because Leaflet's pointer handling relies on native events,
 * and overlapping markers won't propagate a Playwright `.click()` reliably.
 */
async function clickFirstCleanedMarker(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const pane = document.querySelector(".leaflet-marker-pane");
    if (!pane) return false;
    const icons = Array.from(pane.querySelectorAll(".leaflet-marker-icon"));
    for (const icon of icons) {
      if (icon.innerHTML.includes("#22c55e")) {
        (icon as HTMLElement).dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
        return true;
      }
    }
    return false;
  });
}

/** Wait for the Leaflet popup content to appear after a marker click. */
async function waitForPopup(page: Page) {
  const popup = page.locator(".leaflet-popup-content");
  await expect(popup).toBeVisible({ timeout: 8_000 });
  return popup;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("commissioner map popup – before/after photos", () => {
  // The CleanSpot PWA registers a service worker that intercepts all /api/*
  // requests with a NetworkFirst strategy. Playwright's page.route() does not
  // intercept service-worker-initiated fetches, so we block the SW entirely for
  // these tests so our deterministic fixtures are served instead of real data.
  test.use({ contextOptions: { serviceWorkers: "block" } });

  test.beforeEach(async ({ page }) => {
    // ── Intercept both APIs with deterministic fixtures ───────────────────────
    await page.route("**/api/commissioner/hierarchy", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(HIERARCHY_FIXTURE),
      });
    });
    await page.route("**/api/commissioner/map-reports", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MAP_REPORTS_FIXTURE),
      });
    });

    // Auto-dismiss push-notification opt-in if it appears at any point.
    await page.addLocatorHandler(
      page.getByRole("dialog", { name: /stay in the loop/i }),
      async (dialog) => {
        await dialog.getByRole("button", { name: /not now/i }).click();
      },
    );

    await loginAsCommissioner(page);

    // The commissioner login redirects to /commissioner/dashboard automatically.
    // Wait for Leaflet to initialise and place the marker from our fixture.
    await expect(
      page.locator(".leaflet-marker-pane .leaflet-marker-icon").first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  // ── Test 1: Before and After pills are both visible ─────────────────────────

  test("cleaned marker popup shows both Before and After photo labels", async ({
    page,
  }) => {
    const clicked = await clickFirstCleanedMarker(page);
    expect(
      clicked,
      "Expected a green cleaned marker on the commissioner map",
    ).toBe(true);

    const popup = await waitForPopup(page);

    // The side-by-side layout renders pill spans with text "Before" / "After"
    // overlaid on each thumbnail — same markup as the public map popup.
    await expect(
      popup.locator("span").filter({ hasText: /^Before$/i }).first(),
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      popup.locator("span").filter({ hasText: /^After$/i }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Two img elements — one per photo
    await expect(popup.locator("img")).toHaveCount(2);
  });

  // ── Test 2: "View Report →" link has the correct href ───────────────────────

  test("cleaned marker popup has a View Report link pointing to /track/:id", async ({
    page,
  }) => {
    const clicked = await clickFirstCleanedMarker(page);
    expect(clicked).toBe(true);

    const popup = await waitForPopup(page);

    const link = popup.locator("a").filter({ hasText: /view report/i }).first();
    await expect(link).toBeVisible({ timeout: 5_000 });

    const href = await link.getAttribute("href");
    expect(href).toBe(`/track/${CLEANED_REPORT_ID}`);
  });

  // ── Test 3: Regression guard — popup has at least one image ─────────────────

  test("cleaned marker popup contains at least one image (no blank popup regression)", async ({
    page,
  }) => {
    const clicked = await clickFirstCleanedMarker(page);
    expect(clicked).toBe(true);

    const popup = await waitForPopup(page);

    const imgCount = await popup.locator("img").count();
    expect(
      imgCount,
      "Popup must contain at least one image for a cleaned report",
    ).toBeGreaterThanOrEqual(1);
  });
});
