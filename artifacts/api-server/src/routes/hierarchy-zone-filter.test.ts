/**
 * Zone-filter integration tests for the three flat-report endpoints:
 *   GET /api/health-inspector/reports
 *   GET /api/env-engineer/reports
 *   GET /api/commissioner/reports
 *
 * Each test inserts real DB rows (EE → HI → Supervisor → wards) and two
 * reports — one inside the assigned ward, one outside every Udupi ward —
 * then verifies that only the in-zone report is returned, and that the
 * ?status= filter correctly scopes by status.
 *
 * Ward 1 centroid used for "inside" coordinates:
 *   lat=13.355311, lng=74.701861  (computed from geofences.json ring)
 *
 * Outside coordinates (well outside all Udupi ward polygons):
 *   lat=12.0, lng=77.0
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { signSession } from "../lib/auth";
import type { SessionUser } from "../lib/auth";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Centroid of Udupi Ward 1 — guaranteed to be inside the ward polygon. */
const INSIDE_LAT = 13.355311;
const INSIDE_LNG = 74.701861;

/** A point well outside every Udupi ward polygon. */
const OUTSIDE_LAT = 12.0;
const OUTSIDE_LNG = 77.0;

function sessionCookie(partial: Partial<SessionUser> & Pick<SessionUser, "role">): string {
  return signSession({
    id: 9999,
    email: "test@example.com",
    name: "Test User",
    officerId: null,
    panchayatName: null,
    ...partial,
  });
}

// ── Shared fixture state ──────────────────────────────────────────────────────

let app: Express;

let eeId: number;
let hiId: number;
let svId: number;

/** IDs of test reports created by this suite — cleaned up in afterAll. */
const createdReportIds: number[] = [];
/** IDs of other raw rows to clean up */
const createdSvIds: number[] = [];
const createdHiIds: number[] = [];
const createdEeIds: number[] = [];

// Coordinates of the "inside" report
let insideReportId: number;
// Coordinates of the "outside" report (should never appear)
let outsideReportId: number;
// A second "inside" report with status="cleaning" to test the filter
let insideCleaningReportId: number;
// Dedicated report for supervisor status-transition tests so the shared filter
// fixtures keep their original statuses for later hierarchy test suites.
let supervisorTransitionReportId: number;

beforeAll(async () => {
  // Load the Express app
  const mod = await import("../app");
  app = mod.default as Express;

  const ts = Date.now();

  // ── 1. Insert Environmental Engineer ────────────────────────────────────────
  const eeResult = await db.execute(sql`
    INSERT INTO environmental_engineers (name, phone, panchayat_name)
    VALUES (${"Zone Test EE " + ts}, ${"9" + String(ts).slice(-9)}, ${"Udupi"})
    RETURNING id
  `);
  eeId = (eeResult.rows[0] as any).id as number;
  createdEeIds.push(eeId);

  // ── 2. Insert Health Inspector under that EE ─────────────────────────────────
  const hiResult = await db.execute(sql`
    INSERT INTO health_inspectors (name, phone, panchayat_name, environmental_engineer_id)
    VALUES (${"Zone Test HI " + ts}, ${"8" + String(ts).slice(-9)}, ${"Udupi"}, ${eeId})
    RETURNING id
  `);
  hiId = (hiResult.rows[0] as any).id as number;
  createdHiIds.push(hiId);

  // ── 3. Insert Supervisor under that HI, assigned to Ward 1 ───────────────────
  //  ward_names must be a JSONB array of strings matching "Ward N/…" format.
  const svResult = await db.execute(sql`
    INSERT INTO supervisors (name, phone, panchayat_name, ward_names, health_inspector_id)
    VALUES (
      ${"Zone Test SV " + ts},
      ${"7" + String(ts).slice(-9)},
      ${"Udupi"},
      ${JSON.stringify(["Ward 1/Town"])},
      ${hiId}
    )
    RETURNING id
  `);
  svId = (svResult.rows[0] as any).id as number;
  createdSvIds.push(svId);

  // ── 4. Insert reports ────────────────────────────────────────────────────────

  // Inside Ward 1, status="reported"
  const r1 = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description)
    VALUES (${INSIDE_LAT}, ${INSIDE_LNG}, ${"reported"}, ${"Inside Ward 1"}, ${"zone filter test"})
    RETURNING id
  `);
  insideReportId = (r1.rows[0] as any).id as number;
  createdReportIds.push(insideReportId);

  // Outside all Udupi wards, status="reported"
  const r2 = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description)
    VALUES (${OUTSIDE_LAT}, ${OUTSIDE_LNG}, ${"reported"}, ${"Outside Udupi"}, ${"zone filter test outside"})
    RETURNING id
  `);
  outsideReportId = (r2.rows[0] as any).id as number;
  createdReportIds.push(outsideReportId);

  // Inside Ward 1, status="cleaning" — used to verify ?status= filter
  const r3 = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description)
    VALUES (${INSIDE_LAT}, ${INSIDE_LNG}, ${"cleaning"}, ${"Inside Ward 1 cleaning"}, ${"zone filter test cleaning"})
    RETURNING id
  `);
  insideCleaningReportId = (r3.rows[0] as any).id as number;
  createdReportIds.push(insideCleaningReportId);

  const r4 = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description)
    VALUES (${INSIDE_LAT}, ${INSIDE_LNG}, ${"reported"}, ${"Supervisor transition test"}, ${"cleanup evidence test"})
    RETURNING id
  `);
  supervisorTransitionReportId = (r4.rows[0] as any).id as number;
  createdReportIds.push(supervisorTransitionReportId);
});

afterAll(async () => {
  // Clean up in reverse-dependency order
  if (createdReportIds.length) {
    await db.execute(
      sql`DELETE FROM reports WHERE id IN (${sql.raw(createdReportIds.join(","))})`
    );
  }
  if (createdSvIds.length) {
    await db.execute(
      sql`DELETE FROM supervisors WHERE id IN (${sql.raw(createdSvIds.join(","))})`
    );
  }
  if (createdHiIds.length) {
    await db.execute(
      sql`DELETE FROM health_inspectors WHERE id IN (${sql.raw(createdHiIds.join(","))})`
    );
  }
  if (createdEeIds.length) {
    await db.execute(
      sql`DELETE FROM environmental_engineers WHERE id IN (${sql.raw(createdEeIds.join(","))})`
    );
  }
});

// ── Test suites ───────────────────────────────────────────────────────────────

describe("GET /api/health-inspector/reports — zone-scoped PiP filter", () => {
  it("returns 403 for wrong role", async () => {
    const res = await request(app)
      .get("/api/health-inspector/reports")
      .set("Cookie", `session=${sessionCookie({ role: "supervisor" })}`);
    expect(res.status).toBe(403);
  });

  it("includes in-zone reports (Ward 1) and excludes out-of-zone reports", async () => {
    const res = await request(app)
      .get("/api/health-inspector/reports")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "health_inspector", officerId: hiId, panchayatName: "Udupi" })}`,
      );

    expect(res.status).toBe(200);
    const ids: number[] = res.body.reports.map((r: any) => r.id);

    // The in-zone "reported" report must appear
    expect(ids).toContain(insideReportId);
    // The "cleaning" in-zone report also appears when no status filter
    expect(ids).toContain(insideCleaningReportId);
    // The out-of-zone report must NOT appear
    expect(ids).not.toContain(outsideReportId);
  });

  it("?status=cleaning returns only cleaning reports inside the zone", async () => {
    const res = await request(app)
      .get("/api/health-inspector/reports?status=cleaning")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "health_inspector", officerId: hiId, panchayatName: "Udupi" })}`,
      );

    expect(res.status).toBe(200);
    const ids: number[] = res.body.reports.map((r: any) => r.id);

    expect(ids).toContain(insideCleaningReportId);
    expect(ids).not.toContain(insideReportId); // status="reported", filtered out
    expect(ids).not.toContain(outsideReportId);
  });

  it("?status=reported returns only reported reports inside the zone", async () => {
    const res = await request(app)
      .get("/api/health-inspector/reports?status=reported")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "health_inspector", officerId: hiId, panchayatName: "Udupi" })}`,
      );

    expect(res.status).toBe(200);
    const ids: number[] = res.body.reports.map((r: any) => r.id);

    expect(ids).toContain(insideReportId);
    expect(ids).not.toContain(insideCleaningReportId); // status="cleaning", filtered out
    expect(ids).not.toContain(outsideReportId);
  });

  it("?status=<invalid> returns 400", async () => {
    const res = await request(app)
      .get("/api/health-inspector/reports?status=bogus")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "health_inspector", officerId: hiId, panchayatName: "Udupi" })}`,
      );
    expect(res.status).toBe(400);
  });

  it("response includes wardName and total count", async () => {
    const res = await request(app)
      .get("/api/health-inspector/reports")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "health_inspector", officerId: hiId, panchayatName: "Udupi" })}`,
      );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(typeof res.body.total).toBe("number");

    // Every returned report that belongs to our ward should carry wardName
    const ourReports = res.body.reports.filter((r: any) =>
      [insideReportId, insideCleaningReportId].includes(r.id)
    );
    for (const r of ourReports) {
      expect(r).toHaveProperty("wardName");
      expect(r.wardName).toMatch(/Udupi Ward/);
    }
  });
});

describe("PATCH /api/supervisor/reports/:id — Udupi cleanup evidence", () => {
  const supervisorCookie = () =>
    `session=${sessionCookie({ role: "supervisor", officerId: svId, panchayatName: "Udupi" })}`;

  it("allows a supervisor to mark an in-ward report In Progress without cleanup photos", async () => {
    const res = await request(app)
      .patch(`/api/supervisor/reports/${supervisorTransitionReportId}`)
      .set("Cookie", supervisorCookie())
      .send({ status: "cleaning" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: supervisorTransitionReportId, status: "cleaning" });
  });

  it("rejects marking an in-ward report Cleaned without cleanup evidence", async () => {
    const res = await request(app)
      .patch(`/api/supervisor/reports/${supervisorTransitionReportId}`)
      .set("Cookie", supervisorCookie())
      .send({ status: "cleaned" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cleanup photo is required/i);
  });

  it("stores cleanup evidence when marking an in-ward report Cleaned", async () => {
    const cleanupImageUrls = [
      { url: "https://example.test/cleanup-one.jpg", uploadedAt: "2026-08-10T10:00:00.000Z" },
      { url: "https://example.test/cleanup-two.jpg", uploadedAt: "2026-08-10T10:01:00.000Z" },
    ];
    const res = await request(app)
      .patch(`/api/supervisor/reports/${supervisorTransitionReportId}`)
      .set("Cookie", supervisorCookie())
      .send({ status: "cleaned", cleanupImageUrls });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: supervisorTransitionReportId,
      status: "cleaned",
      cleanupImageUrl: cleanupImageUrls[0].url,
      cleanupImageUrls,
    });
  });

  it("keeps out-of-ward reports blocked even when cleanup evidence is supplied", async () => {
    const res = await request(app)
      .patch(`/api/supervisor/reports/${outsideReportId}`)
      .set("Cookie", supervisorCookie())
      .send({
        status: "cleaned",
        cleanupImageUrls: [{ url: "https://example.test/cleanup.jpg" }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not in your wards/i);
  });
});

describe("GET /api/env-engineer/reports — zone-scoped PiP filter", () => {
  it("returns 403 for wrong role", async () => {
    const res = await request(app)
      .get("/api/env-engineer/reports")
      .set("Cookie", `session=${sessionCookie({ role: "health_inspector" })}`);
    expect(res.status).toBe(403);
  });

  it("includes in-zone reports and excludes out-of-zone reports", async () => {
    const res = await request(app)
      .get("/api/env-engineer/reports")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "environmental_engineer", officerId: eeId, panchayatName: "Udupi" })}`,
      );

    expect(res.status).toBe(200);
    const ids: number[] = res.body.reports.map((r: any) => r.id);

    expect(ids).toContain(insideReportId);
    expect(ids).toContain(insideCleaningReportId);
    expect(ids).not.toContain(outsideReportId);
  });

  it("?status=cleaning returns only cleaning reports inside the zone", async () => {
    const res = await request(app)
      .get("/api/env-engineer/reports?status=cleaning")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "environmental_engineer", officerId: eeId, panchayatName: "Udupi" })}`,
      );

    expect(res.status).toBe(200);
    const ids: number[] = res.body.reports.map((r: any) => r.id);

    expect(ids).toContain(insideCleaningReportId);
    expect(ids).not.toContain(insideReportId);
    expect(ids).not.toContain(outsideReportId);
  });

  it("?status=reported returns only reported reports inside the zone", async () => {
    const res = await request(app)
      .get("/api/env-engineer/reports?status=reported")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "environmental_engineer", officerId: eeId, panchayatName: "Udupi" })}`,
      );

    expect(res.status).toBe(200);
    const ids: number[] = res.body.reports.map((r: any) => r.id);

    expect(ids).toContain(insideReportId);
    expect(ids).not.toContain(insideCleaningReportId);
    expect(ids).not.toContain(outsideReportId);
  });

  it("?status=<invalid> returns 400", async () => {
    const res = await request(app)
      .get("/api/env-engineer/reports?status=bogus")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "environmental_engineer", officerId: eeId, panchayatName: "Udupi" })}`,
      );
    expect(res.status).toBe(400);
  });

  it("response includes wardName, supervisorName, hiName and total count", async () => {
    const res = await request(app)
      .get("/api/env-engineer/reports")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "environmental_engineer", officerId: eeId, panchayatName: "Udupi" })}`,
      );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");

    const ourReports = res.body.reports.filter((r: any) =>
      [insideReportId, insideCleaningReportId].includes(r.id)
    );
    for (const r of ourReports) {
      expect(r).toHaveProperty("wardName");
      expect(r).toHaveProperty("supervisorName");
      expect(r).toHaveProperty("hiName");
    }
  });
});

describe("GET /api/commissioner/reports — zone-scoped PiP filter", () => {
  it("returns 403 for wrong role", async () => {
    const res = await request(app)
      .get("/api/commissioner/reports")
      .set("Cookie", `session=${sessionCookie({ role: "health_inspector" })}`);
    expect(res.status).toBe(403);
  });

  it("includes in-zone reports and excludes out-of-zone reports", async () => {
    const res = await request(app)
      .get("/api/commissioner/reports")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "commissioner", panchayatName: "Udupi" })}`,
      );

    expect(res.status).toBe(200);
    const ids: number[] = res.body.reports.map((r: any) => r.id);

    expect(ids).toContain(insideReportId);
    expect(ids).toContain(insideCleaningReportId);
    expect(ids).not.toContain(outsideReportId);
  });

  it("?status=cleaning returns only cleaning reports inside the zone", async () => {
    const res = await request(app)
      .get("/api/commissioner/reports?status=cleaning")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "commissioner", panchayatName: "Udupi" })}`,
      );

    expect(res.status).toBe(200);
    const ids: number[] = res.body.reports.map((r: any) => r.id);

    expect(ids).toContain(insideCleaningReportId);
    expect(ids).not.toContain(insideReportId);
    expect(ids).not.toContain(outsideReportId);
  });

  it("?status=reported returns only reported reports inside the zone", async () => {
    const res = await request(app)
      .get("/api/commissioner/reports?status=reported")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "commissioner", panchayatName: "Udupi" })}`,
      );

    expect(res.status).toBe(200);
    const ids: number[] = res.body.reports.map((r: any) => r.id);

    expect(ids).toContain(insideReportId);
    expect(ids).not.toContain(insideCleaningReportId);
    expect(ids).not.toContain(outsideReportId);
  });

  it("?status=<invalid> returns 400", async () => {
    const res = await request(app)
      .get("/api/commissioner/reports?status=bogus")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "commissioner", panchayatName: "Udupi" })}`,
      );
    expect(res.status).toBe(400);
  });

  it("response includes wardName, supervisorName, hiName and total count", async () => {
    const res = await request(app)
      .get("/api/commissioner/reports")
      .set(
        "Cookie",
        `session=${sessionCookie({ role: "commissioner", panchayatName: "Udupi" })}`,
      );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");

    const ourReports = res.body.reports.filter((r: any) =>
      [insideReportId, insideCleaningReportId].includes(r.id)
    );
    for (const r of ourReports) {
      expect(r).toHaveProperty("wardName");
      expect(r).toHaveProperty("supervisorName");
      expect(r).toHaveProperty("hiName");
    }
  });
});
