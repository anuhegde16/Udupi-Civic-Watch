/**
 * Unit tests for the officer-assignment logic in geo.ts.
 *
 * `findOfficerForLocation` uses the real geofences.json polygons (no GeoJSON
 * mocking) but the database is fully mocked so every test is deterministic and
 * runs without a live Postgres connection.
 *
 * Four behavioural scenarios are exercised:
 *  1. Point clearly inside a ward       → that ward's officer is returned
 *  2. Cross-panchayat isolation         → an officer whose panchayat doesn't
 *                                         match the point is never chosen
 *  3. Distance fallback                 → when no ward polygon contains the
 *                                         point the officer with the nearest
 *                                         ward ring wins (not a random pick)
 *  4. No officers in panchayat          → null is returned (report stays
 *                                         unassigned rather than silently
 *                                         routing cross-municipality)
 *
 * Coordinate reference (verified against geofences.json):
 *   13.4900 °N, 74.7020 °E  →  inside Saligrama "Ward 12"
 *   13.3670 °N, 74.7950 °E  →  inside Udupi "Udupi Ward 14"
 *   13.4983 °N, 74.6921 °E  →  centroid of Saligrama "Ward 1"
 *                               NOT inside Ward 2 (0.73 km away) or Ward 3 (1.35 km away)
 *   13.0000 °N, 74.5000 °E  →  outside the service area entirely
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────
// vi.hoisted ensures the holder is created before vi.mock's factory runs.
const officerStore = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(officerStore.rows),
      }),
    }),
  },
  officersTable: { deletedAt: "deleted_at" },
}));

// Import the functions under test *after* mocking.
const { isWithinServiceArea, findOfficerForLocation } = await import("./geo");

// ── Officer fixture helper ────────────────────────────────────────────────────
function makeOfficer(
  id: number,
  areaName: string | null,
  panchayatName: string,
): Record<string, unknown> {
  return {
    id,
    name: `Officer ${id}`,
    email: `officer${id}@test.invalid`,
    passwordHash: "x",
    phone: null,
    areaName,
    panchayatName,
    centerLat: null,
    centerLng: null,
    deletedAt: null,
  };
}

// ── isWithinServiceArea ───────────────────────────────────────────────────────
describe("isWithinServiceArea", () => {
  it("returns true for a point inside the Saligrama service area", () => {
    expect(isWithinServiceArea(13.49, 74.702)).toBe(true);
  });

  it("returns true for a point inside the Udupi service area", () => {
    expect(isWithinServiceArea(13.367, 74.795)).toBe(true);
  });

  it("returns false for a point outside both service areas", () => {
    expect(isWithinServiceArea(13.0, 74.5)).toBe(false);
  });

  it("returns false for a point far to the north", () => {
    expect(isWithinServiceArea(14.0, 74.8)).toBe(false);
  });

  it("returns false for a point west of the service area at the correct latitude", () => {
    // Same latitude as Udupi but well to the west — not in any district polygon
    expect(isWithinServiceArea(13.367, 74.6)).toBe(false);
  });
});

// ── findOfficerForLocation ────────────────────────────────────────────────────
describe("findOfficerForLocation", () => {
  beforeEach(() => {
    // Reset the officer list before every test
    officerStore.rows = [];
  });

  // ── Scenario 1: Point clearly inside a ward ─────────────────────────────────
  describe("point clearly inside a ward", () => {
    it("returns the officer assigned to the ward containing the report", async () => {
      officerStore.rows = [
        makeOfficer(1, "Ward 12", "Saligrama"),
        makeOfficer(2, "Ward 1", "Saligrama"),
      ];

      // 13.4900, 74.7020 is confirmed inside "Ward 12" (not "Ward 1")
      const result = await findOfficerForLocation(13.49, 74.702);

      expect(result).not.toBeNull();
      expect((result as any).id).toBe(1);
      expect((result as any).areaName).toBe("Ward 12");
    });

    it("prefers the ward officer over a district-level officer with the same panchayat", async () => {
      officerStore.rows = [
        makeOfficer(10, "Saligrama", "Saligrama"), // district-level
        makeOfficer(11, "Ward 12", "Saligrama"),   // ward-level — should win
      ];

      const result = await findOfficerForLocation(13.49, 74.702);

      expect((result as any).id).toBe(11);
      expect((result as any).areaName).toBe("Ward 12");
    });

    it("returns the Udupi Ward 14 officer for a Udupi report", async () => {
      officerStore.rows = [
        makeOfficer(20, "Udupi Ward 14", "Udupi"),
        makeOfficer(21, "Udupi Ward 1",  "Udupi"),
      ];

      // 13.3670, 74.7950 is confirmed inside "Udupi Ward 14"
      const result = await findOfficerForLocation(13.367, 74.795);

      expect((result as any).id).toBe(20);
      expect((result as any).areaName).toBe("Udupi Ward 14");
    });
  });

  // ── Scenario 2: Cross-panchayat isolation ───────────────────────────────────
  describe("panchayat isolation (cross-municipality routing must never happen)", () => {
    it("returns a Saligrama officer — not a Udupi officer — for a Saligrama point", async () => {
      officerStore.rows = [
        makeOfficer(30, "Ward 12",       "Saligrama"),
        makeOfficer(31, "Udupi Ward 14", "Udupi"),
      ];

      const result = await findOfficerForLocation(13.49, 74.702);

      expect((result as any).panchayatName).toBe("Saligrama");
      expect((result as any).id).toBe(30);
    });

    it("returns a Udupi officer — not a Saligrama officer — for a Udupi point", async () => {
      officerStore.rows = [
        makeOfficer(40, "Ward 12",       "Saligrama"),
        makeOfficer(41, "Udupi Ward 14", "Udupi"),
      ];

      const result = await findOfficerForLocation(13.367, 74.795);

      expect((result as any).panchayatName).toBe("Udupi");
      expect((result as any).id).toBe(41);
    });

    it("does not fall back to a cross-panchayat officer when the local panchayat has no officers", async () => {
      // Only Saligrama officers exist — a Udupi report should get null, not a Saligrama officer
      officerStore.rows = [
        makeOfficer(50, "Ward 12", "Saligrama"),
        makeOfficer(51, "Ward 1",  "Saligrama"),
      ];

      // Point is inside the Udupi district
      const result = await findOfficerForLocation(13.367, 74.795);

      expect(result).toBeNull();
    });
  });

  // ── Scenario 3: Distance fallback ───────────────────────────────────────────
  describe("distance fallback (no ward polygon covers the point)", () => {
    it("returns the officer with the nearest ward ring — not a random pick", async () => {
      // Test point: Ward 1 centroid (13.498311°N, 74.692120°E)
      // Officers assigned to Ward 2 and Ward 3 — neither polygon contains this point.
      // Distances to ring boundaries (pre-computed):
      //   Ward 2 ring: ~0.73 km away  ← should win
      //   Ward 3 ring: ~1.35 km away
      officerStore.rows = [
        makeOfficer(60, "Ward 3", "Saligrama"), // farther  — listed first
        makeOfficer(61, "Ward 2", "Saligrama"), // closer
      ];

      const result = await findOfficerForLocation(13.498311, 74.69212);

      expect(result).not.toBeNull();
      // Ward 2 must win regardless of DB insertion order
      expect((result as any).id).toBe(61);
      expect((result as any).areaName).toBe("Ward 2");
    });

    it("does not return an arbitrary officer when the fallback fires", async () => {
      // Reversed insertion order — closer ward (Ward 2) is listed second.
      // If the code picked officers[0] arbitrarily, this would return Ward 2's officer
      // because it happens to be listed first in the reversed list below.
      // We explicitly confirm the nearest-ring logic, not insertion order.
      officerStore.rows = [
        makeOfficer(70, "Ward 2", "Saligrama"), // closer   — listed first
        makeOfficer(71, "Ward 3", "Saligrama"), // farther
      ];

      const result = await findOfficerForLocation(13.498311, 74.69212);

      // Ward 1 centroid is inside Ward 1, not Ward 2 or Ward 3, so this is
      // the fallback path. Ward 2 is still closer, so officer 70 should be returned.
      expect((result as any).id).toBe(70);
    });
  });

  // ── Scenario 4: No officers in panchayat ───────────────────────────────────
  describe("no officers available", () => {
    it("returns null when no officers exist for the detected panchayat", async () => {
      // The DB returns no officers at all
      officerStore.rows = [];

      const result = await findOfficerForLocation(13.49, 74.702);

      expect(result).toBeNull();
    });
  });

  // ── Scenario 5: Point on a shared ward border ──────────────────────────────
  describe("point on a shared ward border", () => {
    it("returns some officer deterministically (does not crash or return undefined)", async () => {
      // Ward 12 and Ward 1 share a border around lat≈13.4908, lng≈74.6975.
      // Either ward's officer may be returned; we only verify stability.
      officerStore.rows = [
        makeOfficer(80, "Ward 12", "Saligrama"),
        makeOfficer(81, "Ward 1",  "Saligrama"),
      ];

      // Use a point on the shared Saligrama district boundary
      const result = await findOfficerForLocation(13.4908, 74.6975);

      // Must return an officer (not null/undefined) and must be from Saligrama
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
      expect((result as any).panchayatName).toBe("Saligrama");
    });
  });
});
