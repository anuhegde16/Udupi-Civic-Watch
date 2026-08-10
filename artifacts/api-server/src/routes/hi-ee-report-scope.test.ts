/**
 * Cross-zone scoping tests for the HI and EE report-by-ID endpoints:
 *   GET /api/health-inspector/report/:id
 *   GET /api/env-engineer/report/:id
 *
 * Scenario
 * ────────
 * Two independent chains are seeded for this suite:
 *
 *   Zone A  EE_A → HI_A → SV_A (Ward 1)   report_A planted at Ward 1 centroid
 *   Zone B  EE_B → HI_B → SV_B (Ward 22)  report_B planted at Ward 22 centroid
 *
 * Assertions
 * ──────────
 * - HI_A: GET report_A → 200 (own zone)
 * - HI_A: GET report_B → 404 (other zone)
 * - HI_B: GET report_B → 200 (own zone)
 * - HI_B: GET report_A → 404 (other zone)
 *
 * - EE_A: GET report_A → 200 (own zone via HI chain)
 * - EE_A: GET report_B → 404 (other zone)
 * - EE_B: GET report_B → 200 (own zone via HI chain)
 * - EE_B: GET report_A → 404 (other zone)
 *
 * Ward centroids (from geofences.json):
 *   Ward 1  lat=13.355311, lng=74.701861
 *   Ward 22 lat=13.319784, lng=74.753386
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { signSession } from "../lib/auth";
import type { SessionUser } from "../lib/auth";

// ── Coordinates ───────────────────────────────────────────────────────────────

/** Centroid of Udupi Ward 1 — inside the ward polygon. */
const WARD1_LAT = 13.355311;
const WARD1_LNG = 74.701861;

/** Centroid of Udupi Ward 22 — inside the ward polygon, different HI zone. */
const WARD22_LAT = 13.319784;
const WARD22_LNG = 74.753386;

// ── Helper ────────────────────────────────────────────────────────────────────

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

// ── Fixture IDs ───────────────────────────────────────────────────────────────

let app: Express;

// Zone A
let eeAId: number;
let hiAId: number;
let svAId: number;
let reportAId: number;

// Zone B
let eeBId: number;
let hiBId: number;
let svBId: number;
let reportBId: number;

// Cleanup buckets (reverse dependency order)
const cleanReportIds: number[] = [];
const cleanSvIds: number[] = [];
const cleanHiIds: number[] = [];
const cleanEeIds: number[] = [];

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const mod = await import("../app");
  app = mod.default as Express;

  const ts = Date.now();

  // ── Zone A: EE → HI → Supervisor (Ward 1) ──────────────────────────────────
  const eeA = await db.execute(sql`
    INSERT INTO environmental_engineers (name, phone, panchayat_name)
    VALUES (${"Scope Test EE_A " + ts}, ${"9" + String(ts).slice(-9)}, ${"Udupi"})
    RETURNING id
  `);
  eeAId = (eeA.rows[0] as any).id as number;
  cleanEeIds.push(eeAId);

  const hiA = await db.execute(sql`
    INSERT INTO health_inspectors (name, phone, panchayat_name, environmental_engineer_id)
    VALUES (${"Scope Test HI_A " + ts}, ${"8" + String(ts).slice(-9)}, ${"Udupi"}, ${eeAId})
    RETURNING id
  `);
  hiAId = (hiA.rows[0] as any).id as number;
  cleanHiIds.push(hiAId);

  const svA = await db.execute(sql`
    INSERT INTO supervisors (name, phone, panchayat_name, ward_names, health_inspector_id)
    VALUES (
      ${"Scope Test SV_A " + ts},
      ${"7" + String(ts).slice(-9)},
      ${"Udupi"},
      ${JSON.stringify(["Ward 1/Kola"])},
      ${hiAId}
    )
    RETURNING id
  `);
  svAId = (svA.rows[0] as any).id as number;
  cleanSvIds.push(svAId);

  // Report inside Zone A (Ward 1 centroid)
  const rA = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description)
    VALUES (${WARD1_LAT}, ${WARD1_LNG}, ${"reported"}, ${"Scope Test Ward 1"}, ${"hi-ee-scope-test zone A"})
    RETURNING id
  `);
  reportAId = (rA.rows[0] as any).id as number;
  cleanReportIds.push(reportAId);

  // ── Zone B: EE → HI → Supervisor (Ward 22) ─────────────────────────────────
  // Use slightly offset phone digits so there's no uniqueness collision
  const eeB = await db.execute(sql`
    INSERT INTO environmental_engineers (name, phone, panchayat_name)
    VALUES (${"Scope Test EE_B " + ts}, ${"6" + String(ts + 1).slice(-9)}, ${"Udupi"})
    RETURNING id
  `);
  eeBId = (eeB.rows[0] as any).id as number;
  cleanEeIds.push(eeBId);

  const hiB = await db.execute(sql`
    INSERT INTO health_inspectors (name, phone, panchayat_name, environmental_engineer_id)
    VALUES (${"Scope Test HI_B " + ts}, ${"5" + String(ts + 1).slice(-9)}, ${"Udupi"}, ${eeBId})
    RETURNING id
  `);
  hiBId = (hiB.rows[0] as any).id as number;
  cleanHiIds.push(hiBId);

  const svB = await db.execute(sql`
    INSERT INTO supervisors (name, phone, panchayat_name, ward_names, health_inspector_id)
    VALUES (
      ${"Scope Test SV_B " + ts},
      ${"4" + String(ts + 1).slice(-9)},
      ${"Udupi"},
      ${JSON.stringify(["Ward 22/76 Badagubettu"])},
      ${hiBId}
    )
    RETURNING id
  `);
  svBId = (svB.rows[0] as any).id as number;
  cleanSvIds.push(svBId);

  // Report inside Zone B (Ward 22 centroid)
  const rB = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description)
    VALUES (${WARD22_LAT}, ${WARD22_LNG}, ${"reported"}, ${"Scope Test Ward 22"}, ${"hi-ee-scope-test zone B"})
    RETURNING id
  `);
  reportBId = (rB.rows[0] as any).id as number;
  cleanReportIds.push(reportBId);
});

afterAll(async () => {
  if (cleanReportIds.length) {
    await db.execute(sql`DELETE FROM reports WHERE id IN (${sql.raw(cleanReportIds.join(","))})`);
  }
  if (cleanSvIds.length) {
    await db.execute(sql`DELETE FROM supervisors WHERE id IN (${sql.raw(cleanSvIds.join(","))})`);
  }
  if (cleanHiIds.length) {
    await db.execute(sql`DELETE FROM health_inspectors WHERE id IN (${sql.raw(cleanHiIds.join(","))})`);
  }
  if (cleanEeIds.length) {
    await db.execute(sql`DELETE FROM environmental_engineers WHERE id IN (${sql.raw(cleanEeIds.join(","))})`);
  }
});

// ── Health Inspector: report-by-ID scoping ────────────────────────────────────

describe("GET /api/health-inspector/report/:id — cross-zone 404 enforcement", () => {
  it("HI_A can retrieve their own report (Ward 1) → 200", async () => {
    const res = await request(app)
      .get(`/api/health-inspector/report/${reportAId}`)
      .set("Cookie", `session=${sessionCookie({ role: "health_inspector", officerId: hiAId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", reportAId);
  });

  it("HI_A cannot retrieve a report in HI_B's zone (Ward 22) → 404", async () => {
    const res = await request(app)
      .get(`/api/health-inspector/report/${reportBId}`)
      .set("Cookie", `session=${sessionCookie({ role: "health_inspector", officerId: hiAId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(404);
  });

  it("HI_B can retrieve their own report (Ward 22) → 200", async () => {
    const res = await request(app)
      .get(`/api/health-inspector/report/${reportBId}`)
      .set("Cookie", `session=${sessionCookie({ role: "health_inspector", officerId: hiBId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", reportBId);
  });

  it("HI_B cannot retrieve a report in HI_A's zone (Ward 1) → 404", async () => {
    const res = await request(app)
      .get(`/api/health-inspector/report/${reportAId}`)
      .set("Cookie", `session=${sessionCookie({ role: "health_inspector", officerId: hiBId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(404);
  });

  it("unauthenticated request is rejected → 401 or 403", async () => {
    const res = await request(app).get(`/api/health-inspector/report/${reportAId}`);
    expect([401, 403]).toContain(res.status);
  });

  it("wrong role (supervisor) is rejected → 403", async () => {
    const res = await request(app)
      .get(`/api/health-inspector/report/${reportAId}`)
      .set("Cookie", `session=${sessionCookie({ role: "supervisor", officerId: hiAId })}`);
    expect(res.status).toBe(403);
  });

  it("non-existent report ID returns 404 (not 500)", async () => {
    const res = await request(app)
      .get(`/api/health-inspector/report/999999999`)
      .set("Cookie", `session=${sessionCookie({ role: "health_inspector", officerId: hiAId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(404);
  });
});

// ── Environmental Engineer: report-by-ID scoping ─────────────────────────────

describe("GET /api/env-engineer/report/:id — cross-zone 404 enforcement", () => {
  it("EE_A can retrieve their own report (Ward 1, via HI chain) → 200", async () => {
    const res = await request(app)
      .get(`/api/env-engineer/report/${reportAId}`)
      .set("Cookie", `session=${sessionCookie({ role: "environmental_engineer", officerId: eeAId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", reportAId);
  });

  it("EE_A cannot retrieve a report in EE_B's zone (Ward 22) → 404", async () => {
    const res = await request(app)
      .get(`/api/env-engineer/report/${reportBId}`)
      .set("Cookie", `session=${sessionCookie({ role: "environmental_engineer", officerId: eeAId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(404);
  });

  it("EE_B can retrieve their own report (Ward 22, via HI chain) → 200", async () => {
    const res = await request(app)
      .get(`/api/env-engineer/report/${reportBId}`)
      .set("Cookie", `session=${sessionCookie({ role: "environmental_engineer", officerId: eeBId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", reportBId);
  });

  it("EE_B cannot retrieve a report in EE_A's zone (Ward 1) → 404", async () => {
    const res = await request(app)
      .get(`/api/env-engineer/report/${reportAId}`)
      .set("Cookie", `session=${sessionCookie({ role: "environmental_engineer", officerId: eeBId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(404);
  });

  it("unauthenticated request is rejected → 401 or 403", async () => {
    const res = await request(app).get(`/api/env-engineer/report/${reportAId}`);
    expect([401, 403]).toContain(res.status);
  });

  it("wrong role (health_inspector) is rejected → 403", async () => {
    const res = await request(app)
      .get(`/api/env-engineer/report/${reportAId}`)
      .set("Cookie", `session=${sessionCookie({ role: "health_inspector", officerId: eeAId })}`);
    expect(res.status).toBe(403);
  });

  it("non-existent report ID returns 404 (not 500)", async () => {
    const res = await request(app)
      .get(`/api/env-engineer/report/999999999`)
      .set("Cookie", `session=${sessionCookie({ role: "environmental_engineer", officerId: eeAId, panchayatName: "Udupi" })}`);
    expect(res.status).toBe(404);
  });

  it("EE with no HI chain returns 404 for any report ID", async () => {
    // An EE with no health inspectors under them resolves zero ward rings → 404.
    // We re-use eeAId and swap to an imaginary officerId that has no linked HIs.
    const orphanEeRes = await db.execute(sql`
      INSERT INTO environmental_engineers (name, phone, panchayat_name)
      VALUES (${"Orphan EE"}, ${"3" + String(Date.now()).slice(-9)}, ${"Udupi"})
      RETURNING id
    `);
    const orphanEeId = (orphanEeRes.rows[0] as any).id as number;
    try {
      const res = await request(app)
        .get(`/api/env-engineer/report/${reportAId}`)
        .set("Cookie", `session=${sessionCookie({ role: "environmental_engineer", officerId: orphanEeId, panchayatName: "Udupi" })}`);
      expect(res.status).toBe(404);
    } finally {
      await db.execute(sql`DELETE FROM environmental_engineers WHERE id = ${orphanEeId}`);
    }
  });
});
