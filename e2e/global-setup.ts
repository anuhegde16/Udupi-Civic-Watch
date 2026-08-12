/**
 * Playwright global setup — seeds e2e test fixtures in the dev DB.
 *
 * Fixtures seeded here:
 *   1. Lightbox report — a "cleaned" report with 2 report photos + 2 cleanup photos.
 *      → e2e/.test-report-id
 *
 *   2. Supervisor in-ward report — a "reported" report placed inside Udupi Ward 1
 *      (lat=13.355311, lng=74.701861), visible to supervisor Nagarjun D Amin whose
 *      wards include Ward 1/Kola.
 *      → e2e/.supervisor-in-ward-id
 *
 *   3. Supervisor out-ward report — a "reported" report placed well outside every
 *      Udupi ward polygon (lat=12.0, lng=77.0), so a supervisor navigating to its
 *      detail page sees the "Report unavailable" state.
 *      → e2e/.supervisor-out-ward-id
 *
 * All seeds are idempotent: they reuse existing rows matched by address marker.
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import path from "path";
import os from "os";

// ── Lightbox report constants ─────────────────────────────────────────────────
const PICSUM_1 = "https://picsum.photos/seed/e2elightbox1/800/600";
const PICSUM_2 = "https://picsum.photos/seed/e2elightbox2/800/600";
const CLEANUP_1 = "https://picsum.photos/seed/e2ecleanup1/800/600";
const CLEANUP_2 = "https://picsum.photos/seed/e2ecleanup2/800/600";
const ADDRESS_MARKER = "e2e-lightbox-test-report";

// ── Supervisor fixture constants ──────────────────────────────────────────────
/** Centroid of Udupi Ward 1 — guaranteed inside the ward polygon per geofences.json. */
const SV_IN_WARD_LAT = 13.355311;
const SV_IN_WARD_LNG = 74.701861;
const SV_IN_WARD_MARKER = "e2e-supervisor-in-ward-report";

/** Well outside every Udupi ward polygon (confirmed by hierarchy-zone-filter.test.ts). */
const SV_OUT_WARD_LAT = 12.0;
const SV_OUT_WARD_LNG = 77.0;
const SV_OUT_WARD_MARKER = "e2e-supervisor-out-ward-report";

// ── Helpers ───────────────────────────────────────────────────────────────────

function psql(dbUrl: string, sql: string): string {
  // Write SQL to a temp file to avoid any shell quoting problems
  const tmp = path.join(os.tmpdir(), `e2e-setup-${Date.now()}.sql`);
  writeFileSync(tmp, sql, "utf8");
  try {
    return execSync(`psql "${dbUrl}" -t -f "${tmp}" 2>&1`).toString().trim();
  } finally {
    try { execSync(`rm -f "${tmp}"`); } catch { /* ignore */ }
  }
}

const SV_IN_WARD_PHOTO = "https://picsum.photos/seed/e2esvInWard/800/600";

/**
 * Idempotently seed a minimal report row.
 * Returns the report ID as a number.
 * @param imageUrl  Optional photo URL to include so card image buttons render.
 */
function seedReport(
  dbUrl: string,
  marker: string,
  lat: number,
  lng: number,
  label: string,
  imageUrl?: string,
): number {
  const selectOut = psql(
    dbUrl,
    `SELECT id FROM reports WHERE address = '${marker}' AND deleted_at IS NULL LIMIT 1;`,
  );
  const existing = parseInt(selectOut, 10);
  if (!isNaN(existing)) {
    // Restore the expected actionable state on every run. The supervisor action
    // test must not inherit a prior run that completed this fixture.
    psql(
      dbUrl,
      `UPDATE reports
       SET status = 'reported',
           cleanup_image_url = NULL,
           cleanup_image_urls = NULL,
           cleaning_started_at = NULL,
           cleaned_at = NULL
       WHERE id = ${existing};`,
    );

    // If a photo was requested and the row was seeded without one, backfill it.
    if (imageUrl) {
      const imageUrls = JSON.stringify([{ url: imageUrl, uploadedAt: new Date().toISOString() }]);
      psql(
        dbUrl,
        `UPDATE reports
         SET image_url = $$${imageUrl}$$,
             image_urls = $$${imageUrls}$$::jsonb
         WHERE id = ${existing} AND image_url IS NULL;`,
      );
    }
    console.log(`[e2e setup] Reusing ${label} id=${existing}`);
    return existing;
  }

  const imageCol = imageUrl ? `, image_url, image_urls` : "";
  const imageVal = imageUrl
    ? `, $$${imageUrl}$$, $$${JSON.stringify([{ url: imageUrl, uploadedAt: new Date().toISOString() }])}$$::jsonb`
    : "";

  const insertSql = `
INSERT INTO reports (latitude, longitude, address, status${imageCol})
VALUES (${lat}, ${lng}, $$${marker}$$, 'reported'${imageVal})
RETURNING id;
`;
  const out = psql(dbUrl, insertSql);
  const id = parseInt(out, 10);
  if (isNaN(id)) throw new Error(`[e2e setup] Seed failed for ${label}. psql output: ${out}`);
  console.log(`[e2e setup] Seeded ${label} id=${id}`);
  return id;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function globalSetup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var must be set for e2e setup");

  // ── 1. Lightbox report ───────────────────────────────────────────────────────
  const selectOut = psql(
    dbUrl,
    `SELECT id FROM reports WHERE address = '${ADDRESS_MARKER}' AND deleted_at IS NULL LIMIT 1;`,
  );
  const existingId = parseInt(selectOut, 10);

  let reportId: string;
  if (!isNaN(existingId)) {
    reportId = String(existingId);
    console.log(`[e2e setup] Reusing lightbox report id=${reportId}`);
  } else {
    const imageUrls = JSON.stringify([
      { url: PICSUM_1, uploadedAt: new Date().toISOString() },
      { url: PICSUM_2, uploadedAt: new Date().toISOString() },
    ]);
    const cleanupImageUrls = JSON.stringify([
      { url: CLEANUP_1, uploadedAt: new Date().toISOString() },
      { url: CLEANUP_2, uploadedAt: new Date().toISOString() },
    ]);
    const insertSql = `
INSERT INTO reports (
  image_url, image_urls, cleanup_image_url, cleanup_image_urls,
  latitude, longitude, address, status, assigned_officer_id,
  cleaning_started_at, cleaned_at, updated_at
) VALUES (
  $$${PICSUM_1}$$,
  $$${imageUrls}$$::jsonb,
  $$${CLEANUP_1}$$,
  $$${cleanupImageUrls}$$::jsonb,
  13.3042, 74.7892,
  $$${ADDRESS_MARKER}$$,
  'cleaned',
  19,
  now() - interval '2 hours',
  now() - interval '1 hour',
  now() - interval '1 hour'
) RETURNING id;
`;
    const insertOut = psql(dbUrl, insertSql);
    const parsed = parseInt(insertOut, 10);
    if (isNaN(parsed)) throw new Error(`Seed failed. psql output: ${insertOut}`);
    reportId = String(parsed);
    console.log(`[e2e setup] Seeded lightbox report id=${reportId}`);
  }

  writeFileSync(path.join(__dirname, ".test-report-id"), reportId, "utf8");

  // ── 2. Supervisor in-ward report (inside Udupi Ward 1 / Kola) ───────────────
  // Seeded with a photo so the card image button (aria-label="Open report N")
  // is rendered on the supervisor dashboard.
  const inWardId = seedReport(
    dbUrl,
    SV_IN_WARD_MARKER,
    SV_IN_WARD_LAT,
    SV_IN_WARD_LNG,
    "supervisor in-ward report",
    SV_IN_WARD_PHOTO,
  );
  writeFileSync(
    path.join(__dirname, ".supervisor-in-ward-id"),
    String(inWardId),
    "utf8",
  );

  // ── 3. Supervisor out-ward report (outside all Udupi wards) ─────────────────
  const outWardId = seedReport(
    dbUrl,
    SV_OUT_WARD_MARKER,
    SV_OUT_WARD_LAT,
    SV_OUT_WARD_LNG,
    "supervisor out-ward report",
  );
  writeFileSync(
    path.join(__dirname, ".supervisor-out-ward-id"),
    String(outWardId),
    "utf8",
  );
}

export default globalSetup;
