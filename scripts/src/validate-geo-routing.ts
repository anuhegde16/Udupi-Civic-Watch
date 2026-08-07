/**
 * validate-geo-routing.ts
 *
 * Regression script confirming the two-municipality service-area gate and
 * officer routing logic behave correctly after any geofences.json change.
 *
 * Run with:  pnpm --filter @workspace/scripts validate:geo
 *
 * The script is self-contained and non-persistent:
 *  - Creates a temporary Udupi Ward 14 officer via the admin API (random password)
 *  - Runs all assertions
 *  - Always cleans up in a finally block — covers failures, assertion errors, Ctrl-C
 *
 * Exits 0 on all assertions passing, 1 on any failure.
 */

import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Load geofences (single source of truth in the API server) ────────────────
const geofencesPath = resolve(__dirname, "../../artifacts/api-server/src/data/geofences.json");
const geofencesData = require(geofencesPath) as { features: any[] };

// ── Ray-casting point-in-polygon (identical to geo.ts) ───────────────────────
function pointInPolygon(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isWithinServiceArea(lat: number, lng: number): boolean {
  for (const feature of geofencesData.features) {
    const featureType = (feature.properties as { type?: string })?.type;
    if (feature.geometry.type === "Polygon" && featureType !== "ward") {
      const ring = feature.geometry.coordinates[0] as [number, number][];
      if (pointInPolygon(lat, lng, ring)) return true;
    }
  }
  return false;
}

function panchayatForPoint(lat: number, lng: number): string | null {
  for (const feature of geofencesData.features) {
    const props = feature.properties as { type?: string; panchayat?: string };
    if (feature.geometry.type === "Polygon" && props.type !== "ward") {
      const ring = feature.geometry.coordinates[0] as [number, number][];
      if (pointInPolygon(lat, lng, ring)) return props.panchayat ?? null;
    }
  }
  return null;
}

// ── Assertion helpers ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅  ${description}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${description}${detail ? `\n       → ${detail}` : ""}`);
    failed++;
  }
}

function fail(description: string, detail?: string) {
  console.error(`  ❌  FAIL: ${description}${detail ? `\n       → ${detail}` : ""}`);
  failed++;
}

// ── Known coordinates ────────────────────────────────────────────────────────
const UDUPI_POINT     = { lat: 13.367,  lng: 74.795, label: "Udupi town centre (Ward 14)" };
const SALIGRAMA_POINT = { lat: 13.490,  lng: 74.702, label: "Saligrama town centre"        };
const OUTSIDE_1       = { lat: 13.000,  lng: 74.500, label: "Far south (Mangaluru coast)"  };
const OUTSIDE_2       = { lat: 14.000,  lng: 74.800, label: "Far north (Goa direction)"    };
const OUTSIDE_3       = { lat: 13.367,  lng: 74.600, label: "Correct latitude, west of Udupi" };

// ── Pure-logic checks (no DB, no network, no mutation) ───────────────────────
console.log("\n── Service-area gate (pure logic) ──────────────────────────────────────\n");

assert(`${UDUPI_POINT.label} is INSIDE service area`,      isWithinServiceArea(UDUPI_POINT.lat,     UDUPI_POINT.lng));
assert(`${SALIGRAMA_POINT.label} is INSIDE service area`,  isWithinServiceArea(SALIGRAMA_POINT.lat, SALIGRAMA_POINT.lng));
assert(`${OUTSIDE_1.label} is OUTSIDE service area`,       !isWithinServiceArea(OUTSIDE_1.lat,      OUTSIDE_1.lng));
assert(`${OUTSIDE_2.label} is OUTSIDE service area`,       !isWithinServiceArea(OUTSIDE_2.lat,      OUTSIDE_2.lng));
assert(`${OUTSIDE_3.label} is OUTSIDE service area`,       !isWithinServiceArea(OUTSIDE_3.lat,      OUTSIDE_3.lng));

console.log("\n── Panchayat attribution (pure logic) ──────────────────────────────────\n");

assert(`${UDUPI_POINT.label} is attributed to "Udupi"`,         panchayatForPoint(UDUPI_POINT.lat,     UDUPI_POINT.lng) === "Udupi");
assert(`${SALIGRAMA_POINT.label} is attributed to "Saligrama"`, panchayatForPoint(SALIGRAMA_POINT.lat, SALIGRAMA_POINT.lng) === "Saligrama");
assert(`Out-of-area point has no panchayat`,                    panchayatForPoint(OUTSIDE_1.lat,       OUTSIDE_1.lng) === null);

console.log("\n── Ward containment & counts (pure logic) ──────────────────────────────\n");

const wardFeatures   = geofencesData.features.filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "ward");
const saligramaWards = wardFeatures.filter((f) => (f.properties as any)?.panchayat === "Saligrama");
const udupiWards     = wardFeatures.filter((f) => (f.properties as any)?.panchayat === "Udupi");

assert(`Saligrama has exactly 16 wards`, saligramaWards.length === 16, `got ${saligramaWards.length}`);
assert(`Udupi has exactly 35 wards`,     udupiWards.length === 35,     `got ${udupiWards.length}`);
assert(`Total ward count is 51`,         wardFeatures.length === 51,   `got ${wardFeatures.length}`);

const inSomeUdupiWard = udupiWards.some((f) =>
  pointInPolygon(UDUPI_POINT.lat, UDUPI_POINT.lng, f.geometry.coordinates[0] as [number, number][])
);
assert(`${UDUPI_POINT.label} falls inside at least one Udupi ward`, inSomeUdupiWard);

const inSomeSaligramaWard = saligramaWards.some((f) =>
  pointInPolygon(SALIGRAMA_POINT.lat, SALIGRAMA_POINT.lng, f.geometry.coordinates[0] as [number, number][])
);
assert(`${SALIGRAMA_POINT.label} falls inside at least one Saligrama ward`, inSomeSaligramaWard);

assert(
  `${UDUPI_POINT.label} does NOT fall inside any Saligrama ward`,
  !saligramaWards.some((f) =>
    pointInPolygon(UDUPI_POINT.lat, UDUPI_POINT.lng, f.geometry.coordinates[0] as [number, number][])
  )
);

// ── Live API setup ───────────────────────────────────────────────────────────
console.log("\n── Live API: authenticated session ─────────────────────────────────────\n");

const API_BASE = `http://localhost:${process.env["PORT"] ?? 8080}`;
const CC_EMAIL    = "admin@udupicivicwatch.com";
const CC_PASSWORD = CC_EMAIL;

const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: CC_EMAIL, password: CC_PASSWORD }),
});

if (!loginRes.ok) {
  fail(`Control center login must succeed (got ${loginRes.status})`);
  console.log(`\n  ${passed} passed  ${failed} failed\n`);
  process.exit(1);
}

type LoginResponse = { user?: { role?: string } };
const loginBody = await loginRes.json() as LoginResponse;
assert(`Control center login returns role "control_center"`, loginBody?.user?.role === "control_center");

const rawCookie = loginRes.headers.get("set-cookie");
if (!rawCookie) {
  fail("Login response must set a session cookie");
  process.exit(1);
}
const ccCookie = rawCookie.split(";")[0];

async function ccDelete(path: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { method: "DELETE", headers: { Cookie: ccCookie } });
}

/** Hard-delete a test report. Throws on failure. */
async function cleanupReport(id: number): Promise<void> {
  const r1 = await ccDelete(`/api/admin/reports/${id}`);
  if (!r1.ok) throw new Error(`Archive report ${id}: HTTP ${r1.status}`);
  const r2 = await ccDelete(`/api/admin/reports/${id}/permanent`);
  if (!r2.ok) throw new Error(`Permanent-delete report ${id}: HTTP ${r2.status}`);
}

// ── Tracked fixtures — always cleaned in finally ─────────────────────────────
let tmpOfficerId: number | null = null;
const tmpReportIds: number[] = [];
let skipRouting = false; // set true when officer creation fails so routing checks are skipped

/** Run cleanup for all fixtures created so far. Logs but does not throw. */
async function cleanupAll(): Promise<void> {
  console.log("\n── Cleanup ─────────────────────────────────────────────────────────────\n");
  let cleanupFailed = false;

  for (const id of tmpReportIds) {
    try {
      await cleanupReport(id);
      console.log(`  🗑   Test report ${id} permanently deleted`);
    } catch (err) {
      console.error(`  ❌  Cleanup FAILED for report ${id}: ${String(err)}`);
      cleanupFailed = true;
    }
  }

  if (tmpOfficerId !== null) {
    const r = await ccDelete(`/api/officers/${tmpOfficerId}`);
    if (r.ok) {
      console.log(`  🗑   Temporary officer ${tmpOfficerId} deleted`);
    } else {
      console.error(`  ❌  Cleanup FAILED for officer ${tmpOfficerId}: HTTP ${r.status}`);
      cleanupFailed = true;
    }
  }

  if (cleanupFailed) {
    console.error("\n  ⚠️   Some cleanup steps failed — manual intervention may be needed.");
    failed++;
  }
}

// Register signal handlers so cleanup runs even on Ctrl-C or SIGTERM
let cleanupStarted = false;
async function handleSignal(signal: string): Promise<void> {
  if (cleanupStarted) return;
  cleanupStarted = true;
  console.log(`\n  ⚠️   ${signal} received — running cleanup before exit`);
  await cleanupAll().catch(() => {});
  process.exit(1);
}
process.on("SIGINT",  () => void handleSignal("SIGINT"));
process.on("SIGTERM", () => void handleSignal("SIGTERM"));

// ── Live-API checks in try/finally ───────────────────────────────────────────
try {
  // ── Create temporary Udupi Ward 14 officer ──────────────────────────────
  console.log("\n── Temporary Udupi Ward 14 officer setup ───────────────────────────────\n");

  const tmpEmail    = `geo-validation-udupi14-${randomBytes(6).toString("hex")}@test.invalid`;
  const tmpPassword = randomBytes(24).toString("base64url");

  type OfficerResponse = { id?: number; name?: string; email?: string; areaName?: string };
  const createOfficerRes = await fetch(`${API_BASE}/api/officers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ccCookie },
    body: JSON.stringify({
      name: "Geo-Validation Udupi Ward 14",
      email: tmpEmail,
      password: tmpPassword,
      areaName: "Udupi Ward 14",
      panchayatName: "Udupi",
    }),
  });

  const createdOfficer = await createOfficerRes.json().catch(() => ({})) as OfficerResponse;

  if (createOfficerRes.status !== 201 || !createdOfficer.id) {
    fail(
      `Temporary Udupi Ward 14 officer must be created (got ${createOfficerRes.status})`,
      JSON.stringify(createdOfficer)
    );
    // Cannot proceed with routing checks without the officer; fall through to finally
    skipRouting = true;
  }

  if (!skipRouting) {
    // Register officer immediately so it's cleaned up even if later steps throw
    tmpOfficerId = createdOfficer.id!;
    console.log(`  ℹ️   Created temporary officer id=${tmpOfficerId} email=${tmpEmail}`);
    assert(`Temporary officer areaName is "Udupi Ward 14"`, createdOfficer.areaName === "Udupi Ward 14");

    // ── Service-area gate ───────────────────────────────────────────────────
    console.log("\n── Live API: service-area gate ─────────────────────────────────────────\n");

    type ReportResponse = { id?: number; assignedOfficer?: { id?: number; areaName?: string } | null };

    // 1. Out-of-area → 422
    const outsideRes = await fetch(`${API_BASE}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: OUTSIDE_1.lat, longitude: OUTSIDE_1.lng, description: "geo-validation: outside" }),
    });
    assert(
      `POST /reports with out-of-area coords returns 422`,
      outsideRes.status === 422,
      `got HTTP ${outsideRes.status}`
    );

    // 2. Udupi point → 201, routed to the temporary Udupi Ward 14 officer
    const udupiReportRes = await fetch(`${API_BASE}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: UDUPI_POINT.lat, longitude: UDUPI_POINT.lng, description: "geo-validation: Udupi", force: true }),
    });
    const udupiReportBody = await udupiReportRes.json().catch(() => ({})) as ReportResponse;

    if (udupiReportRes.status !== 201) {
      fail(`POST /reports with Udupi coords must return 201`, `got HTTP ${udupiReportRes.status}: ${JSON.stringify(udupiReportBody)}`);
    } else {
      assert(`POST /reports with Udupi coords returns 201`, true);

      // Register report immediately for cleanup
      if (udupiReportBody.id !== undefined) tmpReportIds.push(udupiReportBody.id);

      const assignedWard = udupiReportBody.assignedOfficer?.areaName;
      const assignedId   = udupiReportBody.assignedOfficer?.id;
      assert(
        `Udupi report is routed to the Udupi Ward 14 officer (areaName="${assignedWard}")`,
        assignedWard === "Udupi Ward 14",
        assignedWard ? `got "${assignedWard}"` : "assignedOfficer is null"
      );
      assert(
        `Assigned officer id matches the temporary officer (id=${assignedId})`,
        assignedId === tmpOfficerId,
        `expected ${tmpOfficerId}, got ${assignedId}`
      );

      // 3. Verify the assigned officer can log in and access the report
      if (udupiReportBody.id !== undefined) {
        console.log("\n── Live API: officer can access their assigned report ───────────────────\n");

        const officerLoginRes = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: tmpEmail, password: tmpPassword }),
        });

        if (!officerLoginRes.ok) {
          fail(`Udupi Ward 14 officer login must succeed (got ${officerLoginRes.status})`);
        } else {
          type OfficerLoginResponse = { user?: { role?: string } };
          const officerLoginBody = await officerLoginRes.json() as OfficerLoginResponse;
          assert(
            `Udupi officer login returns field_officer role`,
            officerLoginBody?.user?.role === "field_officer",
            `got role "${officerLoginBody?.user?.role}"`
          );

          const officerCookieRaw = officerLoginRes.headers.get("set-cookie");
          const officerCookie = officerCookieRaw ? officerCookieRaw.split(";")[0] : "";

          const reportFetchRes = await fetch(`${API_BASE}/api/reports/${udupiReportBody.id}`, {
            headers: { Cookie: officerCookie },
          });
          assert(
            `Udupi officer can retrieve report ${udupiReportBody.id} (HTTP ${reportFetchRes.status})`,
            reportFetchRes.ok,
            `got HTTP ${reportFetchRes.status}`
          );
        }
      }
    }

    // 4. Saligrama point → 201, routed to a Saligrama ward officer
    const saligramaReportRes = await fetch(`${API_BASE}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude: SALIGRAMA_POINT.lat, longitude: SALIGRAMA_POINT.lng, description: "geo-validation: Saligrama", force: true }),
    });
    const saligramaReportBody = await saligramaReportRes.json().catch(() => ({})) as ReportResponse;

    if (saligramaReportRes.status !== 201) {
      fail(`POST /reports with Saligrama coords must return 201`, `got HTTP ${saligramaReportRes.status}: ${JSON.stringify(saligramaReportBody)}`);
    } else {
      assert(`POST /reports with Saligrama coords returns 201`, true);

      // Register immediately for cleanup
      if (saligramaReportBody.id !== undefined) tmpReportIds.push(saligramaReportBody.id);

      const officerWard = saligramaReportBody.assignedOfficer?.areaName;
      // Saligrama wards: "Ward N"; Udupi wards: "Udupi Ward N"
      assert(
        `Saligrama report is routed to a Saligrama ward officer (areaName="${officerWard}")`,
        !!officerWard && /^Ward \d+$/.test(officerWard),
        officerWard ? `"${officerWard}" does not match Saligrama pattern "Ward N"` : "assignedOfficer.areaName is missing"
      );
    }
  }

} finally {
  if (!cleanupStarted) {
    cleanupStarted = true;
    await cleanupAll();
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────────────────`);
console.log(`  ${passed} passed  ${failed > 0 ? `${failed} FAILED` : "0 failed"}`);
console.log(`────────────────────────────────────────────────────────────────────────\n`);

if (failed > 0) process.exit(1);
