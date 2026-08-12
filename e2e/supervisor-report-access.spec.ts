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
    // Wait for the report list to settle — either a card or an empty-state message.
    // The dashboard now matches the Saligrama officer layout: each report is a
    // link-wrapped card rather than a card with a "View report" button.
    await expect(
      page.locator('a[href^="/supervisor/report/"]').first()
        .or(page.getByText(/no reports found/i).first()),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("supervisor dashboard shows report cards linking to ward reports", async ({
    page,
  }) => {
    // At least one in-ward report card must be present (the seeded fixture lives
    // inside Ward 1 / Kola, which is one of this supervisor's assigned wards).
    const card = page.locator('a[href^="/supervisor/report/"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a report card navigates to /supervisor/report/:id", async ({
    page,
  }) => {
    // Click the first available report card — any in-ward report works for this
    // routing check. The card's centre sits on the photo zoom button, which
    // deliberately swallows the click to open the lightbox, so target the
    // address line in the card body instead.
    const card = page.locator('a[href^="/supervisor/report/"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.locator("p").first().click();

    // Must land on the supervisor-specific report route (not /officer/report/…)
    await page.waitForURL(
      (url) => /\/supervisor\/report\/\d+/.test(url.pathname),
      { timeout: 12_000 },
    );
    expect(page.url()).toMatch(/\/supervisor\/report\/\d+/);
  });

  test("the in-ward report card navigates to /supervisor/report/:id", async ({
    page,
  }) => {
    // Matches the Saligrama officer dashboard: the whole card is a link to the
    // report workspace, so clicking the seeded in-ward card opens that report.
    const inWardCard = page.locator(
      `a[href="/supervisor/report/${IN_WARD_ID}"]`,
    );
    await expect(inWardCard).toBeVisible({ timeout: 15_000 });
    // Avoid the photo zoom button that covers the card's centre point.
    await inWardCard.locator("p").first().click();

    await page.waitForURL(
      (url) => url.pathname === `/supervisor/report/${IN_WARD_ID}`,
      { timeout: 12_000 },
    );
    expect(page.url()).toMatch(`/supervisor/report/${IN_WARD_ID}`);
  });

  test("card photo opens the lightbox instead of navigating", async ({
    page,
  }) => {
    // Saligrama parity: the photo area is a zoom button that opens the shared
    // lightbox and must not trigger the card's navigation link.
    const photoBtn = page
      .getByRole("button", { name: /view report photo full screen/i })
      .first();
    await expect(photoBtn).toBeVisible({ timeout: 15_000 });
    await photoBtn.click();

    await expect(page.getByRole("dialog").first()).toBeVisible({
      timeout: 8_000,
    });
    expect(page.url()).toContain("/supervisor/dashboard");
  });

  test("map popup opens the seeded in-ward report workspace", async ({
    page,
  }) => {
    // Saligrama parity: the zone map popup routes straight to the report
    // workspace instead of opening an inline status-change preview dialog.
    const markers = page.locator(".udupi-supervisor-report-marker");
    await expect(markers.first()).toBeVisible({ timeout: 15_000 });

    // Report pins overlap heavily inside a single ward, so a coordinate click can
    // repeatedly land on whichever marker is on top. Dispatch the click straight
    // at each marker element instead, and match the fixture by its popup button.
    const fixtureAction = page.locator(
      `.leaflet-popup-content button[data-report-id="${IN_WARD_ID}"]`,
    );
    const markerCount = await markers.count();
    let fixtureActionFound = false;

    for (let index = 0; index < markerCount; index += 1) {
      await markers.nth(index).dispatchEvent("click");
      await expect(
        page.locator(".leaflet-popup-content button[data-report-id]").first(),
      ).toBeVisible({ timeout: 5_000 });

      if ((await fixtureAction.count()) > 0) {
        fixtureActionFound = true;
        await fixtureAction.click();
        break;
      }
    }

    expect(fixtureActionFound).toBe(true);
    await page.waitForURL(
      (url) => url.pathname === `/supervisor/report/${IN_WARD_ID}`,
      { timeout: 12_000 },
    );
    expect(page.url()).toMatch(`/supervisor/report/${IN_WARD_ID}`);
  });

  test("map popups expose only ward-scoped reports", async ({ page }) => {
    // Access boundary on the map surface: the out-of-ward fixture must never
    // appear as a pin popup action for this supervisor.
    const markers = page.locator(".udupi-supervisor-report-marker");
    await expect(markers.first()).toBeVisible({ timeout: 15_000 });

    const markerCount = await markers.count();
    for (let index = 0; index < markerCount; index += 1) {
      await markers.nth(index).dispatchEvent("click");
      await expect(
        page.locator(".leaflet-popup-content button[data-report-id]").first(),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator(
          `.leaflet-popup-content button[data-report-id="${OUT_WARD_ID}"]`,
        ),
      ).toHaveCount(0);
    }
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

// ── Suite: API-level write access control ─────────────────────────────────────
//
// The UI no longer exposes out-of-ward controls, so a server-side gap would
// be invisible to users. These tests issue PATCH requests directly against the
// supervisor API — bypassing the UI — to confirm the server enforces the ward
// boundary on every write, not just on reads.
//
// Test matrix:
//   out-of-ward report + status=cleaning         → 403
//   out-of-ward report + status=cleaned + photo  → 403
//   in-ward report     + status=cleaning         → 200  (proves check is scoped,
//                                                        not blanket-deny)

test.describe("supervisor API — direct write access control", () => {
  // Each test in this suite logs in via the full browser flow (to reuse
  // loginAsSupervisor) and then issues API calls through page.request, which
  // carries the same session cookie the browser holds.

  test("PATCH status=cleaning on an out-of-ward report is rejected with 403", async ({
    page,
  }) => {
    await loginAsSupervisor(page);

    const res = await page.request.patch(`/api/supervisor/reports/${OUT_WARD_ID}`, {
      data: { status: "cleaning" },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    // The server should explain the reason, not just send a bare 403
    expect(body).toHaveProperty("error");
  });

  test("PATCH status=cleaned with a cleanup photo on an out-of-ward report is rejected with 403", async ({
    page,
  }) => {
    await loginAsSupervisor(page);

    const res = await page.request.patch(`/api/supervisor/reports/${OUT_WARD_ID}`, {
      data: {
        status: "cleaned",
        cleanupImageUrls: [
          { url: "https://picsum.photos/seed/e2e-sv-cleanup-test/800/600" },
        ],
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("out-of-ward report status is unchanged after a rejected PATCH", async ({
    page,
  }) => {
    // Attempt to move the out-of-ward report to cleaning — this must fail.
    await loginAsSupervisor(page);

    const patchRes = await page.request.patch(`/api/supervisor/reports/${OUT_WARD_ID}`, {
      data: { status: "cleaning" },
    });
    expect(patchRes.status()).toBe(403);

    // Verify the stored status through the public tracking endpoint (no auth
    // required). This is the real DB-backed assertion: if the server ran the
    // UPDATE before checking authorization, the tracking response would show
    // status="cleaning" and a non-null cleaning_started_at — confirming the
    // check is enforced *before* any mutation, not after.
    const trackRes = await page.request.get(`/api/reports/${OUT_WARD_ID}/track`);
    expect(trackRes.status()).toBe(200);
    const tracked = await trackRes.json();
    expect(tracked.status).toBe("reported");
    expect(tracked.cleanupImageUrl).toBeNull();
    expect(tracked.cleanupImageUrls).toBeNull();
  });

  test("PATCH status=cleaning on an in-ward report succeeds (check is scoped, not blanket-deny)", async ({
    page,
  }) => {
    // This is the positive counterpart: the same endpoint must allow writes
    // for a report that is genuinely inside the supervisor's wards.
    await loginAsSupervisor(page);

    const res = await page.request.patch(`/api/supervisor/reports/${IN_WARD_ID}`, {
      data: { status: "cleaning" },
    });

    // 200 = write accepted; any non-403, non-401 is a pass — the point is
    // that the ward check is not a blanket deny.
    expect(res.status()).not.toBe(403);
    expect(res.status()).not.toBe(401);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id", IN_WARD_ID);
    expect(body).toHaveProperty("status", "cleaning");
  });
});
