/**
 * Panchayat admin creation / update validation tests.
 *
 * Confirms that the API enforces the panchayat-assignment invariant at the
 * server boundary — independent of any client-side form validation.
 *
 * Covers:
 *  POST /api/admin/panchayat-admins
 *    - 400 when panchayatName is absent
 *    - 400 when panchayatName is an empty string
 *    - 400 when panchayatName is whitespace-only
 *    - 201 when all required fields including panchayatName are present
 *
 *  PATCH /api/admin/panchayat-admins/:id (assigned account)
 *    - 400 when panchayatName is explicitly set to an empty string
 *    - 400 when panchayatName is explicitly set to whitespace-only
 *    - 200 when panchayatName is omitted (already-assigned account — field preserved)
 *    - 200 when panchayatName is updated to a new valid value
 *
 *  PATCH /api/admin/panchayat-admins/:id (legacy NULL-panchayat account)
 *    - 400 when panchayatName is omitted — the effective value stays NULL, which is rejected
 *    - 200 when panchayatName is supplied and valid — fixes the unassigned account
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

const ccCookie = () => `session=${sessionCookie({ role: "control_center" })}`;

const TS = Date.now();
const TEST_EMAIL = `pa-validation-test-${TS}@test.local`;
const NULL_PA_EMAIL = `pa-null-panchayat-${TS}@test.local`;

const VALID_PAYLOAD = {
  name: "Validation Test Admin",
  email: TEST_EMAIL,
  password: "testpass1",
  panchayatName: "Saligrama",
};

let app: Express;
/** ID of the panchayat admin created via POST (has panchayatName = 'Saligrama') */
let assignedUserId: number | null = null;
/** ID of the legacy user seeded directly with panchayat_name = NULL */
let unassignedUserId: number | null = null;

beforeAll(async () => {
  const mod = await import("../app");
  app = mod.default as Express;

  // Seed a legacy panchayat_admin with no panchayat assigned (NULL).
  // We bypass the API intentionally — this mimics a pre-existing record that
  // was created before the constraint was enforced.
  const result = await db.execute(sql`
    INSERT INTO users (name, email, password_hash, role, panchayat_name)
    VALUES (
      ${"Legacy Unassigned Admin"},
      ${NULL_PA_EMAIL},
      ${"$2b$10$placeholder_hash_for_testing_only_not_a_real_hash_xxxxxx"},
      ${"panchayat_admin"},
      ${null}
    )
    RETURNING id
  `);
  unassignedUserId = (result.rows[0] as any).id as number;
});

afterAll(async () => {
  if (assignedUserId !== null) {
    await db.execute(sql`DELETE FROM users WHERE id = ${assignedUserId}`);
  }
  if (unassignedUserId !== null) {
    await db.execute(sql`DELETE FROM users WHERE id = ${unassignedUserId}`);
  }
  // Safety net in case id capture failed
  await db.execute(sql`DELETE FROM users WHERE email IN (${TEST_EMAIL}, ${NULL_PA_EMAIL})`);
});

// ── POST /api/admin/panchayat-admins ─────────────────────────────────────────

describe("POST /api/admin/panchayat-admins — panchayatName validation", () => {
  it("returns 400 when panchayatName is absent", async () => {
    const { panchayatName: _omit, ...withoutPanchayat } = VALID_PAYLOAD;
    const res = await request(app)
      .post("/api/admin/panchayat-admins")
      .set("Cookie", ccCookie())
      .send(withoutPanchayat);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when panchayatName is an empty string", async () => {
    const res = await request(app)
      .post("/api/admin/panchayat-admins")
      .set("Cookie", ccCookie())
      .send({ ...VALID_PAYLOAD, panchayatName: "" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when panchayatName is whitespace-only", async () => {
    const res = await request(app)
      .post("/api/admin/panchayat-admins")
      .set("Cookie", ccCookie())
      .send({ ...VALID_PAYLOAD, panchayatName: "   " });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 201 with a valid panchayatName", async () => {
    const res = await request(app)
      .post("/api/admin/panchayat-admins")
      .set("Cookie", ccCookie())
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.panchayatName).toBe("Saligrama");
    assignedUserId = res.body.id as number;
  });
});

// ── PATCH — already-assigned account ─────────────────────────────────────────

describe("PATCH /api/admin/panchayat-admins/:id — assigned account", () => {
  it("returns 400 when panchayatName is explicitly set to an empty string", async () => {
    if (assignedUserId === null) return;
    const res = await request(app)
      .patch(`/api/admin/panchayat-admins/${assignedUserId}`)
      .set("Cookie", ccCookie())
      .send({ panchayatName: "" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when panchayatName is explicitly set to whitespace-only", async () => {
    if (assignedUserId === null) return;
    const res = await request(app)
      .patch(`/api/admin/panchayat-admins/${assignedUserId}`)
      .set("Cookie", ccCookie())
      .send({ panchayatName: "   " });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 when panchayatName is omitted (effective value is the existing assignment)", async () => {
    if (assignedUserId === null) return;
    const res = await request(app)
      .patch(`/api/admin/panchayat-admins/${assignedUserId}`)
      .set("Cookie", ccCookie())
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.panchayatName).toBe("Saligrama");
  });

  it("returns 200 and updates panchayatName when a valid value is provided", async () => {
    if (assignedUserId === null) return;
    const res = await request(app)
      .patch(`/api/admin/panchayat-admins/${assignedUserId}`)
      .set("Cookie", ccCookie())
      .send({ panchayatName: "Udupi" });

    expect(res.status).toBe(200);
    expect(res.body.panchayatName).toBe("Udupi");
  });
});

// ── PATCH — legacy account with panchayat_name = NULL ────────────────────────

describe("PATCH /api/admin/panchayat-admins/:id — legacy NULL-panchayat account", () => {
  it("returns 400 when panchayatName is omitted (effective value stays NULL)", async () => {
    if (unassignedUserId === null) return;
    // Only updating name — panchayatName is absent from body, but existing value is NULL.
    // Effective post-update value = NULL → must be rejected.
    const res = await request(app)
      .patch(`/api/admin/panchayat-admins/${unassignedUserId}`)
      .set("Cookie", ccCookie())
      .send({ name: "Still Unassigned" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 and assigns the panchayat when a valid panchayatName is supplied", async () => {
    if (unassignedUserId === null) return;
    const res = await request(app)
      .patch(`/api/admin/panchayat-admins/${unassignedUserId}`)
      .set("Cookie", ccCookie())
      .send({ panchayatName: "Saligrama" });

    expect(res.status).toBe(200);
    expect(res.body.panchayatName).toBe("Saligrama");
  });
});
