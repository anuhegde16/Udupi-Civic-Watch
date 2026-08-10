/**
 * Panchayat data-scoping tests — confirms that a Saligrama panchayat admin
 * cannot see Udupi data and vice-versa across the three key endpoints:
 *   GET /api/panchayat/reports
 *   GET /api/panchayat/stats
 *   GET /api/panchayat/officers
 *
 * Approach
 * ────────
 * • A Saligrama officer is inserted in the `officers` table
 *   (panchayatName='Saligrama').
 * • A "Saligrama report" is inserted and assigned to that officer.
 * • A "Udupi report" is inserted at coordinates inside Udupi Ward 1
 *   with no assigned officer (Udupi uses geographic scoping, not officer IDs).
 * • Requests are made with forged-but-cryptographically-valid session cookies
 *   (same technique as hierarchy-auth.test.ts / hierarchy-zone-filter.test.ts).
 *
 * Udupi Ward 1 centroid (inside Udupi):   lat=13.355311, lng=74.701861
 * Saligrama Ward 12 centroid (Saligrama): lat=13.4900,   lng=74.7020
 *   (well outside the Udupi bounding box — confirmed by geo.ts udupiBox derivation)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { signSession } from "../lib/auth";
import type { SessionUser } from "../lib/auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Coordinates guaranteed to be inside Udupi Ward 1. */
const UDUPI_LAT = 13.355311;
const UDUPI_LNG = 74.701861;

/** Coordinates in Saligrama Ward 12 — well outside the Udupi bounding box. */
const SALIGRAMA_LAT = 13.4900;
const SALIGRAMA_LNG = 74.7020;

// ── Fixture state ──────────────────────────────────────────────────────────────

let app: Express;

let saligramaOfficerId: number;
let saligramaReportId: number;
let udupiReportId: number;

const createdReportIds: number[] = [];
const createdOfficerIds: number[] = [];

beforeAll(async () => {
  const mod = await import("../app");
  app = mod.default as Express;

  const ts = Date.now();

  // ── Insert a Saligrama officer ─────────────────────────────────────────────
  // passwordHash can be any bcrypt-shaped string for this test; the officer
  // never actually logs in — we only need the row so reports can be assigned.
  const officerResult = await db.execute(sql`
    INSERT INTO officers (name, email, password_hash, area_name, panchayat_name)
    VALUES (
      ${"Scoping Test Officer " + ts},
      ${"scoping-test-officer-" + ts + "@test.local"},
      ${"$2b$10$placeholder_hash_for_testing_only_not_a_real_hash_xxxxxx"},
      ${"Ward 12"},
      ${"Saligrama"}
    )
    RETURNING id
  `);
  saligramaOfficerId = (officerResult.rows[0] as any).id as number;
  createdOfficerIds.push(saligramaOfficerId);

  // ── Insert a report assigned to the Saligrama officer (Saligrama area) ────
  const r1 = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description, assigned_officer_id)
    VALUES (
      ${SALIGRAMA_LAT}, ${SALIGRAMA_LNG},
      ${"reported"},
      ${"Ward 12, Saligrama scoping test"},
      ${"panchayat scoping test — saligrama"},
      ${saligramaOfficerId}
    )
    RETURNING id
  `);
  saligramaReportId = (r1.rows[0] as any).id as number;
  createdReportIds.push(saligramaReportId);

  // ── Insert a report inside Udupi Ward 1 (no officer assigned) ─────────────
  const r2 = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description)
    VALUES (
      ${UDUPI_LAT}, ${UDUPI_LNG},
      ${"reported"},
      ${"Udupi Ward 1, scoping test"},
      ${"panchayat scoping test — udupi"}
    )
    RETURNING id
  `);
  udupiReportId = (r2.rows[0] as any).id as number;
  createdReportIds.push(udupiReportId);
});

afterAll(async () => {
  if (createdReportIds.length) {
    await db.execute(
      sql`DELETE FROM reports WHERE id IN (${sql.raw(createdReportIds.join(","))})`
    );
  }
  if (createdOfficerIds.length) {
    await db.execute(
      sql`DELETE FROM officers WHERE id IN (${sql.raw(createdOfficerIds.join(","))})`
    );
  }
});

// ── Suite 1: Saligrama admin cannot see Udupi data ───────────────────────────

describe("Saligrama panchayat admin — cannot see Udupi reports or officers", () => {
  const saligramaCookie = () =>
    `session=${sessionCookie({ role: "commissioner", panchayatName: "Saligrama" })}`;

  it("GET /api/panchayat/reports — Udupi report is absent, Saligrama report is present", async () => {
    const res = await request(app)
      .get("/api/panchayat/reports")
      .set("Cookie", saligramaCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("reports");

    const ids: number[] = res.body.reports.map((r: any) => r.id);

    // The Udupi report (geo-inside Udupi, no Saligrama officer) must NOT appear
    expect(ids).not.toContain(udupiReportId);

    // The Saligrama report (assigned to our Saligrama officer) MUST appear
    expect(ids).toContain(saligramaReportId);
  });

  it("GET /api/panchayat/reports — no report carries a ward name starting with 'Udupi Ward'", async () => {
    const res = await request(app)
      .get("/api/panchayat/reports")
      .set("Cookie", saligramaCookie());

    expect(res.status).toBe(200);

    for (const r of res.body.reports as any[]) {
      // geographicWardName is set for Udupi reports; assignedOfficer.areaName / wardName
      // and geographicWardName must not start with "Udupi Ward"
      if (r.geographicWardName) {
        expect(r.geographicWardName).not.toMatch(/^Udupi Ward/);
      }
      if (r.assignedOfficer?.areaName) {
        expect(r.assignedOfficer.areaName).not.toMatch(/^Udupi Ward/);
      }
      if (r.assignedOfficer?.wardName) {
        expect(r.assignedOfficer.wardName).not.toMatch(/^Udupi Ward/);
      }
    }
  });

  it("GET /api/panchayat/stats — no ward stat entry is named 'Udupi Ward *'", async () => {
    const res = await request(app)
      .get("/api/panchayat/stats")
      .set("Cookie", saligramaCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("wardStats");

    for (const ws of res.body.wardStats as any[]) {
      expect(ws.wardName ?? "").not.toMatch(/^Udupi Ward/);
    }
  });

  it("GET /api/panchayat/officers — no officer has panchayatName='Udupi'", async () => {
    const res = await request(app)
      .get("/api/panchayat/officers")
      .set("Cookie", saligramaCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("officers");

    for (const o of res.body.officers as any[]) {
      // Officers returned for Saligrama must never carry Udupi identity
      if (o.panchayatName !== undefined) {
        expect(o.panchayatName).not.toBe("Udupi");
      }
      if (o.areaName !== undefined) {
        expect((o.areaName ?? "")).not.toMatch(/^Udupi Ward/);
      }
    }

    // Our Saligrama officer must appear (confirms scoping is to Saligrama, not empty)
    const officerIds: number[] = res.body.officers.map((o: any) => o.id);
    expect(officerIds).toContain(saligramaOfficerId);
  });
});

// ── Suite 2: Udupi admin cannot see Saligrama reports or officers ─────────────

describe("Udupi panchayat admin — cannot see Saligrama reports or officers", () => {
  const udupiCookie = () =>
    `session=${sessionCookie({ role: "commissioner", panchayatName: "Udupi" })}`;

  it("GET /api/panchayat/reports — Saligrama report is absent, Udupi report is present", async () => {
    const res = await request(app)
      .get("/api/panchayat/reports")
      .set("Cookie", udupiCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("reports");

    const ids: number[] = res.body.reports.map((r: any) => r.id);

    // The Saligrama report (outside Udupi bounding box) must NOT appear
    expect(ids).not.toContain(saligramaReportId);

    // The Udupi report (inside Udupi Ward 1 polygon) MUST appear
    expect(ids).toContain(udupiReportId);
  });

  it("GET /api/panchayat/reports — no report has a Saligrama ward name (non-'Udupi Ward' ward)", async () => {
    const res = await request(app)
      .get("/api/panchayat/reports")
      .set("Cookie", udupiCookie());

    expect(res.status).toBe(200);

    // Udupi reports use geographicWardName = "Udupi Ward N".
    // No report should reference a plain "Ward N" (Saligrama naming) as the geographic ward.
    for (const r of res.body.reports as any[]) {
      if (r.geographicWardName) {
        // Must start with "Udupi Ward" — plain "Ward N" would be a Saligrama leak
        expect(r.geographicWardName).toMatch(/^Udupi Ward/);
      }
    }
  });

  it("GET /api/panchayat/stats — all wardStats entries are named 'Udupi Ward *' (no Saligrama ward names)", async () => {
    const res = await request(app)
      .get("/api/panchayat/stats")
      .set("Cookie", udupiCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("wardStats");

    for (const ws of res.body.wardStats as any[]) {
      // Every ward stat must be a Udupi ward — "Ward N" alone would indicate a Saligrama leak
      expect(ws.wardName ?? "").toMatch(/^Udupi Ward/);
    }
  });

  it("GET /api/panchayat/officers — no officer has panchayatName='Saligrama' and our Saligrama officer is absent", async () => {
    const res = await request(app)
      .get("/api/panchayat/officers")
      .set("Cookie", udupiCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("officers");

    // Our Saligrama officer must not appear in the Udupi officer list
    const officerIds: number[] = res.body.officers.map((o: any) => o.id);
    expect(officerIds).not.toContain(saligramaOfficerId);

    // Udupi endpoint expands supervisors — no entry should carry panchayatName='Saligrama'
    for (const o of res.body.officers as any[]) {
      if (o.panchayatName !== undefined) {
        expect(o.panchayatName).not.toBe("Saligrama");
      }
    }
  });
});
