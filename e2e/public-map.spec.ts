/**
 * e2e: Public map – resolved marker popup (Udupi and Saligrama service zones)
 *
 * Verifies that a "cleaned" marker on the public Leaflet map shows both the
 * original complaint photo and at least one cleanup photo with the expected
 * Before/After labels.
 *
 * Deterministic: /api/reports/public/map is intercepted and returns two known
 * fixtures — one per service zone. No staff login required.
 *
 * The shared placeMarkers() rendering path in live-waste-map.tsx is exercised
 * once for each zone, confirming both zones produce identical popup structure.
 *
 * Run: npx playwright test e2e/public-map.spec.ts --reporter=list
 */

import { test, expect, type Page } from "@playwright/test";

// ── Deterministic photo URLs ──────────────────────────────────────────────────

const BEFORE_URL = "https://picsum.photos/seed/e2epubmapbefore/800/600";
const AFTER_URL  = "https://picsum.photos/seed/e2epubmapafter/800/600";

// ── Fixtures: one cleaned report per service zone ─────────────────────────────

/**
 * Cleaned report inside the Udupi district.
 * Centroid of the Udupi district polygon from geofences.json ≈ (13.3505, 74.7489).
 */
const UDUPI_CLEANED = {
  id: 901001,
  latitude: 13.350529,
  longitude: 74.748941,
  status: "cleaned",
  description: "E2E test – Udupi resolved marker",
  address: "e2e-public-map-udupi-cleaned",
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  imageUrl: BEFORE_URL,
  imageUrls: [{ url: BEFORE_URL, uploadedAt: new Date().toISOString() }],
  cleanupImageUrl: AFTER_URL,
  cleanupImageUrls: [{ url: AFTER_URL, uploadedAt: new Date().toISOString() }],
};

/**
 * Cleaned report inside the Saligrama district.
 * Centroid of the Saligrama district polygon from geofences.json ≈ (13.4958, 74.7137).
 */
const SALIGRAMA_CLEANED = {
  id: 901002,
  latitude: 13.495769,
  longitude: 74.713731,
  status: "cleaned",
  description: "E2E test – Saligrama resolved marker",
  address: "e2e-public-map-saligrama-cleaned",
  createdAt: new Date(Date.now() - 7_200_000).toISOString(),
  imageUrl: BEFORE_URL,
  imageUrls: [{ url: BEFORE_URL, uploadedAt: new Date().toISOString() }],
  cleanupImageUrl: AFTER_URL,
  cleanupImageUrls: [{ url: AFTER_URL, uploadedAt: new Date().toISOString() }],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Click the first green (cleaned, status=#22c55e) Leaflet marker icon
 * currently rendered in the marker pane.
 * Returns true if a marker was found and clicked.
 */
async function clickFirstCleanedMarker(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const pane = document.querySelector(".leaflet-marker-pane");
    if (!pane) return false;
    const icons = Array.from(pane.querySelectorAll(".leaflet-marker-icon"));
    for (const icon of icons) {
      // Cleaned markers use background:#22c55e (no pulse ring, solid circle).
      if (icon.innerHTML.includes("#22c55e")) {
        const el = icon as HTMLElement;
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
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

test.describe("public map resolved-marker popup", () => {
  test.beforeEach(async ({ page }) => {
    // Serve only our two deterministic fixtures so no ambient data interferes.
    await page.route("**/api/reports/public/map", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([UDUPI_CLEANED, SALIGRAMA_CLEANED]),
      });
    });

    await page.goto("/", { waitUntil: "load" });

    // Wait until Leaflet has initialised and placed at least one marker icon.
    await expect(page.locator(".leaflet-marker-pane .leaflet-marker-icon").first()).toBeVisible({
      timeout: 20_000,
    });
  });

  // ── Test 1: Udupi cleaned marker – both photo groups visible ─────────────

  test("Udupi cleaned marker popup shows complaint photo and cleanup photo with Before/After labels", async ({ page }) => {
    // Pan map to the Udupi service zone.
    await page.getByRole("button", { name: "Udupi" }).click();

    // Allow the pan animation to settle so the Saligrama marker is off-screen.
    await page.waitForTimeout(900);

    const clicked = await clickFirstCleanedMarker(page);
    expect(clicked, "Expected a green cleaned marker in the Udupi viewport").toBe(true);

    const popup = await waitForPopup(page);

    // ── Complaint (Before) photo ──────────────────────────────────────────────
    // The side-by-side layout renders a span with text "Before" over the complaint image.
    await expect(
      popup.locator("span").filter({ hasText: /^Before$/i }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // ── Cleanup (After) photo ─────────────────────────────────────────────────
    // The side-by-side layout renders a span with text "After" over the cleanup image.
    await expect(
      popup.locator("span").filter({ hasText: /^After$/i }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // ── Status badge ──────────────────────────────────────────────────────────
    await expect(popup.getByText(/completed/i).first()).toBeVisible();

    // ── Two img elements (one before, one after) ──────────────────────────────
    await expect(popup.locator("img")).toHaveCount(2);
  });

  // ── Test 2: Saligrama cleaned marker – same shared rendering path ────────

  test("Saligrama cleaned marker popup uses the same shared rendering path (Before/After labels present)", async ({ page }) => {
    // The map opens on Saligrama by default (first zone in geofences.json).
    // Wait briefly for the initial fitBounds animation to finish.
    await page.waitForTimeout(600);

    const clicked = await clickFirstCleanedMarker(page);
    expect(clicked, "Expected a green cleaned marker in the Saligrama viewport").toBe(true);

    const popup = await waitForPopup(page);

    await expect(
      popup.locator("span").filter({ hasText: /^Before$/i }).first(),
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      popup.locator("span").filter({ hasText: /^After$/i }).first(),
    ).toBeVisible({ timeout: 5_000 });

    await expect(popup.getByText(/completed/i).first()).toBeVisible();

    await expect(popup.locator("img")).toHaveCount(2);
  });

  // ── Test 3: Udupi popup – no-photo regression guard ─────────────────────

  test("Udupi cleaned marker popup contains at least one <img> element (regression: no blank popup)", async ({ page }) => {
    await page.getByRole("button", { name: "Udupi" }).click();
    await page.waitForTimeout(900);

    await clickFirstCleanedMarker(page);
    const popup = await waitForPopup(page);

    // At minimum, there must be at least one image in the popup.
    const imgCount = await popup.locator("img").count();
    expect(imgCount, "Popup should show at least one image for a cleaned report").toBeGreaterThanOrEqual(1);
  });
});
