/**
 * seed-udupi-ward-reports.ts  (v2 — enriched, 30-day window)
 *
 * Wipes all existing [SEED] reports and inserts 6 enriched reports per
 * Udupi ward (35 wards → 210 reports) with:
 *   - Realistic 30-day timelines per status
 *   - Addresses derived from ward localities
 *   - Brand names on ~25 % of reports
 *   - Status distributions engineered to trigger every dashboard alert:
 *       HI1 ~50 % cleaned  (backlog pulse fires — 3 unresolved/ward)
 *       HI2 ~17 % cleaned  (EE orange alert + heavy backlog)
 *       HI3 ~67 % cleaned  (healthy — no backlog)
 *       HI4 ~33 % cleaned  (EE orange alert + backlog fires)
 *
 * ⚠️  SALIGRAMA SAFE: only deletes rows WHERE description LIKE '[SEED]%'.
 *     Real production reports never carry that prefix.
 *     No Saligrama coordinates, officers, or assigned_officer_id touched.
 *
 * Run:  pnpm --filter @workspace/scripts run seed:ward-reports
 * Wipe: pnpm --filter @workspace/scripts run seed:clean
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = dirname(fileURLToPath(import.meta.url));
const geofencesData = JSON.parse(
  readFileSync(
    join(__dirname, "../../artifacts/api-server/src/data/geofences.json"),
    "utf-8"
  )
);

// ── deterministic LCG RNG ─────────────────────────────────────────────────────
function makeLcg(seed: number) {
  let s = seed >>> 0;
  return (): number => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 4294967295;
  };
}

// ── ward metadata ─────────────────────────────────────────────────────────────

const WARD_LOCALITY: Record<number, string> = {
  1: "Kola", 2: "Vadabhandeshwara", 3: "Malpe Central", 4: "Kodavoor",
  5: "Kalmady", 6: "Moodubettu", 7: "Kodankuru", 8: "Nittur",
  9: "Subhrahmanya Nagar", 10: "Gopalapura", 11: "Kakkunje", 12: "Karamballi",
  13: "Moodu Perampalli", 14: "Saralabettu", 15: "Shettibettu", 16: "Parkala",
  17: "Eshwar Nagar", 18: "Manipal", 19: "Moodu Sagri", 20: "Indrali",
  21: "Indira Nagar", 22: "76 Badagubettu", 23: "Chitpady",
  24: "Kasthurba Nagar", 25: "Kunjibettu", 26: "Kadiyali", 27: "Gundibailu",
  28: "Bannanje", 29: "Tenkapete", 30: "Olakadu", 31: "Bailoor",
  32: "Kinnimulky", 33: "Ajjarakadu", 34: "Shiribeedu", 35: "Ambalapady",
};

/**
 * HI group → ward numbers.
 * HI1 = Surendra Hobalidara, HI2 = Harish Billava,
 * HI3 = Satheesh,            HI4 = Prakash Prabhu
 */
const WARD_HI_GROUP: Record<number, 1 | 2 | 3 | 4> = {};
[1,2,3,4,5,6,7,8,9,10,28,35].forEach((w) => (WARD_HI_GROUP[w] = 1));
[22,23,25,26,27,31].forEach((w) => (WARD_HI_GROUP[w] = 2));
[29,30,32,33,34].forEach((w) => (WARD_HI_GROUP[w] = 3));
[11,12,13,14,15,16,17,18,19,20,21,24].forEach((w) => (WARD_HI_GROUP[w] = 4));

/**
 * Ordered status sequences per HI group (6 reports / ward).
 * R=reported  Cl=cleaning  D=cleaned
 *
 * HI1: 2R 1Cl 3D → 50 % cleaned, 3 unresolved → backlog pulse ✓
 * HI2: 3R 2Cl 1D → 17 % cleaned, 5 unresolved → backlog + EE orange ✓
 * HI3: 1R 1Cl 4D → 67 % cleaned, 2 unresolved → healthy, no backlog
 * HI4: 2R 2Cl 2D → 33 % cleaned, 4 unresolved → backlog + EE orange ✓
 */
const STATUS_POOL: Record<1 | 2 | 3 | 4, string[]> = {
  1: ["reported","reported","cleaning","cleaned","cleaned","cleaned"],
  2: ["reported","reported","reported","cleaning","cleaning","cleaned"],
  3: ["reported","cleaning","cleaned","cleaned","cleaned","cleaned"],
  4: ["reported","reported","cleaning","cleaning","cleaned","cleaned"],
};

// ── content pools ─────────────────────────────────────────────────────────────

const LANDMARKS = [
  "Near Main Road", "Opposite Bus Stand", "Market Area",
  "Near Community Hall", "Temple Road Junction", "Near School Gate",
  "Near Municipal Office", "Behind Post Office", "Near Junction", "Roadside",
];

const WASTE_TYPES: string[][] = [
  ["plastic bottles"], ["food waste"], ["construction debris"],
  ["paper", "plastic bottles"], ["glass"], ["electronic waste"], ["tyres"],
  ["clothing"], ["mixed municipal waste"], ["food waste", "plastic bottles"],
  ["construction debris", "tyres"], ["medical waste"],
];

const SEVERITIES = ["low", "medium", "high"];

const BRAND_POOLS: string[][] = [
  ["Coca-Cola"], ["Pepsi"], ["Nestlé"], ["Parle"], ["Britannia"],
  ["ITC"], ["Haldirams"], ["Amul"], ["MTR"], ["Coca-Cola", "Pepsi"],
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

// ── geometry ──────────────────────────────────────────────────────────────────

function wardCentroid(wardName: string): { lat: number; lng: number } | null {
  const f = (geofencesData.features as any[]).find(
    (x) =>
      x.geometry.type === "Polygon" &&
      x.properties?.type === "ward" &&
      x.properties?.name === wardName
  );
  if (!f) return null;
  const coords: [number, number][] = f.geometry.coordinates[0];
  return {
    lat: coords.reduce((s, [, y]) => s + y, 0) / coords.length,
    lng: coords.reduce((s, [x]) => s + x, 0) / coords.length,
  };
}

// ── timestamp helpers (30-day window) ─────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

function timestampsFor(
  status: string,
  rand: () => number,
  now: number
): { createdAt: Date; cleaningStartedAt: Date | null; cleanedAt: Date | null; updatedAt: Date } {
  let createdAt: Date;
  let cleaningStartedAt: Date | null = null;
  let cleanedAt: Date | null = null;

  if (status === "reported") {
    // Recent — 0 to 10 days ago
    createdAt = new Date(now - rand() * 10 * DAY);
  } else if (status === "cleaning") {
    // Mid-range — created 10–20 days ago, cleaning started 1–4 days later
    createdAt = new Date(now - (10 + rand() * 10) * DAY);
    cleaningStartedAt = new Date(createdAt.getTime() + (1 + rand() * 3) * DAY);
  } else {
    // Older — created 15–30 days ago, resolved within a week
    createdAt = new Date(now - (15 + rand() * 15) * DAY);
    cleaningStartedAt = new Date(createdAt.getTime() + (1 + rand() * 4) * DAY);
    cleanedAt = new Date(cleaningStartedAt.getTime() + (1 + rand() * 3) * DAY);
  }

  const updatedAt = cleanedAt ?? cleaningStartedAt ?? createdAt;
  return { createdAt, cleaningStartedAt, cleanedAt, updatedAt };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== Udupi ward report seed — v2 (30-day enriched) ===\n");

    // Wipe previous seed rows (Saligrama safe: real reports have no [SEED] prefix)
    const { rowCount: wiped } = await client.query(
      `DELETE FROM reports WHERE description LIKE '[SEED]%'`
    );
    console.log(`🗑  Removed ${wiped ?? 0} old [SEED] reports\n`);

    const now = Date.now();
    let totalInserted = 0;

    for (let w = 1; w <= 35; w++) {
      const wardName  = `Udupi Ward ${w}`;
      const locality  = WARD_LOCALITY[w] ?? `Ward ${w}`;
      const hiGroup   = (WARD_HI_GROUP[w] ?? 1) as 1 | 2 | 3 | 4;
      const statuses  = STATUS_POOL[hiGroup];
      const centroid  = wardCentroid(wardName);

      if (!centroid) {
        console.warn(`  ⚠️  No polygon for ${wardName} — skipping`);
        continue;
      }

      // Per-ward deterministic RNG so output is reproducible
      const rand = makeLcg(w * 31337 + 2025);

      for (const status of statuses) {
        const lat = centroid.lat + (rand() - 0.5) * 0.001;
        const lng = centroid.lng + (rand() - 0.5) * 0.001;

        const landmark  = LANDMARKS[Math.floor(rand() * LANDMARKS.length)];
        const address   = `${landmark}, ${locality}, Udupi District`;
        const desc      = `[SEED] ${DESCRIPTIONS[Math.floor(rand() * DESCRIPTIONS.length)]}`;
        const wasteTypes = WASTE_TYPES[Math.floor(rand() * WASTE_TYPES.length)];
        const severity  = SEVERITIES[Math.floor(rand() * SEVERITIES.length)];
        const brandNames = rand() < 0.25
          ? BRAND_POOLS[Math.floor(rand() * BRAND_POOLS.length)]
          : null;

        const { createdAt, cleaningStartedAt, cleanedAt, updatedAt } =
          timestampsFor(status, rand, now);

        await client.query(
          `INSERT INTO reports
             (latitude, longitude, status, description, address,
              waste_types, waste_severity, brand_names,
              created_at, updated_at, cleaning_started_at, cleaned_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12)`,
          [
            lat, lng, status, desc, address,
            JSON.stringify(wasteTypes), severity,
            brandNames ? JSON.stringify(brandNames) : null,
            createdAt, updatedAt, cleaningStartedAt, cleanedAt,
          ]
        );
        totalInserted++;
      }

      const label =
        hiGroup === 2 ? "HI2 ⚠ low-res" :
        hiGroup === 4 ? "HI4 ⚠ low-res" :
        hiGroup === 3 ? "HI3 ✓ healthy" :
                        "HI1 ◑ mid-res";
      console.log(`  ✓ ${wardName.padEnd(16)} [${statuses.join(", ")}]  ${label}`);
    }

    // Summary
    const { rows: summary } = await client.query<{
      status: string; cnt: string;
    }>(
      `SELECT status, count(*)::text AS cnt
         FROM reports WHERE description LIKE '[SEED]%'
         GROUP BY status ORDER BY status`
    );

    console.log(`\n✅ Inserted ${totalInserted} seed reports across 35 Udupi wards.`);
    console.log("\nStatus breakdown:");
    for (const r of summary) {
      console.log(`  ${r.status.padEnd(10)} ${r.cnt}`);
    }
    console.log("\nResolution % by HI group:");
    console.log("  HI1 (Wards 1-10,28,35)      : ~50 % cleaned  — borderline");
    console.log("  HI2 (Wards 22,23,25-27,31)  : ~17 % cleaned  — EE orange alert ✓");
    console.log("  HI3 (Wards 29,30,32-34)     : ~67 % cleaned  — healthy");
    console.log("  HI4 (Wards 11-21,24)        : ~33 % cleaned  — EE orange alert ✓");
    console.log("\nBacklog (≥3 unresolved/ward):");
    console.log("  HI1 → 3 unresolved  → pulse fires ✓");
    console.log("  HI2 → 5 unresolved  → pulse fires ✓");
    console.log("  HI3 → 2 unresolved  → no pulse (healthy ward)");
    console.log("  HI4 → 4 unresolved  → pulse fires ✓");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
