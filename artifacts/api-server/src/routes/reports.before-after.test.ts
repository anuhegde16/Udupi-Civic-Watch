/**
 * GET /api/reports/public/before-after — the home-page gallery feed.
 *
 * Only a cleaned, non-test, non-deleted report that has BOTH a "before" and an
 * "after" photo may appear; a panchayat hidden from the public must not appear.
 * Photos can be stored either in the newer array columns or the older single
 * columns — both must work.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Inside Udupi Ward 1 / inside Byndoor (same points the other geo tests use). */
const UDUPI = { lat: 13.355311, lng: 74.701861 };
const BYNDOOR = { lat: 13.8664, lng: 74.6322 };

const tag = `ba-test-${Date.now()}`;
const ids: Record<string, number> = {};
let app: Express;

async function insertReport(
  key: string,
  p: {
    at: { lat: number; lng: number };
    status?: string;
    isTest?: boolean;
    deleted?: boolean;
    before?: { arr?: string; single?: string };
    after?: { arr?: string; single?: string };
    createdDaysAgo?: number;
    cleanedDaysAgo?: number;
  },
) {
  const arr = (u?: string) => (u ? JSON.stringify([{ url: u, uploadedAt: new Date().toISOString() }]) : null);
  const r = await db.execute(sql`
    INSERT INTO reports (latitude, longitude, status, address, description, is_test, deleted_at,
                         image_url, image_urls, cleanup_image_url, cleanup_image_urls, created_at, cleaned_at)
    VALUES (
      ${p.at.lat}, ${p.at.lng}, ${p.status ?? "cleaned"}, ${`${key}, ${tag} road, Somewhere`}, ${tag},
      ${p.isTest ?? false}, ${p.deleted ? new Date() : null},
      ${p.before?.single ?? null}, ${arr(p.before?.arr)}::jsonb,
      ${p.after?.single ?? null}, ${arr(p.after?.arr)}::jsonb,
      NOW() - (${p.createdDaysAgo ?? 3} * INTERVAL '1 day'),
      ${p.status && p.status !== "cleaned" ? null : sql`NOW() - (${p.cleanedDaysAgo ?? 1} * INTERVAL '1 day')`}
    ) RETURNING id
  `);
  ids[key] = (r.rows[0] as any).id as number;
}

beforeAll(async () => {
  app = (await import("../app")).default as Express;
  await insertReport("good-arrays", { at: UDUPI, before: { arr: "/api/uploads/files/b1.jpg" }, after: { arr: "/api/uploads/files/a1.jpg" } });
  await insertReport("good-legacy", { at: UDUPI, before: { single: "/api/uploads/files/b2.jpg" }, after: { single: "/api/uploads/files/a2.jpg" }, createdDaysAgo: 0, cleanedDaysAgo: 0 });
  await insertReport("byndoor", { at: BYNDOOR, before: { arr: "/api/uploads/files/b3.jpg" }, after: { arr: "/api/uploads/files/a3.jpg" } });
  await insertReport("test-report", { at: UDUPI, isTest: true, before: { arr: "/api/uploads/files/b4.jpg" }, after: { arr: "/api/uploads/files/a4.jpg" } });
  await insertReport("no-after", { at: UDUPI, before: { arr: "/api/uploads/files/b5.jpg" } });
  await insertReport("not-cleaned", { at: UDUPI, status: "reported", before: { arr: "/api/uploads/files/b6.jpg" }, after: { arr: "/api/uploads/files/a6.jpg" } });
  await insertReport("deleted", { at: UDUPI, deleted: true, before: { arr: "/api/uploads/files/b7.jpg" }, after: { arr: "/api/uploads/files/a7.jpg" } });
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM reports WHERE description = ${tag}`);
  await db.execute(sql`DELETE FROM panchayat_settings WHERE panchayat_name = 'Byndoor'`);
});

const mine = (body: any[]) => body.filter((x) => Object.values(ids).includes(x.id));
const idsOf = (body: any[]) => mine(body).map((x) => x.id);

describe("GET /api/reports/public/before-after", () => {
  it("lists only cleaned, non-test, non-deleted reports that have both photos", async () => {
    const res = await request(app).get("/api/reports/public/before-after").expect(200);
    const got = idsOf(res.body);
    expect(got).toContain(ids["good-arrays"]);
    expect(got).toContain(ids["good-legacy"]);
    expect(got).toContain(ids["byndoor"]);
    for (const bad of ["test-report", "no-after", "not-cleaned", "deleted"]) {
      expect(got).not.toContain(ids[bad]);
    }
    expect(res.body.length).toBeLessThanOrEqual(6);
  });

  it("returns the photos, place, panchayat and days-to-clean the page needs", async () => {
    const res = await request(app).get("/api/reports/public/before-after").expect(200);
    const arrays = res.body.find((x: any) => x.id === ids["good-arrays"]);
    expect(arrays).toMatchObject({
      panchayat: "Udupi",
      beforeUrl: "/api/uploads/files/b1.jpg",
      afterUrl: "/api/uploads/files/a1.jpg",
      daysToClean: 2,
    });
    expect(arrays.address).toContain("good-arrays");
    const legacy = res.body.find((x: any) => x.id === ids["good-legacy"]);
    expect(legacy).toMatchObject({ beforeUrl: "/api/uploads/files/b2.jpg", afterUrl: "/api/uploads/files/a2.jpg", daysToClean: 0 });
    // No citizen details are ever included.
    expect(JSON.stringify(res.body)).not.toMatch(/reporter|email|ip/i);
  });

  it("shows the most recently cleaned first", async () => {
    const res = await request(app).get("/api/reports/public/before-after").expect(200);
    const order = mine(res.body).map((x) => new Date(x.cleanedAt).getTime());
    expect([...order].sort((a, b) => b - a)).toEqual(order);
  });

  it("hides a panchayat that a master admin has switched off for the public", async () => {
    await db.execute(sql`
      INSERT INTO panchayat_settings (panchayat_name, is_visible) VALUES ('Byndoor', false)
      ON CONFLICT (panchayat_name) DO UPDATE SET is_visible = false
    `);
    const res = await request(app).get("/api/reports/public/before-after").expect(200);
    const got = idsOf(res.body);
    expect(got).not.toContain(ids["byndoor"]);
    expect(got).toContain(ids["good-arrays"]);
  });
});
