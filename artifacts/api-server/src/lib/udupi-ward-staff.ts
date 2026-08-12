/**
 * Udupi ward-staff resolution.
 *
 * Udupi calls its ward-level operational staff by two titles — "supervisor"
 * and "field officer" — and both perform the identical field workflow:
 * dispatch a team, mark the report In Progress, upload cleanup photos, mark
 * it Cleaned. What differs is only WHERE each title's ward assignment is
 * stored:
 *
 *   • supervisor    → `supervisors.ward_names`  ("Ward 5/Kalmady" strings)
 *   • field officer → `officers.area_name`      (canonical "Udupi Ward 5")
 *
 * `users.officer_id` is a per-role foreign key: it points at `supervisors.id`
 * for a supervisor and at `officers.id` for a field officer. Those two ID
 * sequences are unrelated, so the session's officer_id must ALWAYS be read
 * against the table that matches the session's role. Treating them as one
 * shared ID space would let a field officer resolve a coincidentally numbered
 * supervisor and read or update that supervisor's wards.
 *
 * Every caller therefore goes through `resolveUdupiWardStaff`, which resolves
 * the profile against the correct table and re-checks the panchayat on the
 * stored row rather than trusting the session claim.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { udupiWardRings } from "./geo";
import type { SessionUser } from "./auth";

export type UdupiWardStaffKind = "supervisor" | "field_officer";

export interface UdupiWardStaff {
  kind: UdupiWardStaffKind;
  /** Primary key within the profile table that matches `kind`. */
  id: number;
  name: string;
  phone: string | null;
  /** Ward strings exactly as stored for this title. */
  wardNames: string[];
  /** Ward polygons this staff member covers. */
  rings: { name: string; ring: [number, number][] }[];
  /** Only supervisors report to a health inspector. */
  healthInspectorId: number | null;
  healthInspectorName: string | null;
  healthInspectorPhone: string | null;
}

/**
 * Map stored ward strings onto Udupi ward polygons.
 *
 * Supervisors store "Ward 5/Kalmady" while field officers store the canonical
 * geofence key "Udupi Ward 5"; both are accepted here so the two titles end up
 * with exactly the same ring list for the same ward.
 */
export function wardNamesToRings(wardNames: string[]): { name: string; ring: [number, number][] }[] {
  const rings: { name: string; ring: [number, number][] }[] = [];
  const seen = new Set<string>();
  for (const raw of wardNames ?? []) {
    if (typeof raw !== "string") continue;
    const match = raw.match(/^Ward (\d+)/) ?? raw.match(/^Udupi Ward (\d+)$/);
    if (!match) continue;
    const geoName = `Udupi Ward ${match[1]}`;
    if (seen.has(geoName)) continue;
    const entry = udupiWardRings.find((w) => w.name === geoName);
    if (!entry) continue;
    seen.add(geoName);
    rings.push(entry);
  }
  return rings;
}

/**
 * Why a session could not be resolved to Udupi ward staff.
 *
 *  • `not_found`  — the role is right but no profile row backs the session
 *                   (unlinked or deleted account). Callers answer 404, since
 *                   the guard itself is not rejecting the caller's role.
 *  • `not_udupi`  — a profile exists but belongs to another municipality, so
 *                   these ward-scoped views genuinely do not apply. 403.
 *
 * Keeping these apart matters: collapsing both into 403 would make a plain
 * data gap look like an authorization denial.
 */
export type UdupiWardStaffFailure = "not_found" | "not_udupi";

export type UdupiWardStaffResult =
  | { ok: true; staff: UdupiWardStaff }
  | { ok: false; reason: UdupiWardStaffFailure };

/**
 * Resolve the ward-staff profile behind a session.
 *
 * Never falls back to an empty profile: an unresolved session is reported as a
 * failure so callers deny the request instead of rendering an unscoped or
 * mis-scoped dashboard.
 */
export async function resolveUdupiWardStaff(user: SessionUser): Promise<UdupiWardStaffResult> {
  if (user.officerId === null || user.officerId === undefined) {
    return { ok: false, reason: "not_found" };
  }
  const profileId = Number(user.officerId);
  if (!Number.isInteger(profileId) || profileId <= 0) {
    return { ok: false, reason: "not_found" };
  }

  if (user.role === "supervisor") {
    const result = await db.execute(sql`
      SELECT sv.id, sv.name, sv.phone, sv.panchayat_name AS "panchayatName", sv.ward_names AS "wardNames",
             hi.id AS "healthInspectorId", hi.name AS "healthInspectorName", hi.phone AS "healthInspectorPhone"
      FROM   supervisors sv
      LEFT JOIN health_inspectors hi ON hi.id = sv.health_inspector_id
      WHERE  sv.id = ${profileId}
      LIMIT  1
    `);
    const row = result.rows[0] as any;
    if (!row) return { ok: false, reason: "not_found" };
    if (row.panchayatName !== "Udupi") return { ok: false, reason: "not_udupi" };

    const wardNames: string[] = Array.isArray(row.wardNames)
      ? row.wardNames
      : JSON.parse(row.wardNames ?? "[]");
    return {
      ok: true,
      staff: {
        kind: "supervisor",
        id: Number(row.id),
        name: row.name,
        phone: row.phone ?? null,
        wardNames,
        rings: wardNamesToRings(wardNames),
        healthInspectorId: row.healthInspectorId != null ? Number(row.healthInspectorId) : null,
        healthInspectorName: row.healthInspectorName ?? null,
        healthInspectorPhone: row.healthInspectorPhone ?? null,
      },
    };
  }

  if (user.role === "field_officer" || user.role === "officer") {
    const result = await db.execute(sql`
      SELECT id, name, phone, area_name AS "areaName", panchayat_name AS "panchayatName"
      FROM   officers
      WHERE  id = ${profileId} AND deleted_at IS NULL
      LIMIT  1
    `);
    const row = result.rows[0] as any;
    if (!row) return { ok: false, reason: "not_found" };
    if (row.panchayatName !== "Udupi") return { ok: false, reason: "not_udupi" };

    const wardNames: string[] = row.areaName ? [row.areaName as string] : [];
    return {
      ok: true,
      staff: {
        kind: "field_officer",
        id: Number(row.id),
        name: row.name,
        phone: row.phone ?? null,
        wardNames,
        rings: wardNamesToRings(wardNames),
        healthInspectorId: null,
        healthInspectorName: null,
        healthInspectorPhone: null,
      },
    };
  }

  return { ok: false, reason: "not_udupi" };
}
