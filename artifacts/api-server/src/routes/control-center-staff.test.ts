/**
 * Tests for the unified Command Center staff roster.
 *
 * Covers:
 *  1. Authorization — only control_center may read or mutate the roster
 *  2. Unified visibility — legacy Saligrama officers AND Udupi hierarchy staff
 *     appear in one list, with role, panchayat and ward assignments
 *  3. Creation — a supervisor gets both a profile row and a linked login account
 *  4. Password changes target the exact login account (resolved by role +
 *     linked staff id), never a same-named or same-phone neighbour
 *  5. Removal deletes the profile and its login together, and refuses to
 *     orphan children in the Udupi chain
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { signSession, comparePassword } from "../lib/auth";
import type { SessionUser } from "../lib/auth";

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

const CC = () => `session=${sessionCookie({ role: "control_center" })}`;

let app: Express;

/** Everything this suite creates, torn down in afterAll. */
const createdSupervisorIds: number[] = [];
const createdOfficerIds: number[] = [];
const TEST_PHONES = ["9000000101", "9000000102", "9000000103"];
const TEST_EMAILS = ["cc-staff-test-officer@example.com"];

async function cleanup() {
  for (const id of createdSupervisorIds) {
    await db.execute(sql`DELETE FROM users WHERE officer_id = ${String(id)} AND role = 'supervisor'`);
    await db.execute(sql`DELETE FROM supervisors WHERE id = ${id}`);
  }
  for (const id of createdOfficerIds) {
    await db.execute(sql`DELETE FROM users WHERE officer_id = ${String(id)} AND role IN ('officer','field_officer')`);
    await db.execute(sql`DELETE FROM officers WHERE id = ${id}`);
  }
  for (const phone of TEST_PHONES) {
    await db.execute(sql`DELETE FROM users WHERE phone = ${phone}`);
  }
  for (const email of TEST_EMAILS) {
    await db.execute(sql`DELETE FROM users WHERE email = ${email}`);
    await db.execute(sql`DELETE FROM officers WHERE email = ${email}`);
  }
  createdSupervisorIds.length = 0;
  createdOfficerIds.length = 0;
}

beforeAll(async () => {
  const mod = await import("../app");
  app = mod.default as Express;
  await cleanup();
});

afterAll(cleanup);

// ── 1. Authorization ─────────────────────────────────────────────────────────

describe("staff roster authorization", () => {
  it("rejects an anonymous request", async () => {
    const res = await request(app).get("/api/control-center/staff");
    expect(res.status).toBe(401);
  });

  const FORBIDDEN_ROLES = [
    "panchayat_admin",
    "commissioner",
    "health_inspector",
    "supervisor",
    "field_officer",
    "community_mobiliser",
  ] as const;

  for (const role of FORBIDDEN_ROLES) {
    it(`GET returns 403 for role=${role}`, async () => {
      const res = await request(app)
        .get("/api/control-center/staff")
        .set("Cookie", `session=${sessionCookie({ role, panchayatName: "Udupi" })}`);
      expect(res.status).toBe(403);
    });

    it(`POST returns 403 for role=${role}`, async () => {
      const res = await request(app)
        .post("/api/control-center/staff")
        .set("Cookie", `session=${sessionCookie({ role, panchayatName: "Udupi" })}`)
        .send({ staffType: "supervisor", name: "Blocked", panchayatName: "Udupi", password: "secret123" });
      expect(res.status).toBe(403);
    });

    it(`DELETE returns 403 for role=${role}`, async () => {
      const res = await request(app)
        .delete("/api/control-center/staff/supervisor/1")
        .set("Cookie", `session=${sessionCookie({ role, panchayatName: "Udupi" })}`);
      expect(res.status).toBe(403);
    });
  }
});

// ── 2. Unified visibility ────────────────────────────────────────────────────

describe("roster shows both Saligrama officers and Udupi hierarchy staff", () => {
  it("returns staff from every source with role and panchayat", async () => {
    const res = await request(app).get("/api/control-center/staff").set("Cookie", CC());
    expect(res.status).toBe(200);

    const staff = res.body.staff as any[];
    expect(Array.isArray(staff)).toBe(true);

    const byType = (t: string) => staff.filter((s) => s.staffType === t);

    // Legacy Saligrama field officers still appear
    expect(byType("field_officer").length).toBeGreaterThan(0);
    expect(byType("field_officer").every((s) => s.panchayatName)).toBe(true);

    // Udupi hierarchy staff now appear alongside them — this is the bug fix
    expect(byType("supervisor").length).toBeGreaterThan(0);
    expect(byType("health_inspector").length).toBeGreaterThan(0);
    expect(byType("environmental_engineer").length).toBeGreaterThan(0);

    // Both municipalities are represented
    const panchayats = new Set(staff.map((s) => s.panchayatName));
    expect(panchayats.has("Saligrama")).toBe(true);
    expect(panchayats.has("Udupi")).toBe(true);
  });

  it("gives every staff member a unique roster key", async () => {
    const res = await request(app).get("/api/control-center/staff").set("Cookie", CC());
    const keys = (res.body.staff as any[]).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("reports supervisor ward coverage using canonical geofence ward names", async () => {
    const res = await request(app).get("/api/control-center/staff").set("Cookie", CC());
    const supervisors = (res.body.staff as any[]).filter((s) => s.staffType === "supervisor" && s.wardKeys.length);
    expect(supervisors.length).toBeGreaterThan(0);
    for (const sv of supervisors) {
      for (const key of sv.wardKeys) {
        expect(key).toMatch(/^Udupi Ward \d+$/);
      }
    }
  });

  it("rolls supervisor wards up into their health inspector", async () => {
    const res = await request(app).get("/api/control-center/staff").set("Cookie", CC());
    const staff = res.body.staff as any[];
    const hi = staff.find((s) => s.staffType === "health_inspector" && s.wardKeys.length > 0);
    expect(hi).toBeTruthy();

    const childWards = staff
      .filter((s) => s.staffType === "supervisor" && s.parentId === hi.id)
      .flatMap((s) => s.wardKeys as string[]);
    expect([...hi.wardKeys].sort()).toEqual([...childWards].sort());
  });

  it("exposes the panchayat → ward index used by the roster filters", async () => {
    const res = await request(app).get("/api/control-center/staff").set("Cookie", CC());
    const panchayats = res.body.panchayats as { name: string; wards: string[] }[];
    const udupi = panchayats.find((p) => p.name === "Udupi");
    const saligrama = panchayats.find((p) => p.name === "Saligrama");
    expect(udupi?.wards.length).toBe(35);
    expect(saligrama?.wards.length).toBeGreaterThan(0);
  });
});

// ── 3. Creation ──────────────────────────────────────────────────────────────

describe("creating a supervisor", () => {
  let supervisorId: number;

  it("creates the profile row and a linked login account", async () => {
    const hiRes = await db.execute(sql`SELECT id FROM health_inspectors WHERE panchayat_name = 'Udupi' ORDER BY id LIMIT 1`);
    const hiId = Number((hiRes.rows[0] as any).id);

    const res = await request(app)
      .post("/api/control-center/staff")
      .set("Cookie", CC())
      .send({
        staffType: "supervisor",
        name: "CC Test Supervisor",
        panchayatName: "Udupi",
        phone: TEST_PHONES[0],
        password: "initial123",
        healthInspectorId: hiId,
        wardNames: ["Ward 3/Malpe Central"],
      });

    expect(res.status).toBe(201);
    supervisorId = res.body.id;
    createdSupervisorIds.push(supervisorId);

    const login = await db.execute(sql`
      SELECT id, phone, role, officer_id FROM users
      WHERE officer_id = ${String(supervisorId)} AND role = 'supervisor'
    `);
    expect(login.rows.length).toBe(1);
    expect((login.rows[0] as any).phone).toBe(TEST_PHONES[0]);
  });

  it("shows the new supervisor in the roster with their ward and parent", async () => {
    const res = await request(app).get("/api/control-center/staff").set("Cookie", CC());
    const created = (res.body.staff as any[]).find((s) => s.key === `supervisor:${supervisorId}`);
    expect(created).toBeTruthy();
    expect(created.wardKeys).toEqual(["Udupi Ward 3"]);
    expect(created.parentName).toBeTruthy();
    expect(created.hasLogin).toBe(true);
  });

  it("rejects a duplicate phone number", async () => {
    const hiRes = await db.execute(sql`SELECT id FROM health_inspectors WHERE panchayat_name = 'Udupi' ORDER BY id LIMIT 1`);
    const res = await request(app)
      .post("/api/control-center/staff")
      .set("Cookie", CC())
      .send({
        staffType: "supervisor",
        name: "CC Test Duplicate",
        panchayatName: "Udupi",
        phone: TEST_PHONES[0],
        password: "initial123",
        healthInspectorId: Number((hiRes.rows[0] as any).id),
      });
    expect(res.status).toBe(409);
  });

  it("rejects a supervisor without a health inspector", async () => {
    const res = await request(app)
      .post("/api/control-center/staff")
      .set("Cookie", CC())
      .send({
        staffType: "supervisor",
        name: "CC Test Orphan",
        panchayatName: "Udupi",
        phone: TEST_PHONES[2],
        password: "initial123",
      });
    expect(res.status).toBe(400);
  });
});

describe("creating a field officer", () => {
  it("creates the officer row plus a matching login", async () => {
    const res = await request(app)
      .post("/api/control-center/staff")
      .set("Cookie", CC())
      .send({
        staffType: "field_officer",
        name: "CC Test Officer",
        panchayatName: "Saligrama",
        email: TEST_EMAILS[0],
        password: "initial123",
        wardNames: ["Ward 1"],
      });
    expect(res.status).toBe(201);
    const officerId = res.body.id as number;
    createdOfficerIds.push(officerId);

    const login = await db.execute(sql`
      SELECT id, email FROM users WHERE officer_id = ${String(officerId)} AND role IN ('officer','field_officer')
    `);
    expect(login.rows.length).toBe(1);
    expect((login.rows[0] as any).email).toBe(TEST_EMAILS[0]);

    // The zone centre is derived from the ward polygon, so the map can place them
    const officer = await db.execute(sql`SELECT center_lat, center_lng, area_name FROM officers WHERE id = ${officerId}`);
    expect((officer.rows[0] as any).area_name).toBe("Ward 1");
    expect((officer.rows[0] as any).center_lat).not.toBeNull();
  });

  it("rejects a ward from a different panchayat", async () => {
    const res = await request(app)
      .post("/api/control-center/staff")
      .set("Cookie", CC())
      .send({
        staffType: "field_officer",
        name: "CC Test Wrong Ward",
        panchayatName: "Saligrama",
        email: "cc-staff-wrong-ward@example.com",
        password: "initial123",
        wardNames: ["Udupi Ward 1"],
      });
    expect(res.status).toBe(400);
  });
});

// ── 3b. Panchayat / ward semantics are enforced server-side ──────────────────
//
// The roster UI only offers the roles and wards that suit the chosen
// municipality, but this is a management API: a request that pairs the wrong
// panchayat with the wrong ward or role must be refused here too, or it creates
// staff that no role-scoped view can see or clean up.

describe("staff type, panchayat and ward validation", () => {
  async function post(body: Record<string, unknown>) {
    return request(app).post("/api/control-center/staff").set("Cookie", CC()).send(body);
  }

  it("refuses a community mobiliser in a panchayat that has no Udupi hierarchy", async () => {
    const res = await post({
      staffType: "community_mobiliser",
      name: "CC Test Cross Panchayat CM",
      panchayatName: "Saligrama",
      phone: TEST_PHONES[2],
      password: "initial123",
      wardNames: ["Udupi Ward 1"],
    });
    expect(res.status).toBe(400);

    const leaked = await db.execute(sql`
      SELECT 1 FROM community_mobilisers WHERE phone = ${TEST_PHONES[2]}
    `);
    expect(leaked.rows.length).toBe(0);
  });

  it("refuses a community mobiliser assigned a ward outside their panchayat", async () => {
    const res = await post({
      staffType: "community_mobiliser",
      name: "CC Test Foreign Ward CM",
      panchayatName: "Udupi",
      phone: TEST_PHONES[2],
      password: "initial123",
      wardNames: ["Ward 1"], // a Saligrama ward
    });
    expect(res.status).toBe(400);
  });

  it("refuses a field officer in Udupi, which uses the hierarchy roles instead", async () => {
    const res = await post({
      staffType: "field_officer",
      name: "CC Test Udupi FO",
      panchayatName: "Udupi",
      email: "cc-staff-udupi-fo@example.com",
      password: "initial123",
      wardNames: ["Udupi Ward 1"],
    });
    expect(res.status).toBe(400);
  });

  it("refuses to assign wards directly to a health inspector", async () => {
    const res = await post({
      staffType: "health_inspector",
      name: "CC Test Warded HI",
      panchayatName: "Udupi",
      phone: TEST_PHONES[2],
      password: "initial123",
      wardNames: ["Udupi Ward 1"],
    });
    expect(res.status).toBe(400);
  });

  it("refuses to reassign a community mobiliser to a ward outside their panchayat", async () => {
    const cm = await db.execute(sql`SELECT id, ward_number FROM community_mobilisers LIMIT 1`);
    const cmId = Number((cm.rows[0] as any).id);
    const before = (cm.rows[0] as any).ward_number;

    const res = await request(app)
      .patch(`/api/control-center/staff/community_mobiliser/${cmId}`)
      .set("Cookie", CC())
      .send({ wardNames: ["Ward 2"] });
    expect(res.status).toBe(400);

    const after = await db.execute(sql`SELECT ward_number FROM community_mobilisers WHERE id = ${cmId}`);
    expect((after.rows[0] as any).ward_number).toBe(before);
  });
});

// ── 4. Password changes hit exactly the right account ────────────────────────

describe("password changes target the exact login account", () => {
  it("changes only the targeted supervisor's password, even with an identically named neighbour", async () => {
    const hiRes = await db.execute(sql`SELECT id FROM health_inspectors WHERE panchayat_name = 'Udupi' ORDER BY id LIMIT 1`);
    const hiId = Number((hiRes.rows[0] as any).id);

    // Two supervisors with the SAME name — resolution must not fall back to name matching.
    const mk = async (phone: string) => {
      const res = await request(app)
        .post("/api/control-center/staff")
        .set("Cookie", CC())
        .send({
          staffType: "supervisor",
          name: "CC Twin Supervisor",
          panchayatName: "Udupi",
          phone,
          password: "before123",
          healthInspectorId: hiId,
          wardNames: [],
        });
      expect(res.status).toBe(201);
      createdSupervisorIds.push(res.body.id);
      return res.body.id as number;
    };

    const targetId = await mk(TEST_PHONES[1]);
    const bystanderId = await mk(TEST_PHONES[2]);

    const patch = await request(app)
      .patch(`/api/control-center/staff/supervisor/${targetId}`)
      .set("Cookie", CC())
      .send({ password: "after4567" });
    expect(patch.status).toBe(200);

    const hashes = await db.execute(sql`
      SELECT officer_id, password_hash FROM users
      WHERE role = 'supervisor' AND officer_id IN (${String(targetId)}, ${String(bystanderId)})
    `);
    expect(hashes.rows.length).toBe(2);

    const target = (hashes.rows as any[]).find((r) => Number(r.officer_id) === targetId);
    const bystander = (hashes.rows as any[]).find((r) => Number(r.officer_id) === bystanderId);

    expect(await comparePassword("after4567", target.password_hash)).toBe(true);
    expect(await comparePassword("after4567", bystander.password_hash)).toBe(false);
    expect(await comparePassword("before123", bystander.password_hash)).toBe(true);
  });

  it("keeps the field officer's officers row and users row in sync", async () => {
    const officerId = createdOfficerIds[0];
    const res = await request(app)
      .patch(`/api/control-center/staff/field_officer/${officerId}`)
      .set("Cookie", CC())
      .send({ password: "rotated9999" });
    expect(res.status).toBe(200);

    const rows = await db.execute(sql`
      SELECT o.password_hash AS officer_hash, u.password_hash AS user_hash
      FROM officers o
      JOIN users u ON u.officer_id = o.id::text AND u.role IN ('officer','field_officer')
      WHERE o.id = ${officerId}
    `);
    expect(rows.rows.length).toBe(1);
    const row = rows.rows[0] as any;
    expect(await comparePassword("rotated9999", row.officer_hash)).toBe(true);
    expect(await comparePassword("rotated9999", row.user_hash)).toBe(true);
  });

  it("rejects a password shorter than 6 characters", async () => {
    const res = await request(app)
      .patch(`/api/control-center/staff/supervisor/${createdSupervisorIds[0]}`)
      .set("Cookie", CC())
      .send({ password: "abc" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a staff member that does not exist", async () => {
    const res = await request(app)
      .patch("/api/control-center/staff/supervisor/99999")
      .set("Cookie", CC())
      .send({ name: "Ghost Supervisor" });
    expect(res.status).toBe(404);
  });
});

// ── 5. Ward reassignment and removal ─────────────────────────────────────────

describe("ward reassignment", () => {
  it("updates the supervisor's ward coverage in the roster", async () => {
    const id = createdSupervisorIds[0];
    const res = await request(app)
      .patch(`/api/control-center/staff/supervisor/${id}`)
      .set("Cookie", CC())
      .send({ wardNames: ["Ward 7/Kodankuru", "Ward 9/Subhrahmanya Nagar"] });
    expect(res.status).toBe(200);

    const roster = await request(app).get("/api/control-center/staff").set("Cookie", CC());
    const sv = (roster.body.staff as any[]).find((s) => s.key === `supervisor:${id}`);
    expect([...sv.wardKeys].sort()).toEqual(["Udupi Ward 7", "Udupi Ward 9"]);
  });
});

describe("removal", () => {
  it("refuses to remove a health inspector who still has supervisors", async () => {
    const hi = await db.execute(sql`
      SELECT health_inspector_id AS id FROM supervisors WHERE health_inspector_id IS NOT NULL LIMIT 1
    `);
    const hiId = Number((hi.rows[0] as any).id);
    const res = await request(app)
      .delete(`/api/control-center/staff/health_inspector/${hiId}`)
      .set("Cookie", CC());
    expect(res.status).toBe(409);

    const still = await db.execute(sql`SELECT 1 FROM health_inspectors WHERE id = ${hiId}`);
    expect(still.rows.length).toBe(1);
  });

  it("removes a supervisor together with their login account", async () => {
    const id = createdSupervisorIds.pop()!;
    const res = await request(app).delete(`/api/control-center/staff/supervisor/${id}`).set("Cookie", CC());
    expect(res.status).toBe(200);

    const profile = await db.execute(sql`SELECT 1 FROM supervisors WHERE id = ${id}`);
    const login = await db.execute(sql`SELECT 1 FROM users WHERE officer_id = ${String(id)} AND role = 'supervisor'`);
    expect(profile.rows.length).toBe(0);
    expect(login.rows.length).toBe(0);
  });

  /**
   * Removal is destructive and unrecoverable. If a legacy officer's link to
   * their login row is missing or stale, an email-based fallback would happily
   * delete whichever unrelated account happens to share that address. The
   * removal must fail loudly and leave both rows untouched instead.
   */
  it("refuses to remove a field officer whose login link is broken, sparing a same-email stranger", async () => {
    const strangerEmail = "cc-staff-stranger@example.com";
    TEST_EMAILS.push(strangerEmail);

    const ins = await db.execute(sql`
      INSERT INTO officers (name, email, password_hash, area_name, panchayat_name)
      VALUES ('CC Test Orphan Officer', ${strangerEmail}, 'x', 'Ward 3', 'Saligrama')
      RETURNING id
    `);
    const officerId = Number((ins.rows[0] as any).id);
    createdOfficerIds.push(officerId);

    // An unrelated account that merely shares the officer's email address, and
    // is NOT linked to them by officer_id.
    const stranger = await db.execute(sql`
      INSERT INTO users (email, password_hash, name, role)
      VALUES (${strangerEmail}, 'x', 'Someone Else', 'field_officer')
      RETURNING id
    `);
    const strangerId = Number((stranger.rows[0] as any).id);

    const res = await request(app)
      .delete(`/api/control-center/staff/field_officer/${officerId}`)
      .set("Cookie", CC());
    expect(res.status).toBe(409);

    // The stranger still has their login...
    const survived = await db.execute(sql`SELECT 1 FROM users WHERE id = ${strangerId}`);
    expect(survived.rows.length).toBe(1);

    // ...and the officer was not half-deleted either.
    const officer = await db.execute(sql`
      SELECT email, deleted_at FROM officers WHERE id = ${officerId}
    `);
    expect((officer.rows[0] as any).deleted_at).toBeNull();
    expect((officer.rows[0] as any).email).toBe(strangerEmail);

    await db.execute(sql`DELETE FROM users WHERE id = ${strangerId}`);
  });

  it("removes a field officer and their correctly linked login", async () => {
    const email = "cc-staff-linked-removal@example.com";
    TEST_EMAILS.push(email);

    const created = await request(app)
      .post("/api/control-center/staff")
      .set("Cookie", CC())
      .send({
        staffType: "field_officer",
        name: "CC Test Linked Removal",
        panchayatName: "Saligrama",
        email,
        password: "initial123",
        wardNames: ["Ward 4"],
      });
    expect(created.status).toBe(201);
    const officerId = created.body.id as number;
    createdOfficerIds.push(officerId);

    const res = await request(app)
      .delete(`/api/control-center/staff/field_officer/${officerId}`)
      .set("Cookie", CC());
    expect(res.status).toBe(200);

    const login = await db.execute(sql`
      SELECT 1 FROM users WHERE officer_id = ${String(officerId)} AND role IN ('officer','field_officer')
    `);
    expect(login.rows.length).toBe(0);

    const officer = await db.execute(sql`SELECT deleted_at FROM officers WHERE id = ${officerId}`);
    expect((officer.rows[0] as any).deleted_at).not.toBeNull();
  });
});
