/**
 * Authorization and geographic-scope tests for the Command Center's Udupi views:
 *   GET /api/control-center/udupi-operations
 *   GET /api/admin/reports?panchayat=Udupi[&wardName=...]
 *
 * Udupi Municipality assigns work by ward polygon rather than through the legacy
 * officers table, so these tests plant reports at known ward centroids and assert
 * that the geographic filter returns exactly the right set — and that reports
 * outside Udupi never leak into a Udupi-scoped drill-down.
 *
 * Ward centroids (from geofences.json):
 *   Udupi Ward 1  lat=13.355311, lng=74.701861
 *   Udupi Ward 22 lat=13.319784, lng=74.753386
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { signSession } from "../lib/auth";
import type { SessionUser } from "../lib/auth";

const WARD1_LAT = 13.355311;
const WARD1_LNG = 74.701861;

const WARD22_LAT = 13.319784;
const WARD22_LNG = 74.753386;

/** Well outside every Udupi ward polygon (far inland). */
const OUTSIDE_LAT = 13.9;
const OUTSIDE_LNG = 75.4;

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

let app: Express;

let ward1ReportId: number;
let ward22ReportId: number;
let outsideReportId: number;

const cleanReportIds: number[] = [];

beforeAll(async () => {
  const mod = await import("../app");
  app = mod.default as Express;

  const insert = async (lat: number, lng: number, label: string): Promise<number> => {
    const row = await db.execute(sql`
      INSERT INTO reports (latitude, longitude, status, address, description)
      VALUES (${lat}, ${lng}, ${"reported"}, ${label}, ${"cc-udupi-scope-test"})
      RETURNING id
    `);
    const id = (row.rows[0] as any).id as number;
    cleanReportIds.push(id);
    return id;
  };

  ward1ReportId = await insert(WARD1_LAT, WARD1_LNG, "CC Scope Ward 1");
  ward22ReportId = await insert(WARD22_LAT, WARD22_LNG, "CC Scope Ward 22");
  outsideReportId = await insert(OUTSIDE_LAT, OUTSIDE_LNG, "CC Scope Outside Udupi");
});

afterAll(async () => {
  if (cleanReportIds.length) {
    await db.execute(sql`DELETE FROM reports WHERE id IN (${sql.raw(cleanReportIds.join(","))})`);
  }
});

// ── Authorization ─────────────────────────────────────────────────────────────

describe("GET /api/control-center/udupi-operations — authorization", () => {
  it("rejects unauthenticated requests → 401", async () => {
    const res = await request(app).get("/api/control-center/udupi-operations");
    expect(res.status).toBe(401);
  });

  const DENIED_ROLES = [
    "supervisor",
    "health_inspector",
    "environmental_engineer",
    "community_mobiliser",
    "field_officer",
    "panchayat_admin",
  ] as const;

  for (const role of DENIED_ROLES) {
    it(`rejects role=${role} → 403`, async () => {
      const res = await request(app)
        .get("/api/control-center/udupi-operations")
        .set("Cookie", `session=${sessionCookie({ role })}`);
      expect(res.status).toBe(403);
    });
  }

  it("allows the control center → 200", async () => {
    const res = await request(app)
      .get("/api/control-center/udupi-operations")
      .set("Cookie", `session=${sessionCookie({ role: "control_center" })}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("panchayatName", "Udupi");
    expect(Array.isArray(res.body.reports)).toBe(true);
    expect(Array.isArray(res.body.healthInspectors)).toBe(true);
  });
});

// ── Response scope ────────────────────────────────────────────────────────────

describe("GET /api/control-center/udupi-operations — response scope", () => {
  it("includes reports inside Udupi wards and excludes reports outside them", async () => {
    const res = await request(app)
      .get("/api/control-center/udupi-operations")
      .set("Cookie", `session=${sessionCookie({ role: "control_center" })}`);
    expect(res.status).toBe(200);

    const ids = (res.body.reports as any[]).map((r) => r.id);
    expect(ids).toContain(ward1ReportId);
    expect(ids).toContain(ward22ReportId);
    expect(ids).not.toContain(outsideReportId);
  });

  it("labels every returned report with the ward polygon it falls inside", async () => {
    const res = await request(app)
      .get("/api/control-center/udupi-operations")
      .set("Cookie", `session=${sessionCookie({ role: "control_center" })}`);

    const ward1 = (res.body.reports as any[]).find((r) => r.id === ward1ReportId);
    const ward22 = (res.body.reports as any[]).find((r) => r.id === ward22ReportId);
    expect(ward1.wardName).toBe("Udupi Ward 1");
    expect(ward22.wardName).toBe("Udupi Ward 22");
  });
});

// ── Report drill-down filtering ───────────────────────────────────────────────

describe("GET /api/admin/reports — Udupi geographic drill-down", () => {
  const asControlCenter = () => `session=${sessionCookie({ role: "control_center" })}`;

  it("scopes ?panchayat=Udupi to reports inside Udupi ward polygons", async () => {
    const res = await request(app)
      .get("/api/admin/reports?panchayat=Udupi&limit=500")
      .set("Cookie", asControlCenter());
    expect(res.status).toBe(200);

    const ids = (res.body.reports as any[]).map((r) => r.id);
    expect(ids).toContain(ward1ReportId);
    expect(ids).toContain(ward22ReportId);
    expect(ids).not.toContain(outsideReportId);
  });

  it("scopes ?wardName to that single ward only", async () => {
    const res = await request(app)
      .get("/api/admin/reports?panchayat=Udupi&wardName=Udupi%20Ward%201&limit=500")
      .set("Cookie", asControlCenter());
    expect(res.status).toBe(200);

    const ids = (res.body.reports as any[]).map((r) => r.id);
    expect(ids).toContain(ward1ReportId);
    expect(ids).not.toContain(ward22ReportId);
    expect(ids).not.toContain(outsideReportId);
  });

  it("reports the geographic total rather than a district-wide count", async () => {
    const scoped = await request(app)
      .get("/api/admin/reports?panchayat=Udupi&wardName=Udupi%20Ward%201&limit=500")
      .set("Cookie", asControlCenter());
    const district = await request(app)
      .get("/api/admin/reports?limit=500")
      .set("Cookie", asControlCenter());

    expect(scoped.body.total).toBe(scoped.body.reports.length);
    expect(scoped.body.total).toBeLessThan(district.body.total);
  });

  it("returns an empty set for an unknown ward instead of falling back to all reports", async () => {
    const res = await request(app)
      .get("/api/admin/reports?panchayat=Udupi&wardName=Udupi%20Ward%20999&limit=500")
      .set("Cookie", asControlCenter());
    expect(res.status).toBe(200);
    expect(res.body.reports).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("still requires Control Center access", async () => {
    const res = await request(app).get("/api/admin/reports?panchayat=Udupi");
    expect(res.status).toBe(401);
  });
});
