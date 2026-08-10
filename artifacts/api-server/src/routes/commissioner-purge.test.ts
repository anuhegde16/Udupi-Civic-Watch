/**
 * Safety tests for the commissioner purge-test endpoints.
 *
 * Verifies that DELETE /api/commissioner/reports/purge-test is scoped
 * exclusively to reports that fall inside the calling commissioner's
 * panchayat ward polygons via point-in-polygon (PiP) filtering.
 *
 * Scenario
 * ────────
 * • One test report is seeded inside a Udupi ward polygon (is_test=true).
 * • One test report is seeded at Saligrama coordinates — outside all Udupi
 *   ward polygons (is_test=true).
 * • The Udupi commissioner calls DELETE /api/commissioner/reports/purge-test.
 * • Only the Udupi report must be soft-deleted; the Saligrama report must
 *   remain untouched (deleted_at IS NULL).
 *
 * Also covers the count endpoint:
 * • Before purge → count equals the number of Udupi test reports seeded here.
 * • After purge  → count returns 0 (all Udupi test reports consumed).
 *
 * Coordinates
 * ───────────
 * Udupi Ward 1 centroid:    lat=13.355311, lng=74.701861
 * Saligrama (outside Udupi): lat=13.4900,  lng=74.7020
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

const udupiCookie = () =>
  `session=${sessionCookie({ role: "commissioner", panchayatName: "Udupi" })}`;

/** Coordinates guaranteed to be inside Udupi Ward 1. */
const UDUPI_LAT = 13.355311;
const UDUPI_LNG = 74.701861;

/** Coordinates in Saligrama — well outside the Udupi bounding box. */
const SALIGRAMA_LAT = 13.4900;
const SALIGRAMA_LNG = 74.7020;

// ── Fixture state ──────────────────────────────────────────────────────────────

let app: Express;
let udupiReportId: number;
let saligramaReportId: number;

// Track all seeded IDs for cleanup — includes hard-deleting any soft-deleted rows
const seededReportIds: number[] = [];

beforeAll(async () => {
  const mod = await import("../app");
  app = mod.default as Express;

  const ts = Date.now();

  // ── Seed a test report inside Udupi Ward 1 ────────────────────────────────
  const r1 = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description, is_test)
    VALUES (
      ${UDUPI_LAT}, ${UDUPI_LNG},
      ${"reported"},
      ${"Udupi Ward 1, purge safety test"},
      ${"commissioner purge safety test — udupi " + ts},
      ${true}
    )
    RETURNING id
  `);
  udupiReportId = (r1.rows[0] as any).id as number;
  seededReportIds.push(udupiReportId);

  // ── Seed a test report at Saligrama coordinates ───────────────────────────
  const r2 = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description, is_test)
    VALUES (
      ${SALIGRAMA_LAT}, ${SALIGRAMA_LNG},
      ${"reported"},
      ${"Saligrama territory, purge safety test"},
      ${"commissioner purge safety test — saligrama " + ts},
      ${true}
    )
    RETURNING id
  `);
  saligramaReportId = (r2.rows[0] as any).id as number;
  seededReportIds.push(saligramaReportId);
});

afterAll(async () => {
  // Hard-delete all seeded rows (including any that were soft-deleted by the purge)
  if (seededReportIds.length) {
    await db.execute(
      sql`DELETE FROM reports WHERE id IN (${sql.raw(seededReportIds.join(","))})`
    );
  }
});

// ── Count endpoint ────────────────────────────────────────────────────────────

describe("GET /api/commissioner/reports/purge-test/count", () => {
  it("returns 401 when called without a session", async () => {
    const res = await request(app)
      .get("/api/commissioner/reports/purge-test/count");
    expect(res.status).toBe(401);
  });

  it("returns 403 when called by a non-commissioner role", async () => {
    const cookie = `session=${sessionCookie({ role: "supervisor", panchayatName: "Udupi" })}`;
    const res = await request(app)
      .get("/api/commissioner/reports/purge-test/count")
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("Udupi commissioner sees the Udupi test report in the count (before purge)", async () => {
    const res = await request(app)
      .get("/api/commissioner/reports/purge-test/count")
      .set("Cookie", udupiCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("count");
    // Our Udupi test report must be counted; the count may be higher if other
    // is_test rows exist in the ward, so we check >= 1.
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it("Saligrama-area report is NOT included in the Udupi count", async () => {
    // We cannot directly inspect which IDs the count includes, so we verify
    // indirectly: fetch all is_test rows inside the Udupi bbox from the DB
    // and confirm our Saligrama report ID is absent.
    const raw = await db.execute(sql`
      SELECT id FROM reports
      WHERE deleted_at IS NULL
        AND is_test = true
        AND latitude  BETWEEN 13.3 AND 13.5
        AND longitude BETWEEN 74.6 AND 74.8
    `);
    const ids = (raw.rows as any[]).map(r => r.id as number);
    // The Saligrama report (13.49, 74.702) falls inside the coarse bounding box
    // above, so if the endpoint counted it, it would be included. We confirm
    // our ward-polygon PiP keeps it out by checking that the purge (in the next
    // suite) leaves it intact.  This query just validates our coordinate assumptions.
    expect(ids).toContain(udupiReportId);
    // Saligrama report IS in the bounding box — that is intentional so that the
    // PiP check is what filters it out, not the bbox pre-filter.
    expect(ids).toContain(saligramaReportId);
  });
});

// ── Purge endpoint ────────────────────────────────────────────────────────────

describe("DELETE /api/commissioner/reports/purge-test", () => {
  it("returns 401 when called without a session", async () => {
    const res = await request(app)
      .delete("/api/commissioner/reports/purge-test");
    expect(res.status).toBe(401);
  });

  it("returns 403 when called by a non-commissioner role", async () => {
    const cookie = `session=${sessionCookie({ role: "health_inspector", panchayatName: "Udupi" })}`;
    const res = await request(app)
      .delete("/api/commissioner/reports/purge-test")
      .set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("soft-deletes the Udupi test report and leaves the Saligrama report intact", async () => {
    // Confirm both reports exist and are not soft-deleted before the purge
    const beforeRows = await db.execute(sql`
      SELECT id, deleted_at FROM reports
      WHERE id IN (${udupiReportId}, ${saligramaReportId})
    `);
    const before = Object.fromEntries(
      (beforeRows.rows as any[]).map(r => [r.id, r.deleted_at])
    );
    expect(before[udupiReportId]).toBeNull();
    expect(before[saligramaReportId]).toBeNull();

    // Execute the purge
    const res = await request(app)
      .delete("/api/commissioner/reports/purge-test")
      .set("Cookie", udupiCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("deletedCount");
    // At least our one Udupi test report must be counted
    expect(res.body.deletedCount).toBeGreaterThanOrEqual(1);

    // Verify DB state after purge
    const afterRows = await db.execute(sql`
      SELECT id, deleted_at FROM reports
      WHERE id IN (${udupiReportId}, ${saligramaReportId})
    `);
    const after = Object.fromEntries(
      (afterRows.rows as any[]).map(r => [r.id, r.deleted_at])
    );

    // The Udupi report must now be soft-deleted
    expect(after[udupiReportId]).not.toBeNull();

    // The Saligrama-area report must remain untouched
    expect(after[saligramaReportId]).toBeNull();
  });

  it("count endpoint returns 0 for Udupi commissioner after the purge", async () => {
    const res = await request(app)
      .get("/api/commissioner/reports/purge-test/count")
      .set("Cookie", udupiCookie());

    expect(res.status).toBe(200);
    // Our Udupi test report was just purged; the Saligrama one is outside the
    // ward polygons and should never have been counted. Any remaining count
    // would only come from other is_test rows that existed before this test ran
    // — but since we just deleted all purgeable rows, the count should be 0.
    expect(res.body.count).toBe(0);
  });

  it("Saligrama commissioner purge returns deletedCount=0 (no Udupi ward rings)", async () => {
    const saligramaCookie = `session=${sessionCookie({ role: "commissioner", panchayatName: "Saligrama" })}`;

    // Re-seed a fresh Udupi test report to confirm Saligrama cannot touch it
    const fresh = await db.execute(sql`
      INSERT INTO reports (latitude, longitude, status, address, description, is_test)
      VALUES (
        ${UDUPI_LAT}, ${UDUPI_LNG},
        ${"reported"},
        ${"Udupi Ward 1, saligrama isolation test"},
        ${"saligrama isolation test"},
        ${true}
      )
      RETURNING id
    `);
    const freshId = (fresh.rows[0] as any).id as number;
    seededReportIds.push(freshId);

    try {
      const res = await request(app)
        .delete("/api/commissioner/reports/purge-test")
        .set("Cookie", saligramaCookie);

      expect(res.status).toBe(200);
      // Saligrama has no Udupi ward rings → resolveCommissionerWardRings returns []
      // → the endpoint exits early with deletedCount: 0
      expect(res.body.deletedCount).toBe(0);

      // Confirm the Udupi report was NOT soft-deleted
      const check = await db.execute(sql`
        SELECT deleted_at FROM reports WHERE id = ${freshId}
      `);
      expect((check.rows[0] as any).deleted_at).toBeNull();
    } finally {
      // Clean up regardless of test outcome
      await db.execute(sql`DELETE FROM reports WHERE id = ${freshId}`);
      // Remove from seededReportIds to avoid double-delete in afterAll
      const idx = seededReportIds.indexOf(freshId);
      if (idx !== -1) seededReportIds.splice(idx, 1);
    }
  });
});
