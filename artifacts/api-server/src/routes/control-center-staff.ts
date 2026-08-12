/**
 * Unified Command Center staff roster and management.
 *
 * The project stores staff in two very different shapes:
 *   • Legacy field officers  → `officers` table, one geofence ward each,
 *     reports assigned explicitly via reports.assigned_officer_id.
 *   • Udupi hierarchy staff  → `environmental_engineers` / `health_inspectors`
 *     / `supervisors` / `community_mobilisers`, work assigned geographically
 *     by ward polygon (point-in-polygon), never through assigned_officer_id.
 *
 * This router projects both into ONE roster shape for the Command Center, and
 * provides create / edit / password-change / remove for every staff type.
 *
 * Login-account safety: a staff member's `users` row is always resolved by
 * (role, officer_id) — never by name, and never by email alone — so an edit can
 * not silently land on a different person's account.  Every write asserts that
 * exactly one users row was touched.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireControlCenter, hashPassword } from "../lib/auth";
import { logger } from "../lib/logger";
import { udupiWardRings, udupiBox, pointInPolygon as pip } from "../lib/geo";
import geofencesData from "../data/geofences.json";

const router: IRouter = Router();

// ── Staff type model ─────────────────────────────────────────────────────────

export const STAFF_TYPES = [
  "field_officer",
  "supervisor",
  "health_inspector",
  "environmental_engineer",
  "community_mobiliser",
] as const;

export type StaffType = (typeof STAFF_TYPES)[number];

/** Profile table + the users.role value that links to it. */
const HIERARCHY_TABLES: Record<
  Exclude<StaffType, "field_officer">,
  { table: string; role: string; label: string }
> = {
  supervisor: { table: "supervisors", role: "supervisor", label: "Supervisor" },
  health_inspector: { table: "health_inspectors", role: "health_inspector", label: "Health inspector" },
  environmental_engineer: {
    table: "environmental_engineers",
    role: "environmental_engineer",
    label: "Environmental engineer",
  },
  community_mobiliser: {
    table: "community_mobilisers",
    role: "community_mobiliser",
    label: "Community mobiliser",
  },
};

// Field-officer login accounts use either of the two legacy role spellings.
const FIELD_OFFICER_ROLES = sql`('officer', 'field_officer')`;

// ── Ward helpers ─────────────────────────────────────────────────────────────

type WardFeature = { name: string; panchayat: string };

const wardFeatures: WardFeature[] = (geofencesData.features as any[])
  .filter((f) => f.geometry?.type === "Polygon" && f.properties?.type === "ward")
  .map((f) => ({
    name: f.properties.name as string,
    panchayat: (f.properties.panchayat as string) ?? "",
  }));

const panchayatNames: string[] = Array.from(
  new Set(
    (geofencesData.features as any[])
      .filter((f) => f.properties?.type === "district")
      .map((f) => f.properties.panchayat ?? f.properties.name)
      .filter(Boolean),
  ),
);

function wardsOfPanchayat(panchayat: string): string[] {
  return wardFeatures.filter((w) => w.panchayat === panchayat).map((w) => w.name);
}

/**
 * Supervisors store wards as "Ward 5/Kalmady"; community mobilisers store a
 * bare ward number.  Both refer to Udupi ward polygons, whose canonical
 * geofence key is "Udupi Ward 5".  Everything in the roster is keyed by that
 * canonical name so panchayat/ward filtering works across staff types.
 */
function supervisorWardToKey(raw: string): string | null {
  const m = String(raw).match(/^Ward (\d+)/);
  return m ? `Udupi Ward ${m[1]}` : null;
}

function wardKeyToNumber(key: string): number | null {
  const m = key.match(/^Udupi Ward (\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Staff-type / panchayat / ward validation ─────────────────────────────────

/**
 * Which staff types belong to which municipality. The Udupi hierarchy roles
 * (health inspector, engineer, …) only exist for Udupi, and the Saligrama-style
 * panchayats only use field officers.
 *
 * Udupi accepts BOTH "supervisor" and "field officer" because the municipality
 * uses the two titles interchangeably for the same ward-level job. A Udupi
 * field officer is ward-scoped like a supervisor rather than assignment-scoped
 * like a Saligrama field officer.
 *
 * This must be enforced here and not only in the roster UI: this is a
 * management API, so hiding a role in a dropdown does not stop a request that
 * pairs a Saligrama panchayat with an Udupi ward, which would create staff that
 * no role-scoped view can see or clean up.
 */
function staffTypeAllowedForPanchayat(staffType: StaffType, panchayat: string): boolean {
  return panchayat === "Udupi" ? true : staffType === "field_officer";
}

const wardNamesByPanchayat = new Map<string, Set<string>>();
for (const w of wardFeatures) {
  if (!wardNamesByPanchayat.has(w.panchayat)) wardNamesByPanchayat.set(w.panchayat, new Set());
  wardNamesByPanchayat.get(w.panchayat)!.add(w.name);
}

/**
 * Validate a ward assignment for a staff type + panchayat, returning an error
 * message or null. Supervisors submit "Ward N/Town" strings; everyone else
 * submits canonical geofence keys. Both must resolve to a real ward polygon
 * that actually belongs to the staff member's panchayat.
 */
function validateWardAssignment(
  staffType: StaffType,
  panchayat: string,
  wardNames: string[],
): string | null {
  if (hasDerivedWardCoverage(staffType)) {
    return wardNames.length
      ? `A ${HIERARCHY_TABLES[staffType as Exclude<StaffType, "field_officer">].label.toLowerCase()} covers the wards of the staff beneath them and cannot be assigned wards directly`
      : null;
  }

  if (staffType !== "supervisor" && wardNames.length > 1) {
    return "This staff type can only be assigned a single ward";
  }

  const valid = wardNamesByPanchayat.get(panchayat) ?? new Set<string>();
  for (const raw of wardNames) {
    const canonical = staffType === "supervisor" ? supervisorWardToKey(raw) : raw;
    if (!canonical || !valid.has(canonical)) {
      return `${raw} is not a ward of ${panchayat}`;
    }
  }
  return null;
}

function hasDerivedWardCoverage(staffType: StaffType): boolean {
  return staffType === "environmental_engineer" || staffType === "health_inspector";
}

// ── Geographic report counts per Udupi ward ──────────────────────────────────

type WardCounts = { reportCount: number; pendingCount: number };

async function udupiCountsByWard(): Promise<Map<string, WardCounts>> {
  const counts = new Map<string, WardCounts>();
  for (const { name } of udupiWardRings) counts.set(name, { reportCount: 0, pendingCount: 0 });

  const rows = await db.execute(sql`
    SELECT latitude, longitude, status FROM reports
    WHERE deleted_at IS NULL
      AND latitude  BETWEEN ${udupiBox.minLat} AND ${udupiBox.maxLat}
      AND longitude BETWEEN ${udupiBox.minLng} AND ${udupiBox.maxLng}
  `);

  for (const r of rows.rows as any[]) {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    const ward = udupiWardRings.find(({ ring }) => pip(lat, lng, ring));
    if (!ward) continue;
    const c = counts.get(ward.name)!;
    c.reportCount++;
    if (r.status !== "cleaned") c.pendingCount++;
  }
  return counts;
}

function sumWards(wardKeys: string[], byWard: Map<string, WardCounts>): WardCounts {
  return wardKeys.reduce<WardCounts>(
    (acc, key) => {
      const c = byWard.get(key);
      if (c) {
        acc.reportCount += c.reportCount;
        acc.pendingCount += c.pendingCount;
      }
      return acc;
    },
    { reportCount: 0, pendingCount: 0 },
  );
}

// ── Roster shape ─────────────────────────────────────────────────────────────

export interface StaffMember {
  /** Stable roster key — staff ids are only unique within their own table. */
  key: string;
  staffType: StaffType;
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  panchayatName: string | null;
  /** Canonical geofence ward names this person covers. */
  wardKeys: string[];
  /** Raw stored ward strings (supervisors keep "Ward N/Town"). */
  wardNames: string[];
  centerLat: number | null;
  centerLng: number | null;
  reportCount: number | null;
  pendingCount: number | null;
  /** Parent in the Udupi chain, when the staff type has one. */
  parentId: number | null;
  parentName: string | null;
  /** True when a matching login account exists. */
  hasLogin: boolean;
  createdAt: string | null;
}

// ── GET /api/control-center/staff ────────────────────────────────────────────

router.get("/control-center/staff", requireControlCenter, async (_req, res): Promise<void> => {
  try {
    const [officerRows, eeRows, hiRows, svRows, cmRows, loginRows, byWard] = await Promise.all([
      db.execute(sql`
        SELECT
          o.id, o.name, o.email, o.phone,
          o.area_name       AS "areaName",
          o.panchayat_name  AS "panchayatName",
          o.center_lat      AS "centerLat",
          o.center_lng      AS "centerLng",
          o.created_at      AS "createdAt",
          COUNT(r.id)::int  AS "reportCount",
          COUNT(r.id) FILTER (WHERE r.status != 'cleaned')::int AS "pendingCount"
        FROM officers o
        LEFT JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
        WHERE o.deleted_at IS NULL
        GROUP BY o.id
        ORDER BY o.panchayat_name, o.created_at
      `),
      db.execute(sql`SELECT id, name, phone, panchayat_name AS "panchayatName", created_at AS "createdAt" FROM environmental_engineers ORDER BY name`),
      db.execute(sql`
        SELECT id, name, phone, panchayat_name AS "panchayatName",
               environmental_engineer_id AS "parentId", created_at AS "createdAt"
        FROM health_inspectors ORDER BY name
      `),
      db.execute(sql`
        SELECT id, name, phone, panchayat_name AS "panchayatName",
               health_inspector_id AS "parentId", ward_names AS "wardNames", created_at AS "createdAt"
        FROM supervisors ORDER BY name
      `),
      db.execute(sql`
        SELECT id, name, phone, panchayat_name AS "panchayatName",
               ward_name AS "wardName", ward_number AS "wardNumber", created_at AS "createdAt"
        FROM community_mobilisers ORDER BY name
      `),
      db.execute(sql`SELECT role, officer_id AS "officerId" FROM users WHERE officer_id IS NOT NULL`),
      udupiCountsByWard(),
    ]);

    const loginKeys = new Set(
      (loginRows.rows as any[]).map((u) => {
        const role = u.role === "officer" ? "field_officer" : u.role;
        return `${role}:${u.officerId}`;
      }),
    );
    const hasLogin = (staffType: StaffType, id: number) => loginKeys.has(`${staffType}:${id}`);

    const staff: StaffMember[] = [];

    for (const o of officerRows.rows as any[]) {
      const wardKeys = o.areaName ? [o.areaName as string] : [];
      staff.push({
        key: `field_officer:${o.id}`,
        staffType: "field_officer",
        id: Number(o.id),
        name: o.name,
        email: o.email ?? null,
        phone: o.phone ?? null,
        panchayatName: o.panchayatName ?? null,
        wardKeys,
        wardNames: wardKeys,
        centerLat: o.centerLat != null ? Number(o.centerLat) : null,
        centerLng: o.centerLng != null ? Number(o.centerLng) : null,
        reportCount: Number(o.reportCount ?? 0),
        pendingCount: Number(o.pendingCount ?? 0),
        parentId: null,
        parentName: null,
        hasLogin: hasLogin("field_officer", Number(o.id)),
        createdAt: o.createdAt ?? null,
      });
    }

    const hiById = new Map<number, any>((hiRows.rows as any[]).map((r) => [Number(r.id), r]));
    const eeById = new Map<number, any>((eeRows.rows as any[]).map((r) => [Number(r.id), r]));

    // Supervisors first — their ward coverage rolls up into HI and EE totals.
    const wardsBySupervisor = new Map<number, string[]>();
    for (const sv of svRows.rows as any[]) {
      const raw: string[] = Array.isArray(sv.wardNames)
        ? sv.wardNames
        : JSON.parse(sv.wardNames ?? "[]");
      const wardKeys = raw.map(supervisorWardToKey).filter((w): w is string => Boolean(w));
      wardsBySupervisor.set(Number(sv.id), wardKeys);
      const parent = sv.parentId != null ? hiById.get(Number(sv.parentId)) : null;
      staff.push({
        key: `supervisor:${sv.id}`,
        staffType: "supervisor",
        id: Number(sv.id),
        name: sv.name,
        email: null,
        phone: sv.phone ?? null,
        panchayatName: sv.panchayatName ?? null,
        wardKeys,
        wardNames: raw,
        centerLat: null,
        centerLng: null,
        ...sumWards(wardKeys, byWard),
        parentId: sv.parentId != null ? Number(sv.parentId) : null,
        parentName: parent?.name ?? null,
        hasLogin: hasLogin("supervisor", Number(sv.id)),
        createdAt: sv.createdAt ?? null,
      });
    }

    const wardsByHi = new Map<number, string[]>();
    for (const sv of svRows.rows as any[]) {
      if (sv.parentId == null) continue;
      const hiId = Number(sv.parentId);
      const list = wardsByHi.get(hiId) ?? [];
      list.push(...(wardsBySupervisor.get(Number(sv.id)) ?? []));
      wardsByHi.set(hiId, list);
    }

    const wardsByEe = new Map<number, string[]>();
    for (const hi of hiRows.rows as any[]) {
      const hiWards = wardsByHi.get(Number(hi.id)) ?? [];
      const parent = hi.parentId != null ? eeById.get(Number(hi.parentId)) : null;
      if (hi.parentId != null) {
        const eeId = Number(hi.parentId);
        wardsByEe.set(eeId, [...(wardsByEe.get(eeId) ?? []), ...hiWards]);
      }
      staff.push({
        key: `health_inspector:${hi.id}`,
        staffType: "health_inspector",
        id: Number(hi.id),
        name: hi.name,
        email: null,
        phone: hi.phone ?? null,
        panchayatName: hi.panchayatName ?? null,
        wardKeys: hiWards,
        wardNames: hiWards,
        centerLat: null,
        centerLng: null,
        ...sumWards(hiWards, byWard),
        parentId: hi.parentId != null ? Number(hi.parentId) : null,
        parentName: parent?.name ?? null,
        hasLogin: hasLogin("health_inspector", Number(hi.id)),
        createdAt: hi.createdAt ?? null,
      });
    }

    for (const ee of eeRows.rows as any[]) {
      const eeWards = wardsByEe.get(Number(ee.id)) ?? [];
      staff.push({
        key: `environmental_engineer:${ee.id}`,
        staffType: "environmental_engineer",
        id: Number(ee.id),
        name: ee.name,
        email: null,
        phone: ee.phone ?? null,
        panchayatName: ee.panchayatName ?? null,
        wardKeys: eeWards,
        wardNames: eeWards,
        centerLat: null,
        centerLng: null,
        ...sumWards(eeWards, byWard),
        parentId: null,
        parentName: null,
        hasLogin: hasLogin("environmental_engineer", Number(ee.id)),
        createdAt: ee.createdAt ?? null,
      });
    }

    for (const cm of cmRows.rows as any[]) {
      const key = cm.wardNumber != null ? `Udupi Ward ${Number(cm.wardNumber)}` : null;
      const wardKeys = key ? [key] : [];
      staff.push({
        key: `community_mobiliser:${cm.id}`,
        staffType: "community_mobiliser",
        id: Number(cm.id),
        name: cm.name,
        email: null,
        phone: cm.phone ?? null,
        panchayatName: cm.panchayatName ?? null,
        wardKeys,
        wardNames: wardKeys,
        centerLat: null,
        centerLng: null,
        ...sumWards(wardKeys, byWard),
        parentId: null,
        parentName: null,
        hasLogin: hasLogin("community_mobiliser", Number(cm.id)),
        createdAt: cm.createdAt ?? null,
      });
    }

    res.json({
      staff,
      total: staff.length,
      panchayats: panchayatNames.map((name) => ({ name, wards: wardsOfPanchayat(name) })),
    });
  } catch (err) {
    logger.error({ err }, "Error building Command Center staff roster");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Create ───────────────────────────────────────────────────────────────────

const CreateStaffBody = z.object({
  staffType: z.enum(STAFF_TYPES),
  name: z.string().trim().min(2),
  panchayatName: z.string().trim().min(1),
  password: z.string().min(6),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  /** Field officer: one geofence ward. Supervisor: many "Ward N/Town" strings. */
  wardNames: z.array(z.string().trim().min(1)).optional(),
  healthInspectorId: z.number().int().positive().optional(),
  environmentalEngineerId: z.number().int().positive().optional(),
});

function normalizePhone(raw: string): string {
  return raw.replace(/^\+91/, "").replace(/\D/g, "").slice(-10);
}

function computeZoneCenter(wardName: string): { lat: number; lng: number } | null {
  const feature = (geofencesData.features as any[]).find(
    (f) => f.geometry?.type === "Polygon" && f.properties?.name === wardName,
  );
  if (!feature) return null;
  const coords = feature.geometry.coordinates[0] as [number, number][];
  const lat = coords.reduce((s, [, la]) => s + la, 0) / coords.length;
  const lng = coords.reduce((s, [lo]) => s + lo, 0) / coords.length;
  return { lat, lng };
}

router.post("/control-center/staff", requireControlCenter, async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }
  const body = parsed.data;

  if (!panchayatNames.includes(body.panchayatName)) {
    res.status(400).json({ error: `Unknown panchayat: ${body.panchayatName}` });
    return;
  }

  if (!staffTypeAllowedForPanchayat(body.staffType, body.panchayatName)) {
    res.status(400).json({
      error: `${body.staffType.replace(/_/g, " ")} is not a staff type used by ${body.panchayatName}`,
    });
    return;
  }

  const wardError = validateWardAssignment(body.staffType, body.panchayatName, body.wardNames ?? []);
  if (wardError) {
    res.status(400).json({ error: wardError });
    return;
  }

  try {
    if (body.staffType === "field_officer") {
      if (!body.email) {
        res.status(400).json({ error: "Email is required for a field officer" });
        return;
      }
      const areaName = body.wardNames?.[0] ?? null;

      // Udupi field officers are scoped to reports geographically rather than
      // by assignment, so an officer without a ward would log in to a
      // permanently empty dashboard. Refuse instead of creating that account.
      if (body.panchayatName === "Udupi" && !areaName) {
        res.status(400).json({ error: "A Udupi field officer must be assigned a ward" });
        return;
      }

      const clash = await db.execute(sql`
        SELECT 1 FROM officers WHERE email = ${body.email} AND deleted_at IS NULL
        UNION ALL
        SELECT 1 FROM users WHERE email = ${body.email}
        LIMIT 1
      `);
      if (clash.rows.length) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }

      const center = areaName ? computeZoneCenter(areaName) : null;
      const passwordHash = await hashPassword(body.password);
      const phone = body.phone?.trim() ? normalizePhone(body.phone) : null;

      const created = await db.transaction(async (tx) => {
        const ins = await tx.execute(sql`
          INSERT INTO officers (name, email, password_hash, phone, area_name, panchayat_name, center_lat, center_lng)
          VALUES (${body.name}, ${body.email}, ${passwordHash}, ${phone}, ${areaName},
                  ${body.panchayatName}, ${center?.lat ?? null}, ${center?.lng ?? null})
          RETURNING id
        `);
        const officerId = Number((ins.rows[0] as any).id);
        await tx.execute(sql`
          INSERT INTO users (email, password_hash, name, role, officer_id, panchayat_name, phone)
          VALUES (${body.email}, ${passwordHash}, ${body.name}, 'field_officer',
                  ${String(officerId)}, ${body.panchayatName}, ${phone})
        `);
        return officerId;
      });

      logger.info({ officerId: created }, "Field officer created by Command Center");
      res.status(201).json({ staffType: "field_officer", id: created });
      return;
    }

    // ── Udupi hierarchy staff (phone-identified logins) ───────────────────────
    const meta = HIERARCHY_TABLES[body.staffType];
    if (!body.phone?.trim()) {
      res.status(400).json({ error: `Phone is required for a ${meta.label.toLowerCase()}` });
      return;
    }
    const phone = normalizePhone(body.phone);
    if (phone.length !== 10) {
      res.status(400).json({ error: "Phone must contain 10 digits" });
      return;
    }
    const loginEmail = `${phone}@phone.local`;

    const phoneClash = await db.execute(sql`
      SELECT 1 FROM users WHERE phone = ${phone} OR email = ${loginEmail} LIMIT 1
    `);
    if (phoneClash.rows.length) {
      res.status(409).json({ error: "Phone number is already in use by another account" });
      return;
    }

    if (body.staffType === "supervisor") {
      const hiId = body.healthInspectorId;
      if (!hiId) {
        res.status(400).json({ error: "healthInspectorId is required for a supervisor" });
        return;
      }
      const hi = await db.execute(sql`
        SELECT id FROM health_inspectors WHERE id = ${hiId} AND panchayat_name = ${body.panchayatName} LIMIT 1
      `);
      if (!hi.rows.length) {
        res.status(400).json({ error: "Health inspector not found in that panchayat" });
        return;
      }
      const wardNames = (body.wardNames ?? []).filter((w) => /^Ward \d+/.test(w));
      const passwordHash = await hashPassword(body.password);
      const id = await db.transaction(async (tx) => {
        const ins = await tx.execute(sql`
          INSERT INTO supervisors (name, phone, panchayat_name, health_inspector_id, ward_names)
          VALUES (${body.name}, ${phone}, ${body.panchayatName}, ${hiId}, ${JSON.stringify(wardNames)}::jsonb)
          RETURNING id
        `);
        const newId = Number((ins.rows[0] as any).id);
        await tx.execute(sql`
          INSERT INTO users (email, password_hash, name, role, officer_id, panchayat_name, phone, password_reset_required)
          VALUES (${loginEmail}, ${passwordHash}, ${body.name}, 'supervisor', ${String(newId)},
                  ${body.panchayatName}, ${phone}, false)
        `);
        return newId;
      });
      logger.info({ supervisorId: id }, "Supervisor created by Command Center");
      res.status(201).json({ staffType: "supervisor", id });
      return;
    }

    if (body.staffType === "health_inspector") {
      let eeId = body.environmentalEngineerId ?? null;
      if (eeId) {
        const ee = await db.execute(sql`
          SELECT id FROM environmental_engineers WHERE id = ${eeId} AND panchayat_name = ${body.panchayatName} LIMIT 1
        `);
        if (!ee.rows.length) {
          res.status(400).json({ error: "Environmental engineer not found in that panchayat" });
          return;
        }
      } else {
        // Default to the panchayat's single EE so the new HI is never orphaned.
        const ee = await db.execute(sql`
          SELECT id FROM environmental_engineers WHERE panchayat_name = ${body.panchayatName} ORDER BY id LIMIT 1
        `);
        if (!ee.rows.length) {
          res.status(400).json({ error: "No environmental engineer exists for that panchayat yet" });
          return;
        }
        eeId = Number((ee.rows[0] as any).id);
      }

      const passwordHash = await hashPassword(body.password);
      const id = await db.transaction(async (tx) => {
        const ins = await tx.execute(sql`
          INSERT INTO health_inspectors (name, phone, panchayat_name, environmental_engineer_id)
          VALUES (${body.name}, ${phone}, ${body.panchayatName}, ${eeId})
          RETURNING id
        `);
        const newId = Number((ins.rows[0] as any).id);
        await tx.execute(sql`
          INSERT INTO users (email, password_hash, name, role, officer_id, panchayat_name, phone, password_reset_required)
          VALUES (${loginEmail}, ${passwordHash}, ${body.name}, 'health_inspector', ${String(newId)},
                  ${body.panchayatName}, ${phone}, false)
        `);
        return newId;
      });
      logger.info({ healthInspectorId: id }, "Health inspector created by Command Center");
      res.status(201).json({ staffType: "health_inspector", id });
      return;
    }

    if (body.staffType === "community_mobiliser") {
      const wardKey = body.wardNames?.[0];
      const wardNumber = wardKey ? wardKeyToNumber(wardKey) : null;
      if (!wardNumber) {
        res.status(400).json({ error: "A Udupi ward is required for a community mobiliser" });
        return;
      }
      const wardLabel =
        (geofencesData.features as any[]).find((f) => f.properties?.name === wardKey)?.properties
          ?.wardName ?? wardKey;

      const passwordHash = await hashPassword(body.password);
      const id = await db.transaction(async (tx) => {
        const ins = await tx.execute(sql`
          INSERT INTO community_mobilisers (name, phone, panchayat_name, ward_name, ward_number)
          VALUES (${body.name}, ${phone}, ${body.panchayatName}, ${wardLabel}, ${wardNumber})
          RETURNING id
        `);
        const newId = Number((ins.rows[0] as any).id);
        await tx.execute(sql`
          INSERT INTO users (email, password_hash, name, role, officer_id, panchayat_name, phone, password_reset_required)
          VALUES (${loginEmail}, ${passwordHash}, ${body.name}, 'community_mobiliser', ${String(newId)},
                  ${body.panchayatName}, ${phone}, false)
        `);
        return newId;
      });
      logger.info({ communityMobiliserId: id }, "Community mobiliser created by Command Center");
      res.status(201).json({ staffType: "community_mobiliser", id });
      return;
    }

    // environmental_engineer
    const passwordHash = await hashPassword(body.password);
    const id = await db.transaction(async (tx) => {
      const ins = await tx.execute(sql`
        INSERT INTO environmental_engineers (name, phone, panchayat_name)
        VALUES (${body.name}, ${phone}, ${body.panchayatName})
        RETURNING id
      `);
      const newId = Number((ins.rows[0] as any).id);
      await tx.execute(sql`
        INSERT INTO users (email, password_hash, name, role, officer_id, panchayat_name, phone, password_reset_required)
        VALUES (${loginEmail}, ${passwordHash}, ${body.name}, 'environmental_engineer', ${String(newId)},
                ${body.panchayatName}, ${phone}, false)
      `);
      return newId;
    });
    logger.info({ envEngineerId: id }, "Environmental engineer created by Command Center");
    res.status(201).json({ staffType: "environmental_engineer", id });
  } catch (err) {
    logger.error({ err }, "Error creating staff member from Command Center");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Update (details, ward assignment, password) ──────────────────────────────

const UpdateStaffBody = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  password: z.string().min(6).optional(),
  wardNames: z.array(z.string().trim().min(1)).optional(),
  healthInspectorId: z.number().int().positive().optional(),
});

function parseStaffType(raw: unknown): StaffType | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (STAFF_TYPES as readonly string[]).includes(String(value)) ? (value as StaffType) : null;
}

/**
 * Update the login account for a field officer, keyed by officer_id (not email).
 * Older rows may predate officer_id being populated; in that case we repair the
 * link by matching the officer's *current* email, but only when that resolves to
 * exactly one field-officer account.
 */
async function updateFieldOfficerLogin(
  tx: any,
  officerId: number,
  currentEmail: string,
  set: { name?: string; email?: string; phone?: string | null; passwordHash?: string },
): Promise<void> {
  const linked = await tx.execute(sql`
    SELECT id FROM users WHERE officer_id = ${String(officerId)} AND role IN ${FIELD_OFFICER_ROLES}
  `);
  let userId: number | null = linked.rows.length === 1 ? Number((linked.rows[0] as any).id) : null;

  if (linked.rows.length > 1) {
    throw new Error(`Ambiguous login accounts for officer ${officerId}: ${linked.rows.length} rows`);
  }

  if (userId === null) {
    const byEmail = await tx.execute(sql`
      SELECT id FROM users WHERE email = ${currentEmail} AND role IN ${FIELD_OFFICER_ROLES}
    `);
    if (byEmail.rows.length !== 1) {
      throw new Error(
        `Cannot resolve a single login account for officer ${officerId} (matched ${byEmail.rows.length})`,
      );
    }
    userId = Number((byEmail.rows[0] as any).id);
    await tx.execute(sql`UPDATE users SET officer_id = ${String(officerId)} WHERE id = ${userId}`);
  }

  const updated = await tx.execute(sql`
    UPDATE users SET
      name          = COALESCE(${set.name ?? null}, name),
      email         = COALESCE(${set.email ?? null}, email),
      phone         = ${set.phone === undefined ? sql`phone` : set.phone},
      password_hash = COALESCE(${set.passwordHash ?? null}, password_hash)
    WHERE id = ${userId}
    RETURNING id
  `);
  if (updated.rows.length !== 1) {
    throw new Error(`Expected 1 users row for officer ${officerId}, got ${updated.rows.length}`);
  }
}

/**
 * Raised when a staff member's login account cannot be pinned down to exactly
 * one row. Callers turn this into a 409 rather than guessing.
 */
class UnresolvedLoginAccountError extends Error {}

/**
 * Delete the single login account belonging to a staff member, keyed strictly
 * by (role, officer_id).
 *
 * Email is deliberately NOT a fallback predicate here. A legacy officer whose
 * link is missing or stale may share an email with an unrelated user, and
 * deleting by email would destroy that person's login instead. Removal is
 * destructive and unrecoverable, so an unresolvable link must fail loudly and
 * roll back the whole removal rather than delete the wrong account — or delete
 * nothing at all and silently leave a working login for "removed" staff.
 */
async function deleteLoginAccount(
  tx: any,
  role: ReturnType<typeof sql> | string,
  staffId: number,
  label: string,
): Promise<void> {
  const roleClause = typeof role === "string" ? sql`role = ${role}` : sql`role IN ${role}`;
  const linked = await tx.execute(sql`
    SELECT id FROM users WHERE officer_id = ${String(staffId)} AND ${roleClause}
  `);

  if (linked.rows.length !== 1) {
    throw new UnresolvedLoginAccountError(
      linked.rows.length === 0
        ? `No login account is linked to this ${label}. Fix the account link before removing them.`
        : `This ${label} is linked to ${linked.rows.length} login accounts. Resolve the duplicates before removing them.`,
    );
  }

  const userId = Number((linked.rows[0] as any).id);
  const deleted = await tx.execute(sql`DELETE FROM users WHERE id = ${userId} RETURNING id`);
  if (deleted.rows.length !== 1) {
    throw new UnresolvedLoginAccountError(`Could not remove the login account for this ${label}.`);
  }
}

/** Same idea for hierarchy staff: keyed strictly by (role, officer_id). */
async function updateHierarchyLogin(
  tx: any,
  role: string,
  staffId: number,
  set: { name: string; phone: string; email: string; passwordHash?: string },
): Promise<void> {
  const updated = await tx.execute(sql`
    UPDATE users SET
      name          = ${set.name},
      phone         = ${set.phone},
      email         = ${set.email},
      password_hash = COALESCE(${set.passwordHash ?? null}, password_hash)
    WHERE officer_id = ${String(staffId)} AND role = ${role}
    RETURNING id
  `);
  if (updated.rows.length !== 1) {
    throw new Error(`Expected 1 users row for ${role} ${staffId}, got ${updated.rows.length}`);
  }
}

router.patch("/control-center/staff/:staffType/:id", requireControlCenter, async (req, res): Promise<void> => {
  const staffType = parseStaffType(req.params.staffType);
  if (!staffType) {
    res.status(400).json({ error: "Unknown staff type" });
    return;
  }
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }
  const body = parsed.data;

  try {
    if (staffType === "field_officer") {
      const existingRows = await db.execute(sql`
        SELECT id, name, email, phone, area_name AS "areaName", panchayat_name AS "panchayatName"
        FROM officers WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
      `);
      if (!existingRows.rows.length) {
        res.status(404).json({ error: "Officer not found" });
        return;
      }
      const existing = existingRows.rows[0] as any;

      if (body.email && body.email !== existing.email) {
        const clash = await db.execute(sql`
          SELECT 1 FROM officers WHERE email = ${body.email} AND deleted_at IS NULL AND id != ${id}
          UNION ALL
          SELECT 1 FROM users WHERE email = ${body.email}
            AND NOT (officer_id = ${String(id)} AND role IN ${FIELD_OFFICER_ROLES})
          LIMIT 1
        `);
        if (clash.rows.length) {
          res.status(409).json({ error: "Email already in use by another account" });
          return;
        }
      }

      let areaName: string | null | undefined;
      let center: { lat: number; lng: number } | null = null;
      if (body.wardNames !== undefined) {
        const wardError = validateWardAssignment("field_officer", existing.panchayatName, body.wardNames);
        if (wardError) {
          res.status(400).json({ error: wardError });
          return;
        }
        // Mirrors the create-time rule: a Udupi field officer is scoped to
        // reports by ward, so clearing the ward would leave them logging in to
        // an empty dashboard with no indication why.
        if (existing.panchayatName === "Udupi" && !body.wardNames.length) {
          res.status(400).json({ error: "A Udupi field officer must be assigned a ward" });
          return;
        }
        areaName = body.wardNames[0] ?? null;
        if (areaName) center = computeZoneCenter(areaName);
      }

      const phone = body.phone === undefined ? undefined : body.phone.trim() ? normalizePhone(body.phone) : null;
      const passwordHash = body.password ? await hashPassword(body.password) : undefined;

      await db.transaction(async (tx) => {
        await tx.execute(sql`
          UPDATE officers SET
            name          = COALESCE(${body.name ?? null}, name),
            email         = COALESCE(${body.email ?? null}, email),
            phone         = ${phone === undefined ? sql`phone` : phone},
            area_name     = ${areaName === undefined ? sql`area_name` : areaName},
            center_lat    = ${areaName === undefined ? sql`center_lat` : center?.lat ?? null},
            center_lng    = ${areaName === undefined ? sql`center_lng` : center?.lng ?? null},
            password_hash = COALESCE(${passwordHash ?? null}, password_hash)
          WHERE id = ${id}
        `);
        await updateFieldOfficerLogin(tx, id, existing.email, {
          name: body.name,
          email: body.email,
          phone,
          passwordHash,
        });
      });

      logger.info({ officerId: id, passwordChanged: Boolean(passwordHash) }, "Field officer updated by Command Center");
      res.json({ staffType, id });
      return;
    }

    const meta = HIERARCHY_TABLES[staffType];
    const existingRows = await db.execute(sql`
      SELECT id, name, phone, panchayat_name AS "panchayatName"
      FROM ${sql.raw(meta.table)} WHERE id = ${id} LIMIT 1
    `);
    if (!existingRows.rows.length) {
      res.status(404).json({ error: `${meta.label} not found` });
      return;
    }
    const existing = existingRows.rows[0] as any;

    if (body.wardNames !== undefined) {
      const wardError = validateWardAssignment(staffType, existing.panchayatName, body.wardNames);
      if (wardError) {
        res.status(400).json({ error: wardError });
        return;
      }
    }

    const newName = body.name?.trim() || existing.name;
    const newPhone = body.phone?.trim() ? normalizePhone(body.phone) : existing.phone;
    if (!newPhone || newPhone.length !== 10) {
      res.status(400).json({ error: "Phone must contain 10 digits" });
      return;
    }
    const newEmail = `${newPhone}@phone.local`;

    if (newPhone !== existing.phone) {
      const conflict = await db.execute(sql`
        SELECT 1 FROM users
        WHERE (phone = ${newPhone} OR email = ${newEmail})
          AND NOT (officer_id = ${String(id)} AND role = ${meta.role})
        LIMIT 1
      `);
      if (conflict.rows.length) {
        res.status(409).json({ error: "Phone number is already in use by another account" });
        return;
      }
    }

    // A supervisor must report to a health inspector in their own panchayat —
    // otherwise the hierarchy chain crosses municipalities and the supervisor
    // disappears from every role-scoped view on both sides.
    if (staffType === "supervisor" && body.healthInspectorId) {
      const hi = await db.execute(sql`
        SELECT 1 FROM health_inspectors
        WHERE id = ${body.healthInspectorId} AND panchayat_name = ${existing.panchayatName}
        LIMIT 1
      `);
      if (!hi.rows.length) {
        res.status(400).json({ error: "Health inspector not found in that panchayat" });
        return;
      }
    }

    const passwordHash = body.password ? await hashPassword(body.password) : undefined;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE ${sql.raw(meta.table)} SET name = ${newName}, phone = ${newPhone} WHERE id = ${id}
      `);

      if (staffType === "supervisor") {
        if (body.wardNames !== undefined) {
          const wardNames = body.wardNames.filter((w) => /^Ward \d+/.test(w));
          await tx.execute(sql`
            UPDATE supervisors SET ward_names = ${JSON.stringify(wardNames)}::jsonb WHERE id = ${id}
          `);
        }
        if (body.healthInspectorId) {
          await tx.execute(sql`
            UPDATE supervisors SET health_inspector_id = ${body.healthInspectorId} WHERE id = ${id}
          `);
        }
      }

      if (staffType === "community_mobiliser" && body.wardNames !== undefined) {
        const wardKey = body.wardNames[0];
        const wardNumber = wardKey ? wardKeyToNumber(wardKey) : null;
        if (wardNumber) {
          const wardLabel =
            (geofencesData.features as any[]).find((f) => f.properties?.name === wardKey)?.properties
              ?.wardName ?? wardKey;
          await tx.execute(sql`
            UPDATE community_mobilisers SET ward_name = ${wardLabel}, ward_number = ${wardNumber} WHERE id = ${id}
          `);
        }
      }

      await updateHierarchyLogin(tx, meta.role, id, {
        name: newName,
        phone: newPhone,
        email: newEmail,
        passwordHash,
      });
    });

    logger.info(
      { staffType, staffId: id, passwordChanged: Boolean(passwordHash) },
      "Hierarchy staff updated by Command Center",
    );
    res.json({ staffType, id, name: newName, phone: newPhone });
  } catch (err) {
    logger.error({ err }, "Error updating staff member from Command Center");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Remove ───────────────────────────────────────────────────────────────────

router.delete("/control-center/staff/:staffType/:id", requireControlCenter, async (req, res): Promise<void> => {
  const staffType = parseStaffType(req.params.staffType);
  if (!staffType) {
    res.status(400).json({ error: "Unknown staff type" });
    return;
  }
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  try {
    if (staffType === "field_officer") {
      const existingRows = await db.execute(sql`
        SELECT id, email FROM officers WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
      `);
      if (!existingRows.rows.length) {
        res.status(404).json({ error: "Officer not found" });
        return;
      }
      const tombstone = `__deleted_${id}__${Date.now()}`;

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`
            UPDATE officers SET email = ${tombstone}, deleted_at = now() WHERE id = ${id}
          `);
          await deleteLoginAccount(tx, FIELD_OFFICER_ROLES, id, "field officer");
        });
      } catch (err) {
        if (err instanceof UnresolvedLoginAccountError) {
          res.status(409).json({ error: err.message });
          return;
        }
        throw err;
      }

      logger.info({ officerId: id }, "Field officer removed by Command Center");
      res.json({ success: true });
      return;
    }

    const meta = HIERARCHY_TABLES[staffType];

    // Refuse to orphan children — the roster must never show a dangling chain.
    if (staffType === "health_inspector") {
      const kids = await db.execute(sql`SELECT 1 FROM supervisors WHERE health_inspector_id = ${id} LIMIT 1`);
      if (kids.rows.length) {
        res.status(409).json({
          error: "Reassign this health inspector's supervisors before removing them",
        });
        return;
      }
    }
    if (staffType === "environmental_engineer") {
      const kids = await db.execute(sql`SELECT 1 FROM health_inspectors WHERE environmental_engineer_id = ${id} LIMIT 1`);
      if (kids.rows.length) {
        res.status(409).json({
          error: "Reassign this engineer's health inspectors before removing them",
        });
        return;
      }
    }

    const existingRows = await db.execute(sql`SELECT id FROM ${sql.raw(meta.table)} WHERE id = ${id} LIMIT 1`);
    if (!existingRows.rows.length) {
      res.status(404).json({ error: `${meta.label} not found` });
      return;
    }

    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`DELETE FROM ${sql.raw(meta.table)} WHERE id = ${id}`);
        await deleteLoginAccount(tx, meta.role, id, meta.label.toLowerCase());
      });
    } catch (err) {
      if (err instanceof UnresolvedLoginAccountError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }

    logger.info({ staffType, staffId: id }, "Hierarchy staff removed by Command Center");
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Error removing staff member from Command Center");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
