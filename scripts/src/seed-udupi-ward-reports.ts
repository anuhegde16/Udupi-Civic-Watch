/**
 * seed-udupi-ward-reports.ts
 *
 * Inserts 3–5 dummy reports in every Udupi ward (35 wards, ~140 reports).
 * Reports have no images. Statuses cycle through reported / cleaning / cleaned.
 *
 * Idempotent: aborts if any [SEED] reports already exist.
 * Remove them first with:
 *   DELETE FROM reports WHERE description LIKE '[SEED]%';
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = dirname(fileURLToPath(import.meta.url));
const geofencesPath = join(
  __dirname,
  "../../artifacts/api-server/src/data/geofences.json"
);
const geofencesData = JSON.parse(readFileSync(geofencesPath, "utf-8"));

// ── geometry helpers ──────────────────────────────────────────────────────────

/** Compute centroid of a ward polygon (ring stored as [lng, lat]). */
function wardCentroid(wardName: string): { lat: number; lng: number } | null {
  const feature = (geofencesData.features as any[]).find(
    (f) =>
      f.geometry.type === "Polygon" &&
      f.properties?.type === "ward" &&
      f.properties?.name === wardName
  );
  if (!feature) return null;
  const coords: [number, number][] = feature.geometry.coordinates[0];
  const n = coords.length;
  const sumLat = coords.reduce((s, [, lat]) => s + lat, 0);
  const sumLng = coords.reduce((s, [lng]) => s + lng, 0);
  return { lat: sumLat / n, lng: sumLng / n };
}

// ── data pools ────────────────────────────────────────────────────────────────

const WASTE_TYPE_SETS: string[][] = [
  ["plastic bottles"],
  ["food waste"],
  ["construction debris"],
  ["paper", "plastic bottles"],
  ["glass"],
  ["electronic waste"],
  ["tyres"],
  ["clothing"],
  ["mixed municipal waste"],
  ["food waste", "plastic bottles"],
  ["construction debris", "tyres"],
  ["medical waste"],
];

const SEVERITIES = ["low", "medium", "high"];

// statuses weighted: more 'reported' (newer), fewer 'cleaned'
const STATUS_POOL = [
  "reported", "reported", "reported",
  "cleaning", "cleaning",
  "cleaned", "cleaned",
];

const DESCRIPTIONS = [
  "Large pile of waste near the road junction",
  "Garbage dumped illegally beside the footpath",
  "Overflowing bin causing odour and health risk",
  "Plastic waste scattered along the drain",
  "Construction debris blocking pedestrian path",
  "Mixed waste dumped near the public park",
  "Household garbage left on the roadside",
  "Tyres and old furniture abandoned on street",
  "Food waste attracting stray animals",
  "Glass and metal scraps near children's play area",
  "Waste spilling from an overfull collection point",
  "Litter accumulated at a bus stop",
];

// ── simple deterministic pseudo-random (avoids Math.random for reproducibility)

function makeLcg(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 4294967295;
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== Seeding Udupi ward reports ===\n");

    // Idempotency guard
    const { rows: existing } = await client.query<{ cnt: number }>(
      `SELECT count(*)::int AS cnt FROM reports WHERE description LIKE '[SEED]%' AND deleted_at IS NULL`
    );
    if (existing[0].cnt > 0) {
      console.log(
        `⚠️  Found ${existing[0].cnt} existing [SEED] reports — aborting.\n` +
          `   To re-seed, first run:\n` +
          `   DELETE FROM reports WHERE description LIKE '[SEED]%';`
      );
      return;
    }

    const nowMs = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    let totalInserted = 0;

    for (let w = 1; w <= 35; w++) {
      const wardName = `Udupi Ward ${w}`;
      const centroid = wardCentroid(wardName);
      if (!centroid) {
        console.warn(`  ⚠️  No polygon for ${wardName} — skipping`);
        continue;
      }

      // Per-ward deterministic RNG so the output is reproducible
      const rand = makeLcg(w * 31337 + 7);
      const count = 3 + Math.floor(rand() * 3); // 3, 4, or 5

      for (let i = 0; i < count; i++) {
        // Small jitter so pins don't all stack (±0.0005° ≈ ±55 m)
        const lat = centroid.lat + (rand() - 0.5) * 0.001;
        const lng = centroid.lng + (rand() - 0.5) * 0.001;

        const status = STATUS_POOL[Math.floor(rand() * STATUS_POOL.length)];
        const wasteTypes =
          WASTE_TYPE_SETS[Math.floor(rand() * WASTE_TYPE_SETS.length)];
        const severity = SEVERITIES[Math.floor(rand() * SEVERITIES.length)];
        const desc = `[SEED] ${DESCRIPTIONS[Math.floor(rand() * DESCRIPTIONS.length)]}`;

        // createdAt: uniformly distributed over the last 90 days
        const createdAt = new Date(nowMs - rand() * ninetyDaysMs);

        let cleaningStartedAt: Date | null = null;
        let cleanedAt: Date | null = null;
        if (status === "cleaning" || status === "cleaned") {
          // cleaning started 6–48 hours after report
          cleaningStartedAt = new Date(
            createdAt.getTime() + (6 + rand() * 42) * 3_600_000
          );
        }
        if (status === "cleaned") {
          // cleaned 4–24 hours after cleaning started
          cleanedAt = new Date(
            cleaningStartedAt!.getTime() + (4 + rand() * 20) * 3_600_000
          );
        }

        await client.query(
          `INSERT INTO reports
             (latitude, longitude, status, description, waste_types, waste_severity,
              created_at, updated_at, cleaning_started_at, cleaned_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,
          [
            lat,
            lng,
            status,
            desc,
            JSON.stringify(wasteTypes),
            severity,
            createdAt,
            createdAt,
            cleaningStartedAt,
            cleanedAt,
          ]
        );
        totalInserted++;
      }

      console.log(`  ✓ ${wardName.padEnd(16)}  ${count} reports`);
    }

    console.log(`\n✅ Inserted ${totalInserted} seed reports across 35 Udupi wards.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
