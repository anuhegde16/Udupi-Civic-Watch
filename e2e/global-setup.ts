/**
 * Playwright global setup — seeds the e2e-lightbox test report in the dev DB.
 *
 * Idempotent: reuses the row if it already exists (matched by address marker).
 * Writes the report ID to e2e/.test-report-id for the spec to read at runtime.
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import os from "os";

const PICSUM_1 = "https://picsum.photos/seed/e2elightbox1/800/600";
const PICSUM_2 = "https://picsum.photos/seed/e2elightbox2/800/600";
const CLEANUP_1 = "https://picsum.photos/seed/e2ecleanup1/800/600";
const CLEANUP_2 = "https://picsum.photos/seed/e2ecleanup2/800/600";
const ADDRESS_MARKER = "e2e-lightbox-test-report";

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

async function globalSetup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var must be set for e2e setup");

  // Check for an existing non-archived test row
  const selectSql = `SELECT id FROM reports WHERE address = '${ADDRESS_MARKER}' AND deleted_at IS NULL LIMIT 1;`;
  const selectOut = psql(dbUrl, selectSql);
  const existingId = parseInt(selectOut, 10);

  let reportId: string;

  if (!isNaN(existingId)) {
    reportId = String(existingId);
    console.log(`[e2e setup] Reusing test report id=${reportId}`);
  } else {
    const imageUrls = JSON.stringify([
      { url: PICSUM_1, uploadedAt: new Date().toISOString() },
      { url: PICSUM_2, uploadedAt: new Date().toISOString() },
    ]);
    const cleanupImageUrls = JSON.stringify([
      { url: CLEANUP_1, uploadedAt: new Date().toISOString() },
      { url: CLEANUP_2, uploadedAt: new Date().toISOString() },
    ]);

    // Use dollar-quoting ($$) to avoid all single-quote issues
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
    console.log(`[e2e setup] Seeded test report id=${reportId}`);
  }

  // Write ID file next to this setup script — spec reads it at module load time
  const idFile = path.join(__dirname, ".test-report-id");
  writeFileSync(idFile, reportId, "utf8");
}

export default globalSetup;
