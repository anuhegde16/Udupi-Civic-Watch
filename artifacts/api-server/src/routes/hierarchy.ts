/**
 * Hierarchy profile routes for Udupi management roles.
 * Each route returns the caller's profile plus their direct reports / linked entities.
 * All data is read from the raw SQL tables created at startup (supervisors,
 * health_inspectors, environmental_engineers, community_mobilisers).
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  requireSupervisor,
  requireHealthInspector,
  requireEnvEngineer,
  requireCommissioner,
  requireCommunityMobiliser,
  requireControlCenter,
  hashPassword,
  type SessionUser,
} from "../lib/auth";
import { logger } from "../lib/logger";
import { udupiWardRings, udupiBox, pointInPolygon as pip } from "../lib/geo";

const router: IRouter = Router();

// ── GET /api/control-center/udupi-operations ──────────────────────────────────
// Udupi Municipality reports are assigned geographically to ward polygons, not
// to rows in the legacy field-officers table.  This control-center-only view
// returns the real EE → HI → supervisor chain alongside those PiP-scoped reports.
router.get("/control-center/udupi-operations", requireControlCenter, async (_req, res): Promise<void> => {
  try {
    const [hierarchyRows, rawReports] = await Promise.all([
      db.execute(sql`
        SELECT
          ee.id AS "environmentalEngineerId",
          ee.name AS "environmentalEngineerName",
          ee.phone AS "environmentalEngineerPhone",
          hi.id AS "healthInspectorId",
          hi.name AS "healthInspectorName",
          hi.phone AS "healthInspectorPhone",
          sv.id AS "supervisorId",
          sv.name AS "supervisorName",
          sv.phone AS "supervisorPhone",
          sv.ward_names AS "wardNames"
        FROM environmental_engineers ee
        LEFT JOIN health_inspectors hi ON hi.environmental_engineer_id = ee.id
        LEFT JOIN supervisors sv ON sv.health_inspector_id = hi.id
        WHERE ee.panchayat_name = 'Udupi'
        ORDER BY hi.name, sv.name
      `),
      db.execute(sql`
        SELECT
          id, latitude, longitude, address, status,
          assigned_officer_id AS "assignedOfficerId",
          image_url AS "imageUrl", image_urls AS "imageUrls",
          cleanup_image_url AS "cleanupImageUrl", cleanup_image_urls AS "cleanupImageUrls",
          created_at AS "createdAt"
        FROM reports
        WHERE deleted_at IS NULL
          AND latitude BETWEEN ${udupiBox.minLat} AND ${udupiBox.maxLat}
          AND longitude BETWEEN ${udupiBox.minLng} AND ${udupiBox.maxLng}
        ORDER BY created_at DESC
      `),
    ]);

    type Supervisor = { id: number; name: string; phone: string; wardNames: string[] };
    type HealthInspector = { id: number; name: string; phone: string; supervisors: Supervisor[] };
    const healthInspectors = new Map<number, HealthInspector>();
    const supervisorByWard = new Map<string, {
      id: number;
      name: string;
      healthInspectorId: number;
      healthInspectorName: string;
    }>();
    let environmentalEngineer: { id: number; name: string; phone: string } | null = null;

    for (const row of hierarchyRows.rows as any[]) {
      if (!environmentalEngineer && row.environmentalEngineerId) {
        environmentalEngineer = {
          id: Number(row.environmentalEngineerId),
          name: row.environmentalEngineerName,
          phone: row.environmentalEngineerPhone,
        };
      }
      if (!row.healthInspectorId) continue;

      const healthInspectorId = Number(row.healthInspectorId);
      const healthInspector = healthInspectors.get(healthInspectorId) ?? {
        id: healthInspectorId,
        name: row.healthInspectorName,
        phone: row.healthInspectorPhone,
        supervisors: [] as Supervisor[],
      } satisfies HealthInspector;
      healthInspectors.set(healthInspectorId, healthInspector);
      if (!row.supervisorId) continue;

      const wardNames = Array.isArray(row.wardNames)
        ? row.wardNames
        : JSON.parse(row.wardNames ?? "[]");
      const supervisor = {
        id: Number(row.supervisorId),
        name: row.supervisorName,
        phone: row.supervisorPhone,
        wardNames,
      };
      healthInspector.supervisors.push(supervisor);
      for (const wardName of wardNames) {
        const match = wardName.match(/^Ward (\d+)/);
        if (!match) continue;
        supervisorByWard.set(`Udupi Ward ${match[1]}`, {
          id: supervisor.id,
          name: supervisor.name,
          healthInspectorId,
          healthInspectorName: healthInspector.name,
        });
      }
    }

    const reports = (rawReports.rows as any[]).flatMap((report) => {
      const ward = udupiWardRings.find(({ ring }) =>
        pip(Number(report.latitude), Number(report.longitude), ring),
      );
      if (!ward) return [];
      const supervisor = supervisorByWard.get(ward.name);
      return [{
        ...report,
        wardName: ward.name,
        supervisorId: supervisor?.id ?? null,
        supervisorName: supervisor?.name ?? null,
        healthInspectorId: supervisor?.healthInspectorId ?? null,
        healthInspectorName: supervisor?.healthInspectorName ?? null,
      }];
    });

    res.json({
      panchayatName: "Udupi",
      environmentalEngineer,
      healthInspectors: Array.from(healthInspectors.values()),
      reports,
      total: reports.length,
    });
  } catch (err) {
    logger.error({ err }, "Error fetching Udupi Municipality operations for control center");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/supervisor/me ─────────────────────────────────────────────────────
router.get("/supervisor/me", requireSupervisor, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) {
    res.status(404).json({ error: "Supervisor profile not found" });
    return;
  }
  try {
    const result = await db.execute(sql`
      SELECT sv.id, sv.name, sv.phone, sv.panchayat_name, sv.ward_names,
             hi.id   AS health_inspector_id,
             hi.name AS health_inspector_name,
             hi.phone AS health_inspector_phone
      FROM   supervisors sv
      LEFT JOIN health_inspectors hi ON hi.id = sv.health_inspector_id
      WHERE  sv.id = ${Number(user.officerId)}
      LIMIT  1
    `);
    if (!result.rows.length) {
      res.status(404).json({ error: "Supervisor not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "Error fetching supervisor profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/health-inspector/me ───────────────────────────────────────────────
router.get("/health-inspector/me", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) {
    res.status(404).json({ error: "Health inspector profile not found" });
    return;
  }
  try {
    const hiResult = await db.execute(sql`
      SELECT id, name, phone, panchayat_name
      FROM   health_inspectors
      WHERE  id = ${Number(user.officerId)}
      LIMIT  1
    `);
    if (!hiResult.rows.length) {
      res.status(404).json({ error: "Health inspector not found" });
      return;
    }
    const supervisors = await db.execute(sql`
      SELECT id, name, phone, ward_names
      FROM   supervisors
      WHERE  health_inspector_id = ${Number(user.officerId)}
      ORDER  BY name
    `);
    res.json({ ...hiResult.rows[0], supervisors: supervisors.rows });
  } catch (err) {
    logger.error({ err }, "Error fetching health inspector profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/env-engineer/me ───────────────────────────────────────────────────
router.get("/env-engineer/me", requireEnvEngineer, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) {
    res.status(404).json({ error: "Environmental engineer profile not found" });
    return;
  }
  try {
    const eeResult = await db.execute(sql`
      SELECT id, name, phone, panchayat_name
      FROM   environmental_engineers
      WHERE  id = ${Number(user.officerId)}
      LIMIT  1
    `);
    if (!eeResult.rows.length) {
      res.status(404).json({ error: "Environmental engineer not found" });
      return;
    }
    const healthInspectors = await db.execute(sql`
      SELECT hi.id, hi.name, hi.phone,
             COUNT(sv.id)::int AS supervisor_count
      FROM   health_inspectors hi
      LEFT JOIN supervisors sv ON sv.health_inspector_id = hi.id
      WHERE  hi.environmental_engineer_id = ${Number(user.officerId)}
      GROUP  BY hi.id, hi.name, hi.phone
      ORDER  BY hi.name
    `);
    res.json({ ...eeResult.rows[0], healthInspectors: healthInspectors.rows });
  } catch (err) {
    logger.error({ err }, "Error fetching environmental engineer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/community-mobiliser/me ───────────────────────────────────────────
router.get("/community-mobiliser/me", requireCommunityMobiliser, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) {
    res.status(404).json({ error: "Community mobiliser profile not found" });
    return;
  }
  try {
    const result = await db.execute(sql`
      SELECT id, name, phone, panchayat_name, ward_name, ward_number
      FROM   community_mobilisers
      WHERE  id = ${Number(user.officerId)}
      LIMIT  1
    `);
    if (!result.rows.length) {
      res.status(404).json({ error: "Community mobiliser not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "Error fetching community mobiliser profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/commissioner/me ───────────────────────────────────────────────────
// Commissioner has no separate profile table — returns the users row enriched
// with the panchayat's environmental engineer and health inspector summary.
router.get("/commissioner/me", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  try {
    const ee = await db.execute(sql`
      SELECT ee.id, ee.name, ee.phone,
             COUNT(hi.id)::int AS health_inspector_count
      FROM   environmental_engineers ee
      LEFT JOIN health_inspectors hi ON hi.environmental_engineer_id = ee.id
      WHERE  ee.panchayat_name = ${user.panchayatName ?? "Udupi"}
      GROUP  BY ee.id, ee.name, ee.phone
      LIMIT  1
    `);
    res.json({
      id: user.id,
      name: user.name,
      role: user.role,
      panchayatName: user.panchayatName,
      environmentalEngineer: ee.rows[0] ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Error fetching commissioner profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/supervisor/reports ────────────────────────────────────────────────
// Returns all active (non-archived) reports for the wards the supervisor manages.
// Ward matching: supervisor.ward_names stores "Ward N/Town"; field officers have
// area_name = "Ward N" so we strip the locality suffix for the JOIN.
router.get("/supervisor/reports", requireSupervisor, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) {
    res.status(404).json({ error: "Supervisor profile not found" });
    return;
  }
  try {
    const profRow = await db.execute(sql`
      SELECT ward_names FROM supervisors WHERE id = ${Number(user.officerId)} LIMIT 1
    `);
    if (!profRow.rows.length) { res.json({ reports: [], total: 0 }); return; }
    const wardNames: string[] = (profRow.rows[0] as any).ward_names as string[];

    // Convert "Ward N/Town" → Udupi ward rings for PiP filtering
    const rings: { name: string; ring: [number, number][] }[] = [];
    for (const wn of wardNames) {
      const m = wn.match(/^Ward (\d+)/);
      if (!m) continue;
      const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
      if (entry) rings.push(entry);
    }
    if (!rings.length) { res.json({ reports: [], total: 0 }); return; }

    const { minLat, maxLat, minLng, maxLng } = ringsBbox(rings);
    const rawRows = await db.execute(sql`
      SELECT
        r.id, r.status, r.address, r.description, r.latitude, r.longitude,
        r.image_url AS "imageUrl", r.image_urls AS "imageUrls",
        r.cleanup_image_url AS "cleanupImageUrl", r.cleanup_image_urls AS "cleanupImageUrls",
        r.waste_types AS "wasteTypes", r.waste_severity AS "wasteSeverity",
        r.created_at AS "createdAt", r.updated_at AS "updatedAt",
        r.cleaning_started_at AS "cleaningStartedAt", r.cleaned_at AS "cleanedAt"
      FROM reports r
      WHERE r.deleted_at IS NULL
        AND r.latitude  BETWEEN ${minLat} AND ${maxLat}
        AND r.longitude BETWEEN ${minLng} AND ${maxLng}
      ORDER BY r.created_at DESC
    `);

    const reports = (rawRows.rows as any[]).flatMap(r => {
      const match = rings.find(ring => pip(Number(r.latitude), Number(r.longitude), ring.ring));
      if (!match) return [];
      return [{ ...r, wardName: match.name }];
    });
    res.json({ reports, total: reports.length });
  } catch (err) {
    logger.error({ err }, "Error fetching supervisor reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/supervisor/reports/:id ─────────────────────────────────────────
// Supervisors can update report status for reports in their wards (same as field officer).
router.patch("/supervisor/reports/:id", requireSupervisor, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No supervisor profile" }); return; }
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid report ID" }); return; }
  const { status } = req.body ?? {};
  if (!["cleaning", "cleaned"].includes(status)) {
    res.status(400).json({ error: "status must be 'cleaning' or 'cleaned'" });
    return;
  }
  try {
    // Verify the report is in one of this supervisor's wards (PiP)
    const reportRow = await db.execute(sql`
      SELECT id, latitude, longitude FROM reports
      WHERE id = ${id} AND deleted_at IS NULL LIMIT 1
    `);
    if (!reportRow.rows.length) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    const rpt = reportRow.rows[0] as any;

    const svRow = await db.execute(sql`
      SELECT ward_names FROM supervisors WHERE id = ${Number(user.officerId)} LIMIT 1
    `);
    const wardNames: string[] = (svRow.rows[0] as any)?.ward_names ?? [];
    const svRings = wardNames.flatMap((wn: string) => {
      const m = wn.match(/^Ward (\d+)/);
      if (!m) return [];
      const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
      return entry ? [entry] : [];
    });
    const inWard = svRings.some(r => pip(Number(rpt.latitude), Number(rpt.longitude), r.ring));
    if (!inWard) {
      res.status(403).json({ error: "Report not in your wards" });
      return;
    }
    const setFields: Record<string, any> = { status };
    if (status === "cleaning") setFields.cleaning_started_at = sql`COALESCE(cleaning_started_at, NOW())`;
    if (status === "cleaned") {
      setFields.cleaned_at = sql`COALESCE(cleaned_at, NOW())`;
      setFields.cleaning_started_at = sql`COALESCE(cleaning_started_at, NOW())`;
    }
    const updated = await db.execute(sql`
      UPDATE reports
      SET status = ${status},
          cleaning_started_at = CASE WHEN ${status} IN ('cleaning','cleaned') THEN COALESCE(cleaning_started_at, NOW()) ELSE cleaning_started_at END,
          cleaned_at = CASE WHEN ${status} = 'cleaned' THEN COALESCE(cleaned_at, NOW()) ELSE cleaned_at END,
          updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, status, updated_at
    `);
    res.json(updated.rows[0] ?? { id, status });
  } catch (err) {
    logger.error({ err }, "Error updating supervisor report status");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/health-inspector/supervisor-stats ─────────────────────────────────
// Returns each supervisor under this HI with their ward names and report counts.
router.get("/health-inspector/supervisor-stats", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(404).json({ error: "HI profile not found" }); return; }
  try {
    // Load all supervisors under this HI
    const svRows = await db.execute(sql`
      SELECT id, name, phone, ward_names AS "wardNames"
      FROM supervisors
      WHERE health_inspector_id = ${Number(user.officerId)}
      ORDER BY name
    `);
    const svList = svRows.rows as { id: number; name: string; phone: string; wardNames: string[] }[];
    if (!svList.length) { res.json({ supervisors: [] }); return; }

    // Build ring → supervisorId index for PiP aggregation
    const wardEntries: { ring: [number, number][]; svId: number }[] = [];
    for (const sv of svList) {
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, svId: sv.id });
      }
    }

    // Zero-initialise counts for every supervisor
    type Counts = { reportedCount: number; cleaningCount: number; cleanedCount: number; totalCount: number };
    const counts = new Map<number, Counts>();
    for (const sv of svList) counts.set(sv.id, { reportedCount: 0, cleaningCount: 0, cleanedCount: 0, totalCount: 0 });

    if (wardEntries.length) {
      const { minLat, maxLat, minLng, maxLng } = ringsBbox(wardEntries.map(e => ({ ring: e.ring })));
      const rawRows = await db.execute(sql`
        SELECT latitude, longitude, status FROM reports
        WHERE deleted_at IS NULL
          AND latitude  BETWEEN ${minLat} AND ${maxLat}
          AND longitude BETWEEN ${minLng} AND ${maxLng}
      `);
      for (const r of rawRows.rows as any[]) {
        const lat = Number(r.latitude), lng = Number(r.longitude);
        const match = wardEntries.find(e => pip(lat, lng, e.ring));
        if (!match) continue;
        const c = counts.get(match.svId)!;
        if (r.status === "reported") c.reportedCount++;
        else if (r.status === "cleaning") c.cleaningCount++;
        else if (r.status === "cleaned") c.cleanedCount++;
        c.totalCount++;
      }
    }

    const supervisors = svList.map(sv => ({ ...sv, ...counts.get(sv.id)! }));
    res.json({ supervisors });
  } catch (err) {
    logger.error({ err }, "Error fetching HI supervisor stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/health-inspector/supervisor/:supervisorId/reports ─────────────────
// Returns reports for a specific supervisor (must be under this HI).
// Optional ?status=reported|cleaning|cleaned filter.
router.get("/health-inspector/supervisor/:supervisorId/reports", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No HI profile" }); return; }
  const rawSvId = Array.isArray(req.params.supervisorId) ? req.params.supervisorId[0] : req.params.supervisorId;
  const svId = parseInt(rawSvId, 10);
  if (isNaN(svId)) { res.status(400).json({ error: "Invalid supervisorId" }); return; }
  const statusFilter = req.query.status as string | undefined;
  if (statusFilter && !["reported", "cleaning", "cleaned"].includes(statusFilter)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  try {
    // Verify supervisor belongs to this HI and fetch name + ward names
    const svRow = await db.execute(sql`
      SELECT name, ward_names AS "wardNames" FROM supervisors
      WHERE id = ${svId} AND health_inspector_id = ${Number(user.officerId)}
      LIMIT 1
    `);
    if (!svRow.rows.length) {
      res.status(403).json({ error: "Supervisor not under your team" });
      return;
    }
    const { name: svName, wardNames } = svRow.rows[0] as any;

    const wardEntries: { ring: [number, number][]; wardName: string; svName: string }[] = [];
    for (const wn of (wardNames ?? []) as string[]) {
      const m = wn.match(/^Ward (\d+)/);
      if (!m) continue;
      const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
      if (entry) wardEntries.push({ ring: entry.ring, wardName: entry.name, svName });
    }
    if (!wardEntries.length) { res.json({ reports: [] }); return; }

    const reports = await fetchReportsInWardEntries(wardEntries, { statusFilter });
    res.json({ reports });
  } catch (err) {
    logger.error({ err }, "Error fetching supervisor reports for HI");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/health-inspector/reports/:reportId/reassign ──────────────────────
// Reassigns a "New" (reported) report to a different field officer (supervisor's ward).
// Both the current and target supervisor must be under the calling HI.
router.post("/health-inspector/reports/:reportId/reassign", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No HI profile" }); return; }

  const rawId = Array.isArray(req.params.reportId) ? req.params.reportId[0] : req.params.reportId;
  const reportId = parseInt(rawId, 10);
  if (isNaN(reportId)) { res.status(400).json({ error: "Invalid reportId" }); return; }

  const { targetSupervisorId } = req.body ?? {};
  const targetSvId = parseInt(String(targetSupervisorId), 10);
  if (isNaN(targetSvId)) { res.status(400).json({ error: "targetSupervisorId required" }); return; }

  try {
    // Fetch the report to get coordinates and status for PiP auth
    const reportRow = await db.execute(sql`
      SELECT id, status, latitude, longitude FROM reports
      WHERE id = ${reportId} AND deleted_at IS NULL LIMIT 1
    `);
    if (!reportRow.rows.length) { res.status(404).json({ error: "Report not found" }); return; }
    const report = reportRow.rows[0] as any;

    // Build PiP rings for all supervisors under this HI
    const svHiRows = await db.execute(sql`
      SELECT id, ward_names AS "wardNames" FROM supervisors
      WHERE health_inspector_id = ${Number(user.officerId)}
    `);
    const hiRings: [number, number][][] = [];
    for (const sv of svHiRows.rows as any[]) {
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) hiRings.push(entry.ring);
      }
    }

    // Auth: report must fall inside one of this HI's supervisor wards (geo/PiP)
    // or be directly assigned to one of their officers (Saligrama fallback).
    const lat = Number(report.latitude), lng = Number(report.longitude);
    const inHiWardGeo = hiRings.some(ring => pip(lat, lng, ring));
    if (!inHiWardGeo) {
      const assignedCheck = await db.execute(sql`
        SELECT r.id FROM supervisors sv
        JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
        JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
        JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
        WHERE sv.health_inspector_id = ${Number(user.officerId)} AND r.id = ${reportId}
        LIMIT 1
      `);
      if (!assignedCheck.rows.length) {
        res.status(403).json({ error: "Report not in your wards" });
        return;
      }
    }

    // Verify target supervisor is under this HI
    const targetSvCheck = await db.execute(sql`
      SELECT id FROM supervisors
      WHERE id = ${targetSvId} AND health_inspector_id = ${Number(user.officerId)}
      LIMIT 1
    `);
    if (!targetSvCheck.rows.length) {
      res.status(403).json({ error: "Target supervisor is not under your team" });
      return;
    }

    // Find the first active officer in the target supervisor's wards.
    // For geo-routed panchayats (e.g. Udupi), no officer row will exist —
    // in that case we allow the update with a null assigned_officer_id so the
    // report stays visible via geography.
    const officerLookup = await db.execute(sql`
      SELECT o.id AS officer_id
      FROM supervisors sv
      JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
      JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
      WHERE sv.id = ${targetSvId}
      LIMIT 1
    `);
    const targetOfficerId = officerLookup.rows.length
      ? (officerLookup.rows[0] as any).officer_id
      : null;

    // Atomically update the report only if it is still in "reported" status.
    // This prevents a race where a concurrent status change (e.g. officer starts cleaning)
    // happens between the ownership check above and this write.
    const updated = await db.execute(sql`
      UPDATE reports
      SET assigned_officer_id = ${targetOfficerId}, updated_at = NOW()
      WHERE id = ${reportId} AND status = 'reported' AND deleted_at IS NULL
      RETURNING id, status, assigned_officer_id, updated_at
    `);

    if (!updated.rows.length) {
      res.status(409).json({ error: "Report is no longer in New status and cannot be reassigned" });
      return;
    }

    res.json(updated.rows[0]);
  } catch (err) {
    logger.error({ err }, "Error reassigning report");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/health-inspector/supervisor/:id/credentials ─────────────────────
// Health Inspector can update name, phone, or password for a supervisor under them.
// ── GET /api/health-inspector/report/:id ──────────────────────────────────────
// Look up a single report by ID, authorised via the same ward-PiP scope used by
// /api/health-inspector/reports.  Only returns the report if its lat/lng falls
// within a ward polygon belonging to one of this HI's supervisors.
router.get("/health-inspector/report/:id", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No HI profile" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid report ID" }); return; }

  try {
    // 1. Collect ward rings for all supervisors under this HI (mirrors /health-inspector/reports).
    const svRows = await db.execute(sql`
      SELECT id, name, ward_names AS "wardNames"
      FROM supervisors WHERE health_inspector_id = ${Number(user.officerId)}
    `);
    const svList = svRows.rows as { id: number; name: string; wardNames: string[] }[];

    const wardEntries: { ring: [number, number][]; wardName: string; svName: string }[] = [];
    for (const sv of svList) {
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, wardName: entry.name, svName: sv.name });
      }
    }

    if (!wardEntries.length) {
      // No ward rings resolved (e.g. Saligrama HI with no geo rings) — cannot authorise.
      res.status(404).json({ error: "Report not found or not accessible" });
      return;
    }

    // 2. Fetch the report by ID (no role gate — we authorise via PiP below).
    const rptRows = await db.execute(sql`
      SELECT
        r.id,
        r.latitude,
        r.longitude,
        r.address,
        r.status,
        r.image_url          AS "imageUrl",
        r.image_urls         AS "imageUrls",
        r.cleanup_image_url  AS "cleanupImageUrl",
        r.cleanup_image_urls AS "cleanupImageUrls",
        r.created_at         AS "createdAt",
        o.name               AS "officerName"
      FROM reports r
      LEFT JOIN officers o ON o.id = r.assigned_officer_id
      WHERE r.id = ${id} AND r.deleted_at IS NULL
      LIMIT 1
    `);

    if (!rptRows.rows.length) {
      res.status(404).json({ error: "Report not found or not accessible" });
      return;
    }

    // 3. PiP authorisation: the report must fall inside one of the HI's ward polygons.
    const rpt = rptRows.rows[0] as any;
    const lat = Number(rpt.latitude);
    const lng = Number(rpt.longitude);
    const match = wardEntries.find(e => pip(lat, lng, e.ring));
    if (!match) {
      res.status(404).json({ error: "Report not found or not accessible" });
      return;
    }

    res.json({ ...rpt, wardName: match.wardName });
  } catch (err) {
    logger.error({ err }, "Error fetching HI report by ID");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/health-inspector/supervisor/:id/credentials", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No HI profile" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const svId = parseInt(rawId, 10);
  if (isNaN(svId)) { res.status(400).json({ error: "Invalid supervisor ID" }); return; }

  const { name, phone, password } = req.body ?? {};

  try {
    // Verify supervisor belongs to this HI
    const svCheck = await db.execute(sql`
      SELECT id, name, phone FROM supervisors
      WHERE id = ${svId} AND health_inspector_id = ${Number(user.officerId)}
      LIMIT 1
    `);
    if (!svCheck.rows.length) {
      res.status(403).json({ error: "Supervisor not under your team" });
      return;
    }
    const existing = svCheck.rows[0] as any;

    const newName = (name as string)?.trim() || existing.name;
    const newPhone = (phone as string)?.trim() || existing.phone;
    const newEmail = `${newPhone}@phone.local`;
    const oldEmail = `${existing.phone}@phone.local`;

    // Pre-flight: reject if the new phone is already taken by a different account.
    // Check both the supervisors table and the users table to catch any alias.
    if (newPhone !== existing.phone) {
      const phoneConflict = await db.execute(sql`
        SELECT id FROM users
        WHERE (phone = ${newPhone} OR email = ${newEmail})
          AND NOT (phone = ${existing.phone} OR email = ${oldEmail})
        LIMIT 1
      `);
      if (phoneConflict.rows.length) {
        res.status(409).json({ error: "Phone number is already in use by another account" });
        return;
      }
    }

    // Hash password outside the transaction (CPU-bound; avoids holding a connection slot).
    const newHash = (password as string)?.trim()
      ? await hashPassword((password as string).trim())
      : null;

    // Transactional update: supervisors row + users row together.
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE supervisors SET name = ${newName}, phone = ${newPhone}
        WHERE id = ${svId}
      `);

      // Identify the users row by its immutable officer_id link, not by mutable phone/email.
      const userUpdate = newHash
        ? await tx.execute(sql`
            UPDATE users
            SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}, password_hash = ${newHash}
            WHERE officer_id = ${String(svId)} AND role = 'supervisor'
            RETURNING id
          `)
        : await tx.execute(sql`
            UPDATE users
            SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}
            WHERE officer_id = ${String(svId)} AND role = 'supervisor'
            RETURNING id
          `);

      if (userUpdate.rows.length !== 1) {
        throw new Error(`Expected 1 users row for supervisor ${svId}, got ${userUpdate.rows.length}`);
      }
    });

    res.json({ id: svId, name: newName, phone: newPhone });
  } catch (err) {
    logger.error({ err }, "Error updating supervisor credentials");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/env-engineer/full-hierarchy ──────────────────────────────────────
// Returns all HIs under this EE, each with their supervisors (ward names + report counts).
router.get("/env-engineer/full-hierarchy", requireEnvEngineer, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(404).json({ error: "EE profile not found" }); return; }
  try {
    // Load HI list (supervisor count only — no officer join)
    const hiRows = await db.execute(sql`
      SELECT hi.id, hi.name, hi.phone,
             COUNT(DISTINCT sv.id)::int AS "supervisorCount"
      FROM health_inspectors hi
      LEFT JOIN supervisors sv ON sv.health_inspector_id = hi.id
      WHERE hi.environmental_engineer_id = ${Number(user.officerId)}
      GROUP BY hi.id, hi.name, hi.phone
      ORDER BY hi.name
    `);
    const hiList = hiRows.rows as { id: number; name: string; phone: string; supervisorCount: number }[];
    if (!hiList.length) { res.json({ healthInspectors: [] }); return; }

    // Load all supervisors for these HIs in one query
    // (sql.raw is safe here — hiIds are integer PKs from our own DB, not user input)
    const hiIds = hiList.map(h => h.id);
    const svRows = await db.execute(sql`
      SELECT id, name, phone, ward_names AS "wardNames", health_inspector_id AS "hiId"
      FROM supervisors
      WHERE health_inspector_id IN (${sql.raw(hiIds.join(','))})
      ORDER BY name
    `);
    const svList = svRows.rows as { id: number; name: string; phone: string; wardNames: string[]; hiId: number }[];

    // Build ring → {hiId, svId} index for PiP aggregation
    const wardEntries: { ring: [number, number][]; hiId: number; svId: number }[] = [];
    for (const sv of svList) {
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, hiId: sv.hiId, svId: sv.id });
      }
    }

    // Zero-initialise counts
    type Counts = { reportedCount: number; cleaningCount: number; cleanedCount: number; totalCount: number };
    const hiCounts = new Map<number, Counts>();
    const svCounts = new Map<number, Counts>();
    for (const hi of hiList) hiCounts.set(hi.id, { reportedCount: 0, cleaningCount: 0, cleanedCount: 0, totalCount: 0 });
    for (const sv of svList) svCounts.set(sv.id, { reportedCount: 0, cleaningCount: 0, cleanedCount: 0, totalCount: 0 });

    if (wardEntries.length) {
      const { minLat, maxLat, minLng, maxLng } = ringsBbox(wardEntries.map(e => ({ ring: e.ring })));
      const rawRows = await db.execute(sql`
        SELECT latitude, longitude, status FROM reports
        WHERE deleted_at IS NULL
          AND latitude  BETWEEN ${minLat} AND ${maxLat}
          AND longitude BETWEEN ${minLng} AND ${maxLng}
      `);
      const bump = (c: Counts, s: string) => {
        if (s === "reported") c.reportedCount++;
        else if (s === "cleaning") c.cleaningCount++;
        else if (s === "cleaned") c.cleanedCount++;
        c.totalCount++;
      };
      for (const r of rawRows.rows as any[]) {
        const lat = Number(r.latitude), lng = Number(r.longitude);
        const match = wardEntries.find(e => pip(lat, lng, e.ring));
        if (!match) continue;
        bump(hiCounts.get(match.hiId)!, r.status);
        bump(svCounts.get(match.svId)!, r.status);
      }
    }

    // Assemble response — same shape the frontend expects
    const healthInspectors = hiList.map(hi => ({
      ...hi,
      ...hiCounts.get(hi.id)!,
      supervisors: svList
        .filter(sv => sv.hiId === hi.id)
        .map(sv => ({ id: sv.id, name: sv.name, phone: sv.phone, wardNames: sv.wardNames, ...svCounts.get(sv.id)! })),
    }));

    res.json({ healthInspectors });
  } catch (err) {
    logger.error({ err }, "Error fetching EE full hierarchy");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/env-engineer/report/:id ─────────────────────────────────────────
// Look up a single report by ID, authorised via the same ward-PiP scope used by
// /api/env-engineer/reports.  Only returns the report if its lat/lng falls within
// a ward polygon belonging to any supervisor under any HI under this EE.
router.get("/env-engineer/report/:id", requireEnvEngineer, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No EE profile" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid report ID" }); return; }

  try {
    // 1. Resolve the HI chain under this EE (mirrors /env-engineer/reports).
    const hiRows = await db.execute(sql`
      SELECT id, name FROM health_inspectors
      WHERE environmental_engineer_id = ${Number(user.officerId)}
    `);
    const hiList = hiRows.rows as { id: number; name: string }[];
    if (!hiList.length) {
      res.status(404).json({ error: "Report not found or not accessible" });
      return;
    }

    const hiIds = hiList.map(h => h.id);
    const hiNameById = new Map(hiList.map(h => [h.id, h.name]));

    const svRows = await db.execute(sql`
      SELECT id, name, health_inspector_id AS "hiId", ward_names AS "wardNames"
      FROM supervisors WHERE health_inspector_id IN (${sql.raw(hiIds.join(','))})
    `);
    const svList = svRows.rows as { id: number; name: string; hiId: number; wardNames: string[] }[];

    const wardEntries: { ring: [number, number][]; wardName: string; svName: string; hiName: string }[] = [];
    for (const sv of svList) {
      const hiName = hiNameById.get(sv.hiId) ?? "";
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, wardName: entry.name, svName: sv.name, hiName });
      }
    }

    if (!wardEntries.length) {
      res.status(404).json({ error: "Report not found or not accessible" });
      return;
    }

    // 2. Fetch the report by ID.
    const rptRows = await db.execute(sql`
      SELECT
        r.id,
        r.latitude,
        r.longitude,
        r.address,
        r.status,
        r.image_url          AS "imageUrl",
        r.image_urls         AS "imageUrls",
        r.cleanup_image_url  AS "cleanupImageUrl",
        r.cleanup_image_urls AS "cleanupImageUrls",
        r.created_at         AS "createdAt",
        o.name               AS "officerName"
      FROM reports r
      LEFT JOIN officers o ON o.id = r.assigned_officer_id
      WHERE r.id = ${id} AND r.deleted_at IS NULL
      LIMIT 1
    `);

    if (!rptRows.rows.length) {
      res.status(404).json({ error: "Report not found or not accessible" });
      return;
    }

    // 3. PiP authorisation: the report must fall inside one of the EE's ward polygons.
    const rpt = rptRows.rows[0] as any;
    const lat = Number(rpt.latitude);
    const lng = Number(rpt.longitude);
    const match = wardEntries.find(e => pip(lat, lng, e.ring));
    if (!match) {
      res.status(404).json({ error: "Report not found or not accessible" });
      return;
    }

    res.json({ ...rpt, wardName: match.wardName });
  } catch (err) {
    logger.error({ err }, "Error fetching EE report by ID");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/env-engineer/health-inspector/:id/credentials ──────────────────
// EE can update name, phone, or password for a health inspector under them.
router.patch("/env-engineer/health-inspector/:id/credentials", requireEnvEngineer, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No EE profile" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const hiId = parseInt(rawId, 10);
  if (isNaN(hiId)) { res.status(400).json({ error: "Invalid health inspector ID" }); return; }

  const { name, phone, password } = req.body ?? {};

  try {
    // Verify HI belongs to this EE
    const hiCheck = await db.execute(sql`
      SELECT id, name, phone FROM health_inspectors
      WHERE id = ${hiId} AND environmental_engineer_id = ${Number(user.officerId)}
      LIMIT 1
    `);
    if (!hiCheck.rows.length) {
      res.status(403).json({ error: "Health inspector not under your team" });
      return;
    }
    const existing = hiCheck.rows[0] as any;

    const newName = (name as string)?.trim() || existing.name;
    const newPhone = (phone as string)?.trim() || existing.phone;
    const newEmail = `${newPhone}@phone.local`;
    const oldEmail = `${existing.phone}@phone.local`;

    // Pre-flight uniqueness check for phone change
    if (newPhone !== existing.phone) {
      const conflict = await db.execute(sql`
        SELECT id FROM users
        WHERE (phone = ${newPhone} OR email = ${newEmail})
          AND NOT (phone = ${existing.phone} OR email = ${oldEmail})
        LIMIT 1
      `);
      if (conflict.rows.length) {
        res.status(409).json({ error: "Phone number is already in use by another account" });
        return;
      }
    }

    const newHash = (password as string)?.trim()
      ? await hashPassword((password as string).trim())
      : null;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE health_inspectors SET name = ${newName}, phone = ${newPhone}
        WHERE id = ${hiId}
      `);

      // Identify the users row by its immutable officer_id link, not by mutable phone/email.
      const userUpdate = newHash
        ? await tx.execute(sql`
            UPDATE users
            SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}, password_hash = ${newHash}
            WHERE officer_id = ${String(hiId)} AND role = 'health_inspector'
            RETURNING id
          `)
        : await tx.execute(sql`
            UPDATE users
            SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}
            WHERE officer_id = ${String(hiId)} AND role = 'health_inspector'
            RETURNING id
          `);

      if (userUpdate.rows.length !== 1) {
        throw new Error(`Expected 1 users row for HI ${hiId}, got ${userUpdate.rows.length}`);
      }
    });

    res.json({ id: hiId, name: newName, phone: newPhone });
  } catch (err) {
    logger.error({ err }, "Error updating health inspector credentials");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/env-engineer/supervisor/:id/credentials ────────────────────────
// EE can update name, phone, or password for a supervisor whose HI is under them.
router.patch("/env-engineer/supervisor/:id/credentials", requireEnvEngineer, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No EE profile" }); return; }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const svId = parseInt(rawId, 10);
  if (isNaN(svId)) { res.status(400).json({ error: "Invalid supervisor ID" }); return; }

  const { name, phone, password } = req.body ?? {};

  try {
    // Verify supervisor → HI → EE chain
    const svCheck = await db.execute(sql`
      SELECT sv.id, sv.name, sv.phone FROM supervisors sv
      JOIN health_inspectors hi ON hi.id = sv.health_inspector_id
      WHERE sv.id = ${svId} AND hi.environmental_engineer_id = ${Number(user.officerId)}
      LIMIT 1
    `);
    if (!svCheck.rows.length) {
      res.status(403).json({ error: "Supervisor not under your team" });
      return;
    }
    const existing = svCheck.rows[0] as any;

    const newName = (name as string)?.trim() || existing.name;
    const newPhone = (phone as string)?.trim() || existing.phone;
    const newEmail = `${newPhone}@phone.local`;
    const oldEmail = `${existing.phone}@phone.local`;

    if (newPhone !== existing.phone) {
      const conflict = await db.execute(sql`
        SELECT id FROM users
        WHERE (phone = ${newPhone} OR email = ${newEmail})
          AND NOT (phone = ${existing.phone} OR email = ${oldEmail})
        LIMIT 1
      `);
      if (conflict.rows.length) {
        res.status(409).json({ error: "Phone number is already in use by another account" });
        return;
      }
    }

    const newHash = (password as string)?.trim()
      ? await hashPassword((password as string).trim())
      : null;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE supervisors SET name = ${newName}, phone = ${newPhone}
        WHERE id = ${svId}
      `);

      // Identify the users row by its immutable officer_id link, not by mutable phone/email.
      const userUpdate = newHash
        ? await tx.execute(sql`
            UPDATE users
            SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}, password_hash = ${newHash}
            WHERE officer_id = ${String(svId)} AND role = 'supervisor'
            RETURNING id
          `)
        : await tx.execute(sql`
            UPDATE users
            SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}
            WHERE officer_id = ${String(svId)} AND role = 'supervisor'
            RETURNING id
          `);

      if (userUpdate.rows.length !== 1) {
        throw new Error(`Expected 1 users row for supervisor ${svId}, got ${userUpdate.rows.length}`);
      }
    });

    res.json({ id: svId, name: newName, phone: newPhone });
  } catch (err) {
    logger.error({ err }, "Error updating supervisor credentials via EE");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/community-mobiliser/reports ──────────────────────────────────────
// Read-only: active Udupi reports within the CM's assigned ward.
// No PII (no reporter email/IP). Guarded by requireCommunityMobiliser.
router.get("/community-mobiliser/reports", requireCommunityMobiliser, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const wasteTypeFilter = typeof req.query.wasteType === "string" ? req.query.wasteType : undefined;
  try {
    if (!user.officerId) { res.status(404).json({ error: "CM profile not found" }); return; }

    // Look up CM's ward and find its polygon ring
    const profRow = await db.execute(sql`
      SELECT ward_number FROM community_mobilisers WHERE id = ${Number(user.officerId)} LIMIT 1
    `);
    if (!profRow.rows.length) { res.json({ reports: [], total: 0 }); return; }
    const wardNumber = (profRow.rows[0] as any).ward_number as number;
    const geoWardName = `Udupi Ward ${wardNumber}`;
    const wardEntry = udupiWardRings.find(w => w.name === geoWardName);
    if (!wardEntry) { res.json({ reports: [], total: 0, geoWardName }); return; }

    const { minLat, maxLat, minLng, maxLng } = ringsBbox([wardEntry]);

    // Build optional SQL filters for status / waste type
    let extraWhere = sql``;
    if (statusFilter) extraWhere = sql`${extraWhere} AND r.status = ${statusFilter}`;
    if (wasteTypeFilter) extraWhere = sql`${extraWhere} AND r.waste_types @> ${JSON.stringify([wasteTypeFilter])}::jsonb`;

    const rawRows = await db.execute(sql`
      SELECT
        r.id, r.status, r.address, r.description, r.latitude, r.longitude,
        r.image_url AS "imageUrl", r.image_urls AS "imageUrls",
        r.cleanup_image_url AS "cleanupImageUrl",
        r.waste_types AS "wasteTypes", r.waste_severity AS "wasteSeverity",
        r.brand_names AS "brandNames",
        r.created_at AS "createdAt"
      FROM reports r
      WHERE r.deleted_at IS NULL
        AND r.latitude  BETWEEN ${minLat} AND ${maxLat}
        AND r.longitude BETWEEN ${minLng} AND ${maxLng}
        ${extraWhere}
      ORDER BY r.created_at DESC
    `);

    const reports = (rawRows.rows as any[])
      .filter(r => pip(Number(r.latitude), Number(r.longitude), wardEntry.ring))
      .map(r => ({ ...r, wardName: geoWardName, panchayatName: "Udupi" }));

    res.json({ reports, total: reports.length });
  } catch (err) {
    logger.error({ err }, "Error fetching community mobiliser reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/commissioner/all-officers ────────────────────────────────────────
// Returns all non-deleted officers across every panchayat with report counts.
// Used by the control-center Officer Zones view to show grouped sections.
router.get("/commissioner/all-officers", requireCommissioner, async (req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT
        o.id, o.name, o.email, o.phone,
        o.area_name  AS "areaName",
        o.panchayat_name AS "panchayatName",
        o.created_at AS "createdAt",
        COUNT(r.id)::int AS "reportCount",
        COUNT(r.id) FILTER (WHERE r.status != 'cleaned')::int AS "pendingCount"
      FROM officers o
      LEFT JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
      WHERE o.deleted_at IS NULL
      GROUP BY o.id, o.name, o.email, o.phone, o.area_name, o.panchayat_name, o.created_at
      ORDER BY o.panchayat_name, o.created_at
    `);
    const officers = rows.rows as any[];
    res.json({ officers, total: officers.length });
  } catch (err) {
    logger.error({ err }, "Error fetching all officers for commissioner");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/commissioner/hierarchy ───────────────────────────────────────────
// Full org tree for the commissioner's Team tab: EE → HIs → Supervisors with counts.
router.get("/commissioner/hierarchy", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const panchayat = user.panchayatName ?? "Udupi";
  try {
    // Resolve EE for this panchayat
    const eeRows = await db.execute(sql`
      SELECT ee.id, ee.name, ee.phone,
             COUNT(DISTINCT hi.id)::int AS "hiCount"
      FROM environmental_engineers ee
      LEFT JOIN health_inspectors hi ON hi.environmental_engineer_id = ee.id
      WHERE ee.panchayat_name = ${panchayat}
      GROUP BY ee.id, ee.name, ee.phone
      LIMIT 1
    `);
    if (!eeRows.rows.length) { res.json({ environmentalEngineer: null }); return; }
    const ee = eeRows.rows[0] as any;

    // Load HI list (supervisor count only — no officer join)
    const hiRows = await db.execute(sql`
      SELECT hi.id, hi.name, hi.phone,
             COUNT(DISTINCT sv.id)::int AS "supervisorCount"
      FROM health_inspectors hi
      LEFT JOIN supervisors sv ON sv.health_inspector_id = hi.id
      WHERE hi.environmental_engineer_id = ${ee.id}
      GROUP BY hi.id, hi.name, hi.phone
      ORDER BY hi.name
    `);
    const hiList = hiRows.rows as { id: number; name: string; phone: string; supervisorCount: number }[];

    // Load all supervisors for these HIs in one query
    // (sql.raw is safe — hiIds are integer PKs from our own DB, not user input)
    const hiIds = hiList.map(h => h.id);
    const svRows = hiIds.length ? await db.execute(sql`
      SELECT id, name, phone, ward_names AS "wardNames", health_inspector_id AS "hiId"
      FROM supervisors
      WHERE health_inspector_id IN (${sql.raw(hiIds.join(','))})
      ORDER BY name
    `) : { rows: [] };
    const svList = svRows.rows as { id: number; name: string; phone: string; wardNames: string[]; hiId: number }[];

    // Build ring → {hiId, svId} index for PiP aggregation
    const wardEntries: { ring: [number, number][]; hiId: number; svId: number }[] = [];
    for (const sv of svList) {
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, hiId: sv.hiId, svId: sv.id });
      }
    }

    // Zero-initialise counts
    type Counts = { reportedCount: number; cleaningCount: number; cleanedCount: number; totalCount: number };
    const hiCounts = new Map<number, Counts>();
    const svCounts = new Map<number, Counts>();
    for (const hi of hiList) hiCounts.set(hi.id, { reportedCount: 0, cleaningCount: 0, cleanedCount: 0, totalCount: 0 });
    for (const sv of svList) svCounts.set(sv.id, { reportedCount: 0, cleaningCount: 0, cleanedCount: 0, totalCount: 0 });

    if (wardEntries.length) {
      const { minLat, maxLat, minLng, maxLng } = ringsBbox(wardEntries.map(e => ({ ring: e.ring })));
      const rawRows = await db.execute(sql`
        SELECT latitude, longitude, status FROM reports
        WHERE deleted_at IS NULL
          AND latitude  BETWEEN ${minLat} AND ${maxLat}
          AND longitude BETWEEN ${minLng} AND ${maxLng}
      `);
      const bump = (c: Counts, s: string) => {
        if (s === "reported") c.reportedCount++;
        else if (s === "cleaning") c.cleaningCount++;
        else if (s === "cleaned") c.cleanedCount++;
        c.totalCount++;
      };
      for (const r of rawRows.rows as any[]) {
        const lat = Number(r.latitude), lng = Number(r.longitude);
        const match = wardEntries.find(e => pip(lat, lng, e.ring));
        if (!match) continue;
        bump(hiCounts.get(match.hiId)!, r.status);
        bump(svCounts.get(match.svId)!, r.status);
      }
    }

    // Assemble response — same shape the frontend expects
    const healthInspectors = hiList.map(hi => ({
      ...hi,
      ...hiCounts.get(hi.id)!,
      supervisors: svList
        .filter(sv => sv.hiId === hi.id)
        .map(sv => ({ id: sv.id, name: sv.name, phone: sv.phone, wardNames: sv.wardNames, ...svCounts.get(sv.id)! })),
    }));

    res.json({ environmentalEngineer: { ...ee, healthInspectors } });
  } catch (err) {
    logger.error({ err }, "Error fetching commissioner hierarchy");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/commissioner/env-engineer/:id/credentials ─────────────────────
// Commissioner can update name/phone/password for the EE in their panchayat.
router.patch("/commissioner/env-engineer/:id/credentials", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const panchayat = user.panchayatName ?? "Udupi";

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const eeId = parseInt(rawId, 10);
  if (isNaN(eeId)) { res.status(400).json({ error: "Invalid EE ID" }); return; }

  const { name, phone, password } = req.body ?? {};

  try {
    const eeCheck = await db.execute(sql`
      SELECT id, name, phone FROM environmental_engineers
      WHERE id = ${eeId} AND panchayat_name = ${panchayat}
      LIMIT 1
    `);
    if (!eeCheck.rows.length) {
      res.status(403).json({ error: "Environmental engineer not in your panchayat" });
      return;
    }
    const existing = eeCheck.rows[0] as any;

    const newName = (name as string)?.trim() || existing.name;
    const newPhone = (phone as string)?.trim() || existing.phone;
    const newEmail = `${newPhone}@phone.local`;

    if (newPhone !== existing.phone) {
      const conflict = await db.execute(sql`
        SELECT id FROM users
        WHERE (phone = ${newPhone} OR email = ${newEmail})
          AND NOT (officer_id = ${String(eeId)} AND role = 'environmental_engineer')
        LIMIT 1
      `);
      if (conflict.rows.length) {
        res.status(409).json({ error: "Phone number is already in use by another account" });
        return;
      }
    }

    const newHash = (password as string)?.trim() ? await hashPassword((password as string).trim()) : null;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE environmental_engineers SET name = ${newName}, phone = ${newPhone}
        WHERE id = ${eeId}
      `);
      const userUpdate = newHash
        ? await tx.execute(sql`
            UPDATE users SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}, password_hash = ${newHash}
            WHERE officer_id = ${String(eeId)} AND role = 'environmental_engineer'
            RETURNING id
          `)
        : await tx.execute(sql`
            UPDATE users SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}
            WHERE officer_id = ${String(eeId)} AND role = 'environmental_engineer'
            RETURNING id
          `);
      if (userUpdate.rows.length !== 1) {
        throw new Error(`Expected 1 users row for EE ${eeId}, got ${userUpdate.rows.length}`);
      }
    });

    res.json({ id: eeId, name: newName, phone: newPhone });
  } catch (err) {
    logger.error({ err }, "Error updating EE credentials via commissioner");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/commissioner/health-inspector/:id/credentials ──────────────────
// Commissioner can update credentials for any HI under their panchayat's EE.
router.patch("/commissioner/health-inspector/:id/credentials", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const panchayat = user.panchayatName ?? "Udupi";

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const hiId = parseInt(rawId, 10);
  if (isNaN(hiId)) { res.status(400).json({ error: "Invalid HI ID" }); return; }

  const { name, phone, password } = req.body ?? {};

  try {
    // Verify HI → EE → panchayat chain
    const hiCheck = await db.execute(sql`
      SELECT hi.id, hi.name, hi.phone FROM health_inspectors hi
      JOIN environmental_engineers ee ON ee.id = hi.environmental_engineer_id
      WHERE hi.id = ${hiId} AND ee.panchayat_name = ${panchayat}
      LIMIT 1
    `);
    if (!hiCheck.rows.length) {
      res.status(403).json({ error: "Health inspector not in your panchayat" });
      return;
    }
    const existing = hiCheck.rows[0] as any;

    const newName = (name as string)?.trim() || existing.name;
    const newPhone = (phone as string)?.trim() || existing.phone;
    const newEmail = `${newPhone}@phone.local`;

    if (newPhone !== existing.phone) {
      const conflict = await db.execute(sql`
        SELECT id FROM users
        WHERE (phone = ${newPhone} OR email = ${newEmail})
          AND NOT (officer_id = ${String(hiId)} AND role = 'health_inspector')
        LIMIT 1
      `);
      if (conflict.rows.length) {
        res.status(409).json({ error: "Phone number is already in use by another account" });
        return;
      }
    }

    const newHash = (password as string)?.trim() ? await hashPassword((password as string).trim()) : null;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE health_inspectors SET name = ${newName}, phone = ${newPhone}
        WHERE id = ${hiId}
      `);
      const userUpdate = newHash
        ? await tx.execute(sql`
            UPDATE users SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}, password_hash = ${newHash}
            WHERE officer_id = ${String(hiId)} AND role = 'health_inspector'
            RETURNING id
          `)
        : await tx.execute(sql`
            UPDATE users SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}
            WHERE officer_id = ${String(hiId)} AND role = 'health_inspector'
            RETURNING id
          `);
      if (userUpdate.rows.length !== 1) {
        throw new Error(`Expected 1 users row for HI ${hiId}, got ${userUpdate.rows.length}`);
      }
    });

    res.json({ id: hiId, name: newName, phone: newPhone });
  } catch (err) {
    logger.error({ err }, "Error updating HI credentials via commissioner");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/commissioner/supervisor/:id/credentials ────────────────────────
// Commissioner can update credentials for any supervisor under their panchayat's EE.
router.patch("/commissioner/supervisor/:id/credentials", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const panchayat = user.panchayatName ?? "Udupi";

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const svId = parseInt(rawId, 10);
  if (isNaN(svId)) { res.status(400).json({ error: "Invalid supervisor ID" }); return; }

  const { name, phone, password } = req.body ?? {};

  try {
    // Verify supervisor → HI → EE → panchayat chain
    const svCheck = await db.execute(sql`
      SELECT sv.id, sv.name, sv.phone FROM supervisors sv
      JOIN health_inspectors hi ON hi.id = sv.health_inspector_id
      JOIN environmental_engineers ee ON ee.id = hi.environmental_engineer_id
      WHERE sv.id = ${svId} AND ee.panchayat_name = ${panchayat}
      LIMIT 1
    `);
    if (!svCheck.rows.length) {
      res.status(403).json({ error: "Supervisor not in your panchayat" });
      return;
    }
    const existing = svCheck.rows[0] as any;

    const newName = (name as string)?.trim() || existing.name;
    const newPhone = (phone as string)?.trim() || existing.phone;
    const newEmail = `${newPhone}@phone.local`;

    if (newPhone !== existing.phone) {
      const conflict = await db.execute(sql`
        SELECT id FROM users
        WHERE (phone = ${newPhone} OR email = ${newEmail})
          AND NOT (officer_id = ${String(svId)} AND role = 'supervisor')
        LIMIT 1
      `);
      if (conflict.rows.length) {
        res.status(409).json({ error: "Phone number is already in use by another account" });
        return;
      }
    }

    const newHash = (password as string)?.trim() ? await hashPassword((password as string).trim()) : null;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE supervisors SET name = ${newName}, phone = ${newPhone}
        WHERE id = ${svId}
      `);
      const userUpdate = newHash
        ? await tx.execute(sql`
            UPDATE users SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}, password_hash = ${newHash}
            WHERE officer_id = ${String(svId)} AND role = 'supervisor'
            RETURNING id
          `)
        : await tx.execute(sql`
            UPDATE users SET name = ${newName}, phone = ${newPhone}, email = ${newEmail}
            WHERE officer_id = ${String(svId)} AND role = 'supervisor'
            RETURNING id
          `);
      if (userUpdate.rows.length !== 1) {
        throw new Error(`Expected 1 users row for supervisor ${svId}, got ${userUpdate.rows.length}`);
      }
    });

    res.json({ id: svId, name: newName, phone: newPhone });
  } catch (err) {
    logger.error({ err }, "Error updating supervisor credentials via commissioner");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAP-REPORT ENDPOINTS
// Return lat/lng + role-contextual fields for the dashboard maps.
// All use geographic PiP filtering (Udupi reports are not officer-assigned).
// Ward name format returned: "Udupi Ward N" to match geofences.json polygons.
//
// Correctness invariants:
//  1. Bounding-box WHERE clause is derived from the role's specific ward ring set,
//     NOT the full udupiBox — this avoids the over-broad LIMIT cutoff bug where
//     a global "LIMIT 500" could exclude in-scope reports that sit past the cutoff.
//  2. No row-level LIMIT is applied. PiP is the authoritative scope filter; the
//     tight bbox means only geometrically adjacent reports reach the app layer.
//  3. Commissioner endpoint uses only the rings assigned to the commissioner's
//     panchayat — it never falls back to all udupiWardRings — preventing
//     cross-panchayat report-location disclosure.
// ─────────────────────────────────────────────────────────────────────────────

/** Compute a tight bounding box from a set of ward rings. */
function ringsBbox(rings: { ring: [number, number][] }[]): {
  minLat: number; maxLat: number; minLng: number; maxLng: number;
} {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const { ring } of rings) {
    for (const [lng, lat] of ring) {  // GeoJSON order: [longitude, latitude]
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Shared helper: bbox SQL query + PiP filter for a set of ward entries.
 *
 * Each entry carries the ward polygon ring plus metadata fields that are
 * merged into every matching report row:
 *   - wardName    — always present
 *   - svName      — supervisor name, returned as `supervisorName`
 *   - hiName      — health inspector name, returned as `hiName` (omitted when undefined)
 *
 * Using a single function here means the PiP logic and bbox calculation only
 * live in one place. A bug fix or invariant change (e.g. adding `archived`
 * status support) only needs to happen here, not in three separate endpoints.
 */
async function fetchReportsInWardEntries(
  wardEntries: { ring: [number, number][]; wardName: string; svName: string; hiName?: string }[],
  options: { statusFilter?: string; wardFilter?: string },
): Promise<any[]> {
  if (!wardEntries.length) return [];
  const { statusFilter, wardFilter } = options;
  const { minLat, maxLat, minLng, maxLng } = ringsBbox(wardEntries.map(e => ({ ring: e.ring })));
  const rawRows = await db.execute(
    statusFilter
      ? sql`
          SELECT r.id, r.status, r.address, r.latitude, r.longitude,
                 r.image_url AS "imageUrl", r.image_urls AS "imageUrls",
                 r.created_at AS "createdAt",
                 r.cleaning_started_at AS "cleaningStartedAt",
                 r.cleaned_at AS "cleanedAt"
          FROM reports r
          WHERE r.deleted_at IS NULL
            AND r.status = ${statusFilter}
            AND r.latitude  BETWEEN ${minLat} AND ${maxLat}
            AND r.longitude BETWEEN ${minLng} AND ${maxLng}
          ORDER BY r.created_at DESC`
      : sql`
          SELECT r.id, r.status, r.address, r.latitude, r.longitude,
                 r.image_url AS "imageUrl", r.image_urls AS "imageUrls",
                 r.created_at AS "createdAt",
                 r.cleaning_started_at AS "cleaningStartedAt",
                 r.cleaned_at AS "cleanedAt"
          FROM reports r
          WHERE r.deleted_at IS NULL
            AND r.latitude  BETWEEN ${minLat} AND ${maxLat}
            AND r.longitude BETWEEN ${minLng} AND ${maxLng}
          ORDER BY r.created_at DESC`
  );
  return (rawRows.rows as any[]).flatMap(r => {
    const match = wardEntries.find(e => pip(Number(r.latitude), Number(r.longitude), e.ring));
    if (!match) return [];
    if (wardFilter && match.wardName !== wardFilter) return [];
    return [{
      ...r,
      wardName: match.wardName,
      supervisorName: match.svName,
      ...(match.hiName !== undefined ? { hiName: match.hiName } : {}),
    }];
  });
}

// ── GET /api/community-mobiliser/map-reports ──────────────────────────────────
router.get("/community-mobiliser/map-reports", requireCommunityMobiliser, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(404).json({ error: "Profile not found" }); return; }
  try {
    const profRow = await db.execute(sql`
      SELECT ward_number FROM community_mobilisers WHERE id = ${Number(user.officerId)} LIMIT 1
    `);
    if (!profRow.rows.length) { res.status(404).json({ error: "Profile not found" }); return; }
    const wardNumber = (profRow.rows[0] as any).ward_number as number;
    const geoWardName = `Udupi Ward ${wardNumber}`;
    const wardEntry = udupiWardRings.find(w => w.name === geoWardName);
    if (!wardEntry) { res.json({ reports: [], geoWardName }); return; }

    // Tight bbox scoped to this mobiliser's single ward — no global cutoff
    const { minLat, maxLat, minLng, maxLng } = ringsBbox([wardEntry]);
    const rawRows = await db.execute(sql`
      SELECT id, latitude, longitude, status,
             image_url AS "imageUrl", image_urls AS "imageUrls",
             waste_types AS "wasteTypes", waste_severity AS "wasteSeverity",
             created_at AS "createdAt"
      FROM reports
      WHERE deleted_at IS NULL
        AND latitude  BETWEEN ${minLat} AND ${maxLat}
        AND longitude BETWEEN ${minLng} AND ${maxLng}
      ORDER BY created_at DESC
    `);
    const reports = (rawRows.rows as any[])
      .filter(r => pip(Number(r.latitude), Number(r.longitude), wardEntry.ring))
      .map(r => ({ ...r, wardName: geoWardName }));
    res.json({ reports, geoWardName });
  } catch (err) {
    logger.error({ err }, "Error fetching community mobiliser map reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/supervisor/map-reports ───────────────────────────────────────────
router.get("/supervisor/map-reports", requireSupervisor, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(404).json({ error: "Profile not found" }); return; }
  try {
    const profRow = await db.execute(sql`
      SELECT ward_names FROM supervisors WHERE id = ${Number(user.officerId)} LIMIT 1
    `);
    if (!profRow.rows.length) { res.status(404).json({ error: "Profile not found" }); return; }
    const wardNames: string[] = (profRow.rows[0] as any).ward_names as string[];

    // Convert "Ward N/Town" → "Udupi Ward N", gather rings
    const rings: { name: string; ring: [number, number][] }[] = [];
    for (const wn of wardNames) {
      const m = wn.match(/^Ward (\d+)/);
      if (!m) continue;
      const geoName = `Udupi Ward ${m[1]}`;
      const entry = udupiWardRings.find(w => w.name === geoName);
      if (entry) rings.push(entry);
    }
    if (!rings.length) { res.json({ reports: [] }); return; }

    // Tight bbox scoped to supervisor's own wards — no global cutoff
    const { minLat, maxLat, minLng, maxLng } = ringsBbox(rings);
    const rawRows = await db.execute(sql`
      SELECT id, latitude, longitude, status,
             image_url AS "imageUrl", image_urls AS "imageUrls",
             waste_types AS "wasteTypes", created_at AS "createdAt"
      FROM reports
      WHERE deleted_at IS NULL
        AND latitude  BETWEEN ${minLat} AND ${maxLat}
        AND longitude BETWEEN ${minLng} AND ${maxLng}
      ORDER BY created_at DESC
    `);
    const reports = (rawRows.rows as any[]).flatMap(r => {
      const match = rings.find(ring => pip(Number(r.latitude), Number(r.longitude), ring.ring));
      if (!match) return [];
      return [{ ...r, wardName: match.name }];
    });
    res.json({ reports });
  } catch (err) {
    logger.error({ err }, "Error fetching supervisor map reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/health-inspector/map-reports ─────────────────────────────────────
router.get("/health-inspector/map-reports", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(404).json({ error: "Profile not found" }); return; }
  try {
    const svRows = await db.execute(sql`
      SELECT id, name, ward_names FROM supervisors
      WHERE health_inspector_id = ${Number(user.officerId)}
    `);

    const wardToSv = new Map<string, { id: number; name: string }>();
    for (const sv of svRows.rows as any[]) {
      for (const wn of (sv.ward_names as string[] ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        wardToSv.set(`Udupi Ward ${m[1]}`, { id: sv.id as number, name: sv.name as string });
      }
    }
    if (!wardToSv.size) { res.json({ reports: [] }); return; }

    // Tight bbox scoped to this HI's wards only — no global cutoff
    const relevantRings = udupiWardRings.filter(w => wardToSv.has(w.name));
    const { minLat, maxLat, minLng, maxLng } = ringsBbox(relevantRings);
    const rawRows = await db.execute(sql`
      SELECT id, latitude, longitude, status,
             image_url AS "imageUrl", image_urls AS "imageUrls",
             waste_types AS "wasteTypes", created_at AS "createdAt"
      FROM reports
      WHERE deleted_at IS NULL
        AND latitude  BETWEEN ${minLat} AND ${maxLat}
        AND longitude BETWEEN ${minLng} AND ${maxLng}
      ORDER BY created_at DESC
    `);
    const reports = (rawRows.rows as any[]).flatMap(r => {
      const match = relevantRings.find(ring => pip(Number(r.latitude), Number(r.longitude), ring.ring));
      if (!match) return [];
      const sv = wardToSv.get(match.name)!;
      return [{ ...r, wardName: match.name, supervisorId: sv.id, supervisorName: sv.name }];
    });
    res.json({ reports });
  } catch (err) {
    logger.error({ err }, "Error fetching health inspector map reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/env-engineer/map-reports ─────────────────────────────────────────
router.get("/env-engineer/map-reports", requireEnvEngineer, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(404).json({ error: "Profile not found" }); return; }
  try {
    const svRows = await db.execute(sql`
      SELECT sv.id AS sv_id, sv.name AS sv_name, sv.ward_names,
             hi.id AS hi_id, hi.name AS hi_name
      FROM supervisors sv
      JOIN health_inspectors hi ON hi.id = sv.health_inspector_id
      WHERE hi.environmental_engineer_id = ${Number(user.officerId)}
    `);

    const wardToCtx = new Map<string, { svId: number; svName: string; hiId: number; hiName: string }>();
    for (const row of svRows.rows as any[]) {
      for (const wn of (row.ward_names as string[] ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        wardToCtx.set(`Udupi Ward ${m[1]}`, {
          svId: row.sv_id as number, svName: row.sv_name as string,
          hiId: row.hi_id as number, hiName: row.hi_name as string,
        });
      }
    }
    if (!wardToCtx.size) { res.json({ reports: [] }); return; }

    // Tight bbox scoped to this EE's wards only — no global cutoff
    const relevantRings = udupiWardRings.filter(w => wardToCtx.has(w.name));
    const { minLat, maxLat, minLng, maxLng } = ringsBbox(relevantRings);
    const rawRows = await db.execute(sql`
      SELECT id, latitude, longitude, status,
             image_url AS "imageUrl", image_urls AS "imageUrls",
             waste_types AS "wasteTypes", created_at AS "createdAt"
      FROM reports
      WHERE deleted_at IS NULL
        AND latitude  BETWEEN ${minLat} AND ${maxLat}
        AND longitude BETWEEN ${minLng} AND ${maxLng}
      ORDER BY created_at DESC
    `);
    const reports = (rawRows.rows as any[]).flatMap(r => {
      const match = relevantRings.find(ring => pip(Number(r.latitude), Number(r.longitude), ring.ring));
      if (!match) return [];
      const ctx = wardToCtx.get(match.name)!;
      return [{
        ...r, wardName: match.name,
        supervisorId: ctx.svId, supervisorName: ctx.svName,
        healthInspectorId: ctx.hiId, healthInspectorName: ctx.hiName,
      }];
    });
    res.json({ reports });
  } catch (err) {
    logger.error({ err }, "Error fetching env engineer map reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/commissioner/map-reports ─────────────────────────────────────────
router.get("/commissioner/map-reports", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const panchayat = user.panchayatName ?? "Udupi";
  try {
    const svRows = await db.execute(sql`
      SELECT sv.id AS sv_id, sv.name AS sv_name, sv.ward_names,
             hi.id AS hi_id, hi.name AS hi_name
      FROM supervisors sv
      JOIN health_inspectors hi ON hi.id = sv.health_inspector_id
      JOIN environmental_engineers ee ON ee.id = hi.environmental_engineer_id
      WHERE ee.panchayat_name = ${panchayat}
    `);

    const wardToCtx = new Map<string, { svId: number; svName: string; hiId: number; hiName: string }>();
    for (const row of svRows.rows as any[]) {
      for (const wn of (row.ward_names as string[] ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        wardToCtx.set(`Udupi Ward ${m[1]}`, {
          svId: row.sv_id as number, svName: row.sv_name as string,
          hiId: row.hi_id as number, hiName: row.hi_name as string,
        });
      }
    }

    // Scope rings strictly to wards assigned to THIS commissioner's panchayat.
    // Never fall back to all udupiWardRings — that would expose other panchayats.
    const relevantRings = udupiWardRings.filter(w => wardToCtx.has(w.name));
    if (!relevantRings.length) { res.json({ reports: [] }); return; }

    // Tight bbox derived from the panchayat's own ward set — no global cutoff
    const { minLat, maxLat, minLng, maxLng } = ringsBbox(relevantRings);
    const rawRows = await db.execute(sql`
      SELECT id, latitude, longitude, status,
             image_url AS "imageUrl", image_urls AS "imageUrls",
             waste_types AS "wasteTypes", created_at AS "createdAt"
      FROM reports
      WHERE deleted_at IS NULL
        AND latitude  BETWEEN ${minLat} AND ${maxLat}
        AND longitude BETWEEN ${minLng} AND ${maxLng}
      ORDER BY created_at DESC
    `);
    const reports = (rawRows.rows as any[]).flatMap(r => {
      // PiP against only the assigned rings — never leaks other-panchayat coordinates
      const match = relevantRings.find(ring => pip(Number(r.latitude), Number(r.longitude), ring.ring));
      if (!match) return [];
      const ctx = wardToCtx.get(match.name);
      return [{
        ...r, wardName: match.name,
        supervisorId:        ctx?.svId   ?? null,
        supervisorName:      ctx?.svName ?? null,
        healthInspectorId:   ctx?.hiId   ?? null,
        healthInspectorName: ctx?.hiName ?? null,
      }];
    });
    res.json({ reports });
  } catch (err) {
    logger.error({ err }, "Error fetching commissioner map reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/health-inspector/reports ─────────────────────────────────────────
// Flat list of all reports under this HI's supervisor wards.
// Optional ?status=reported|cleaning|cleaned filter.
// Optional ?wardName=<geo-name> filter (e.g. "Udupi Ward 5").
// Optional ?supervisorName=<string> filter — restrict to a single supervisor by name.
router.get("/health-inspector/reports", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No HI profile" }); return; }
  const statusFilter = req.query.status as string | undefined;
  if (statusFilter && !["reported", "cleaning", "cleaned"].includes(statusFilter)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const wardFilter = typeof req.query.wardName === "string" ? req.query.wardName.trim() : undefined;
  const supervisorNameFilter = typeof req.query.supervisorName === "string" ? req.query.supervisorName.trim() : undefined;
  try {
    const svRows = await db.execute(sql`
      SELECT id, name, ward_names AS "wardNames"
      FROM supervisors WHERE health_inspector_id = ${Number(user.officerId)}
    `);
    let svList = svRows.rows as { id: number; name: string; wardNames: string[] }[];
    if (!svList.length) { res.json({ reports: [], total: 0 }); return; }

    // Apply supervisor name filter if provided (case-insensitive match)
    if (supervisorNameFilter) {
      const lower = supervisorNameFilter.toLowerCase();
      svList = svList.filter(sv => sv.name.toLowerCase() === lower);
      if (!svList.length) { res.json({ reports: [], total: 0 }); return; }
    }

    const wardEntries: { ring: [number, number][]; wardName: string; svName: string }[] = [];
    for (const sv of svList) {
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, wardName: entry.name, svName: sv.name });
      }
    }
    if (!wardEntries.length) { res.json({ reports: [], total: 0 }); return; }

    const reports = await fetchReportsInWardEntries(wardEntries, { statusFilter, wardFilter });
    res.json({ reports, total: reports.length });
  } catch (err) {
    logger.error({ err }, "Error fetching HI flat reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/env-engineer/reports ─────────────────────────────────────────────
// Flat list of all reports under this EE's HIs + supervisors.
// Optional ?status=reported|cleaning|cleaned filter.
// Optional ?wardName=<geo-name> filter (e.g. "Udupi Ward 5").
// Optional ?hiId=<int> — restrict to one health inspector's supervisors.
// Optional ?supervisorId=<int> — restrict to a single supervisor's wards.
router.get("/env-engineer/reports", requireEnvEngineer, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No EE profile" }); return; }
  const statusFilter = req.query.status as string | undefined;
  if (statusFilter && !["reported", "cleaning", "cleaned"].includes(statusFilter)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const wardFilter = typeof req.query.wardName === "string" ? req.query.wardName.trim() : undefined;
  const hiIdFilter = typeof req.query.hiId === "string" ? parseInt(req.query.hiId, 10) : undefined;
  const svIdFilter = typeof req.query.supervisorId === "string" ? parseInt(req.query.supervisorId, 10) : undefined;
  try {
    const hiRows = await db.execute(sql`
      SELECT id, name FROM health_inspectors
      WHERE environmental_engineer_id = ${Number(user.officerId)}
    `);
    const hiList = hiRows.rows as { id: number; name: string }[];
    if (!hiList.length) { res.json({ reports: [], total: 0 }); return; }

    const hiIds = hiList.map(h => h.id);
    const hiNameById = new Map(hiList.map(h => [h.id, h.name]));

    const svRows = await db.execute(sql`
      SELECT id, name, health_inspector_id AS "hiId", ward_names AS "wardNames"
      FROM supervisors WHERE health_inspector_id IN (${sql.raw(hiIds.join(','))})
    `);
    let svList = svRows.rows as { id: number; name: string; hiId: number; wardNames: string[] }[];
    if (!svList.length) { res.json({ reports: [], total: 0 }); return; }

    // Apply entity scope filters (already verified safe — svList is scoped to this EE)
    if (hiIdFilter !== undefined && !isNaN(hiIdFilter)) svList = svList.filter(sv => sv.hiId === hiIdFilter);
    if (svIdFilter !== undefined && !isNaN(svIdFilter)) svList = svList.filter(sv => sv.id === svIdFilter);
    if (!svList.length) { res.json({ reports: [], total: 0 }); return; }

    const wardEntries: { ring: [number, number][]; wardName: string; svName: string; hiName: string }[] = [];
    for (const sv of svList) {
      const hiName = hiNameById.get(sv.hiId) ?? "";
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, wardName: entry.name, svName: sv.name, hiName });
      }
    }
    if (!wardEntries.length) { res.json({ reports: [], total: 0 }); return; }

    const reports = await fetchReportsInWardEntries(wardEntries, { statusFilter, wardFilter });
    res.json({ reports, total: reports.length });
  } catch (err) {
    logger.error({ err }, "Error fetching EE flat reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/commissioner/reports ─────────────────────────────────────────────
// Flat list of all reports in the commissioner's panchayat.
// Optional ?status=reported|cleaning|cleaned filter.
// Optional ?wardName=<geo-name> filter (e.g. "Udupi Ward 5").
// Optional ?hiId=<int> — restrict to one health inspector's supervisors.
// Optional ?supervisorId=<int> — restrict to a single supervisor's wards.
router.get("/commissioner/reports", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const panchayat = user.panchayatName ?? "Udupi";
  const statusFilter = req.query.status as string | undefined;
  if (statusFilter && !["reported", "cleaning", "cleaned"].includes(statusFilter)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  const wardFilter = typeof req.query.wardName === "string" ? req.query.wardName.trim() : undefined;
  const hiIdFilter = typeof req.query.hiId === "string" ? parseInt(req.query.hiId, 10) : undefined;
  const svIdFilter = typeof req.query.supervisorId === "string" ? parseInt(req.query.supervisorId, 10) : undefined;
  try {
    // Resolve EE for this panchayat
    const eeRow = await db.execute(sql`
      SELECT id FROM environmental_engineers WHERE panchayat_name = ${panchayat} LIMIT 1
    `);
    if (!eeRow.rows.length) { res.json({ reports: [], total: 0 }); return; }
    const eeId = (eeRow.rows[0] as any).id as number;

    const hiRows = await db.execute(sql`
      SELECT id, name FROM health_inspectors WHERE environmental_engineer_id = ${eeId}
    `);
    const hiList = hiRows.rows as { id: number; name: string }[];
    if (!hiList.length) { res.json({ reports: [], total: 0 }); return; }

    const hiIds = hiList.map(h => h.id);
    const hiNameById = new Map(hiList.map(h => [h.id, h.name]));

    const svRows = await db.execute(sql`
      SELECT id, name, health_inspector_id AS "hiId", ward_names AS "wardNames"
      FROM supervisors WHERE health_inspector_id IN (${sql.raw(hiIds.join(','))})
    `);
    let svList = svRows.rows as { id: number; name: string; hiId: number; wardNames: string[] }[];
    if (!svList.length) { res.json({ reports: [], total: 0 }); return; }

    // Apply entity scope filters (already verified safe — svList is scoped to this panchayat)
    if (hiIdFilter !== undefined && !isNaN(hiIdFilter)) svList = svList.filter(sv => sv.hiId === hiIdFilter);
    if (svIdFilter !== undefined && !isNaN(svIdFilter)) svList = svList.filter(sv => sv.id === svIdFilter);
    if (!svList.length) { res.json({ reports: [], total: 0 }); return; }

    const wardEntries: { ring: [number, number][]; wardName: string; svName: string; hiName: string }[] = [];
    for (const sv of svList) {
      const hiName = hiNameById.get(sv.hiId) ?? "";
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, wardName: entry.name, svName: sv.name, hiName });
      }
    }
    if (!wardEntries.length) { res.json({ reports: [], total: 0 }); return; }

    const reports = await fetchReportsInWardEntries(wardEntries, { statusFilter, wardFilter });
    res.json({ reports, total: reports.length });
  } catch (err) {
    logger.error({ err }, "Error fetching commissioner flat reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Commissioner purge-test helpers & endpoints ───────────────────────────────

/**
 * Resolves all Udupi ward polygon rings reachable from the given panchayat's
 * EE → HI → supervisor hierarchy. Returns an empty array if any step is missing
 * (e.g. Saligrama, which has no Udupi ward rings).
 */
async function resolveCommissionerWardRings(panchayat: string): Promise<{ ring: [number, number][] }[]> {
  const eeRow = await db.execute(sql`
    SELECT id FROM environmental_engineers WHERE panchayat_name = ${panchayat} LIMIT 1
  `);
  if (!eeRow.rows.length) return [];
  const eeId = (eeRow.rows[0] as any).id as number;

  const hiRows = await db.execute(sql`
    SELECT id FROM health_inspectors WHERE environmental_engineer_id = ${eeId}
  `);
  const hiIds = (hiRows.rows as any[]).map(r => r.id as number);
  if (!hiIds.length) return [];

  const svRows = await db.execute(sql`
    SELECT ward_names FROM supervisors
    WHERE health_inspector_id IN (${sql.raw(hiIds.join(","))})
  `);
  const allWardNames = (svRows.rows as any[]).flatMap(r => (r.ward_names ?? []) as string[]);

  return allWardNames.flatMap(wn => {
    const m = wn.match(/^Ward (\d+)/);
    if (!m) return [];
    const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
    return entry ? [{ ring: entry.ring }] : [];
  });
}

// ── GET /api/commissioner/reports/purge-test/count ────────────────────────────
// Returns the count of non-archived reports currently in the commissioner's
// panchayat ward area. Used to populate the confirmation dialog before purging.
router.get("/commissioner/reports/purge-test/count", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const panchayat = user.panchayatName ?? "Udupi";
  try {
    const rings = await resolveCommissionerWardRings(panchayat);
    if (!rings.length) { res.json({ count: 0 }); return; }
    const { minLat, maxLat, minLng, maxLng } = ringsBbox(rings);
    const rawRows = await db.execute(sql`
      SELECT latitude, longitude FROM reports
      WHERE deleted_at IS NULL
        AND is_test = true
        AND latitude  BETWEEN ${minLat} AND ${maxLat}
        AND longitude BETWEEN ${minLng} AND ${maxLng}
    `);
    const count = (rawRows.rows as any[]).filter(r =>
      rings.some(e => pip(Number(r.latitude), Number(r.longitude), e.ring))
    ).length;
    res.json({ count });
  } catch (err) {
    logger.error({ err }, "Error counting purgeable reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/commissioner/reports/purge-test ───────────────────────────────
// Soft-deletes (archived) all non-archived reports in the commissioner's panchayat
// ward area. Returns the number of reports soft-deleted.
router.delete("/commissioner/reports/purge-test", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const panchayat = user.panchayatName ?? "Udupi";
  try {
    const rings = await resolveCommissionerWardRings(panchayat);
    if (!rings.length) { res.json({ deletedCount: 0 }); return; }
    const { minLat, maxLat, minLng, maxLng } = ringsBbox(rings);
    const rawRows = await db.execute(sql`
      SELECT id, latitude, longitude FROM reports
      WHERE deleted_at IS NULL
        AND is_test = true
        AND latitude  BETWEEN ${minLat} AND ${maxLat}
        AND longitude BETWEEN ${minLng} AND ${maxLng}
    `);
    const ids = (rawRows.rows as any[])
      .filter(r => rings.some(e => pip(Number(r.latitude), Number(r.longitude), e.ring)))
      .map(r => r.id as number);
    if (!ids.length) { res.json({ deletedCount: 0 }); return; }
    await db.execute(sql`
      UPDATE reports SET deleted_at = NOW(), updated_at = NOW()
      WHERE id IN (${sql.raw(ids.join(","))})
    `);
    logger.info({ count: ids.length, panchayat }, "Commissioner purged test reports");
    res.json({ deletedCount: ids.length });
  } catch (err) {
    logger.error({ err }, "Error purging test reports");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Shared analytics helpers ───────────────────────────────────────────────────

function buildDailyTrend(reports: any[], days = 30) {
  const trend: Record<string, { date: string; reported: number; cleaning: number; cleaned: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0];
    trend[key] = { date: key, reported: 0, cleaning: 0, cleaned: 0 };
  }
  for (const r of reports) {
    if (r.createdAt) {
      const k = new Date(r.createdAt).toISOString().split("T")[0];
      if (trend[k]) trend[k].reported++;
    }
    if (r.cleaningStartedAt) {
      const k = new Date(r.cleaningStartedAt).toISOString().split("T")[0];
      if (trend[k]) trend[k].cleaning++;
    }
    if (r.cleanedAt) {
      const k = new Date(r.cleanedAt).toISOString().split("T")[0];
      if (trend[k]) trend[k].cleaned++;
    }
  }
  return Object.values(trend);
}

function buildWardBacklog(reports: any[]) {
  const map: Record<string, number> = {};
  for (const r of reports) {
    if (r.status === "reported" && r.wardName) {
      map[r.wardName] = (map[r.wardName] ?? 0) + 1;
    }
  }
  return Object.entries(map)
    .map(([wardName, open]) => ({ wardName: wardName.replace("Udupi Ward ", "W"), open }))
    .sort((a, b) => b.open - a.open)
    .slice(0, 15);
}

function computeAvgCleanupHrs(reports: any[]) {
  const cleaned = reports.filter(r => r.cleanedAt && r.createdAt);
  if (!cleaned.length) return 0;
  const sum = cleaned.reduce((s, r) =>
    s + (new Date(r.cleanedAt).getTime() - new Date(r.createdAt).getTime()) / 3_600_000, 0);
  return Math.round((sum / cleaned.length) * 10) / 10;
}

function computeSlaHrs(reports: any[]) {
  // Phase 1: Reported → Cleaning started
  const startedReports = reports.filter(r => r.cleaningStartedAt && r.createdAt);
  const reportedToCleaning = startedReports.length > 0
    ? Math.round(startedReports.reduce((s, r) =>
        s + (new Date(r.cleaningStartedAt).getTime() - new Date(r.createdAt).getTime()) / 3_600_000, 0)
      / startedReports.length * 10) / 10
    : 0;
  // Phase 2: Cleaning started → Cleaned
  const cleanedReports = reports.filter(r => r.cleanedAt && r.cleaningStartedAt);
  const cleaningToCleaned = cleanedReports.length > 0
    ? Math.round(cleanedReports.reduce((s, r) =>
        s + (new Date(r.cleanedAt).getTime() - new Date(r.cleaningStartedAt).getTime()) / 3_600_000, 0)
      / cleanedReports.length * 10) / 10
    : 0;
  return { reportedToCleaning, cleaningToCleaned };
}

type PerfEntry = { name: string; open: number; cleaning: number; cleaned: number; total: number; cleanedHrs: number };

function groupByKey(reports: any[], key: string): Record<string, PerfEntry> {
  const map: Record<string, PerfEntry> = {};
  for (const r of reports) {
    const name = (r[key] as string | undefined) ?? "Unknown";
    if (!map[name]) map[name] = { name, open: 0, cleaning: 0, cleaned: 0, total: 0, cleanedHrs: 0 };
    map[name].total++;
    if (r.status === "reported") map[name].open++;
    else if (r.status === "cleaning") map[name].cleaning++;
    else if (r.status === "cleaned") {
      map[name].cleaned++;
      if (r.cleanedAt && r.createdAt)
        map[name].cleanedHrs += (new Date(r.cleanedAt).getTime() - new Date(r.createdAt).getTime()) / 3_600_000;
    }
  }
  return map;
}

function toPerf(map: Record<string, PerfEntry>) {
  return Object.values(map).map(e => ({
    name: e.name,
    open: e.open,
    cleaning: e.cleaning,
    cleaned: e.cleaned,
    total: e.total,
    rate: e.total > 0 ? Math.round((e.cleaned / e.total) * 100) : 0,
    avgCleanupHours: e.cleaned > 0 ? Math.round((e.cleanedHrs / e.cleaned) * 10) / 10 : 0,
  })).sort((a, b) => b.total - a.total);
}

function buildWeeklyTrend(reports: any[]) {
  const now = Date.now();
  return [3, 2, 1, 0].map(i => {
    const startMs   = now - (i + 1) * 7 * 24 * 3_600_000;
    const endMs     = now - i       * 7 * 24 * 3_600_000;
    const weekStart = new Date(startMs).toISOString().split("T")[0];
    const reported  = reports.filter(r => r.createdAt && new Date(r.createdAt).getTime() >= startMs && new Date(r.createdAt).getTime() < endMs).length;
    const cleaned   = reports.filter(r => r.cleanedAt  && new Date(r.cleanedAt).getTime()  >= startMs && new Date(r.cleanedAt).getTime()  < endMs).length;
    return { weekStart, reported, cleaned };
  });
}

// ── GET /api/health-inspector/analytics ───────────────────────────────────────
router.get("/health-inspector/analytics", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No HI profile" }); return; }
  try {
    const svRows = await db.execute(sql`
      SELECT id, name, ward_names AS "wardNames"
      FROM supervisors WHERE health_inspector_id = ${Number(user.officerId)}
    `);
    const svList = svRows.rows as { id: number; name: string; wardNames: string[] }[];
    const emptyHIAnalytics = { kpis: { open: 0, cleaning: 0, resolvedThisMonth: 0, totalCleaned: 0, total: 0, avgCleanupHours: 0, resolutionRate: 0, openThisWeek: 0, resolvedPriorMonth: 0 }, supervisorPerformance: [], wardBacklog: [], weeklyTrend: buildWeeklyTrend([]) };
    if (!svList.length) { res.json(emptyHIAnalytics); return; }
    const wardEntries: { ring: [number, number][]; wardName: string; svName: string }[] = [];
    for (const sv of svList) {
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, wardName: entry.name, svName: sv.name });
      }
    }
    if (!wardEntries.length) { res.json(emptyHIAnalytics); return; }
    const allReports = await fetchReportsInWardEntries(wardEntries, {});
    const now = Date.now();
    const thirtyDaysAgo  = now - 30 * 24 * 3_600_000;
    const sixtyDaysAgo   = now - 60 * 24 * 3_600_000;
    const sevenDaysAgo   = now -  7 * 24 * 3_600_000;

    const open = allReports.filter(r => r.status === "reported").length;
    const cleaning = allReports.filter(r => r.status === "cleaning").length;
    const resolvedThisMonth  = allReports.filter(r => r.cleanedAt && new Date(r.cleanedAt).getTime() >= thirtyDaysAgo).length;
    const resolvedPriorMonth = allReports.filter(r => r.cleanedAt && new Date(r.cleanedAt).getTime() >= sixtyDaysAgo && new Date(r.cleanedAt).getTime() < thirtyDaysAgo).length;
    const openThisWeek = allReports.filter(r => r.createdAt && new Date(r.createdAt).getTime() >= sevenDaysAgo && r.status === "reported").length;
    const totalCleaned = allReports.filter(r => r.status === "cleaned").length;
    const total = allReports.length;

    // Rich supervisor performance with lastResolvedAt + 7-day activity flag
    const supervisorPerformance = svList.map(sv => {
      const svReports  = allReports.filter(r => r.supervisorName === sv.name);
      const svOpen     = svReports.filter(r => r.status === "reported").length;
      const svCleaning = svReports.filter(r => r.status === "cleaning").length;
      const svCleaned  = svReports.filter(r => r.status === "cleaned").length;
      const svTotal    = svReports.length;
      const cleanedRs  = svReports.filter(r => r.cleanedAt);
      const lastResolvedAt = cleanedRs.length > 0
        ? new Date(Math.max(...cleanedRs.map((r: any) => new Date(r.cleanedAt).getTime()))).toISOString()
        : null;
      const resolvedIn7d  = svReports.filter(r => r.cleanedAt && new Date(r.cleanedAt).getTime() >= sevenDaysAgo).length;
      const avgResHrs  = computeAvgCleanupHrs(svReports);
      const rate       = svTotal > 0 ? Math.round((svCleaned / svTotal) * 100) : 0;
      const wardShort  = (sv.wardNames ?? []).map((w: string) => w.replace("Ward ", "W")).join(", ");
      return {
        svId: sv.id, name: sv.name, wards: wardShort,
        open: svOpen, cleaning: svCleaning, cleaned: svCleaned, total: svTotal,
        avgResHrs, rate, lastResolvedAt,
        noActivityIn7d: svTotal > 0 && resolvedIn7d === 0,
      };
    });

    res.json({
      kpis: { open, cleaning, resolvedThisMonth, totalCleaned, total,
              avgCleanupHours: computeAvgCleanupHrs(allReports),
              resolutionRate: total > 0 ? Math.round((totalCleaned / total) * 100) : 0,
              openThisWeek, resolvedPriorMonth },
      supervisorPerformance,
      wardBacklog: buildWardBacklog(allReports),
      weeklyTrend: buildWeeklyTrend(allReports),
    });
  } catch (err) {
    logger.error({ err }, "Error computing HI analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/env-engineer/analytics ───────────────────────────────────────────
router.get("/env-engineer/analytics", requireEnvEngineer, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No EE profile" }); return; }
  try {
    const hiRows = await db.execute(sql`
      SELECT id, name FROM health_inspectors WHERE environmental_engineer_id = ${Number(user.officerId)}
    `);
    const hiList = hiRows.rows as { id: number; name: string }[];
    if (!hiList.length) {
      res.json({ kpis: { open: 0, cleaning: 0, resolvedThisMonth: 0, totalCleaned: 0, total: 0, avgCleanupHours: 0, resolutionRate: 0 }, dailyTrend: [], wardBacklog: [], hiPerformance: [], supervisorPerformance: [] });
      return;
    }
    const hiIds = hiList.map(h => h.id);
    const hiNameById = new Map(hiList.map(h => [h.id, h.name]));
    const svRows = await db.execute(sql`
      SELECT id, name, health_inspector_id AS "hiId", ward_names AS "wardNames"
      FROM supervisors WHERE health_inspector_id IN (${sql.raw(hiIds.join(","))})
    `);
    const svList = svRows.rows as { id: number; name: string; hiId: number; wardNames: string[] }[];
    if (!svList.length) {
      res.json({ kpis: { open: 0, cleaning: 0, resolvedThisMonth: 0, totalCleaned: 0, total: 0, avgCleanupHours: 0, resolutionRate: 0 }, dailyTrend: [], wardBacklog: [], hiPerformance: [], supervisorPerformance: [] });
      return;
    }
    const wardEntries: { ring: [number, number][]; wardName: string; svName: string; hiName: string }[] = [];
    for (const sv of svList) {
      const hiName = hiNameById.get(sv.hiId) ?? "";
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, wardName: entry.name, svName: sv.name, hiName });
      }
    }
    if (!wardEntries.length) {
      res.json({ kpis: { open: 0, cleaning: 0, resolvedThisMonth: 0, totalCleaned: 0, total: 0, avgCleanupHours: 0, resolutionRate: 0 }, dailyTrend: [], wardBacklog: [], hiPerformance: [], supervisorPerformance: [] });
      return;
    }
    const allReports = await fetchReportsInWardEntries(wardEntries, {});
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 3_600_000;
    const sixtyDaysAgo  = now - 60 * 24 * 3_600_000;
    const sevenDaysAgo  = now -  7 * 24 * 3_600_000;

    const open = allReports.filter(r => r.status === "reported").length;
    const cleaning = allReports.filter(r => r.status === "cleaning").length;
    const resolvedThisMonth  = allReports.filter(r => r.cleanedAt && new Date(r.cleanedAt).getTime() >= thirtyDaysAgo).length;
    const resolvedPriorMonth = allReports.filter(r => r.cleanedAt && new Date(r.cleanedAt).getTime() >= sixtyDaysAgo && new Date(r.cleanedAt).getTime() < thirtyDaysAgo).length;
    const openThisWeek = allReports.filter(r => r.createdAt && new Date(r.createdAt).getTime() >= sevenDaysAgo && r.status === "reported").length;
    const totalCleaned = allReports.filter(r => r.status === "cleaned").length;
    const total = allReports.length;

    // Supervisor performance table with 7-day resolved flag
    const supervisorTable = svList.map(sv => {
      const svReports = allReports.filter(r => r.supervisorName === sv.name);
      const svOpen     = svReports.filter(r => r.status === "reported").length;
      const svCleaning = svReports.filter(r => r.status === "cleaning").length;
      const svCleaned  = svReports.filter(r => r.status === "cleaned").length;
      const svTotal    = svReports.length;
      const resolvedIn7d = svReports.filter(r => r.cleanedAt && new Date(r.cleanedAt).getTime() >= sevenDaysAgo).length;
      const avgResHrs  = computeAvgCleanupHrs(svReports);
      const rate = svTotal > 0 ? Math.round((svCleaned / svTotal) * 100) : 0;
      const wardShort = (sv.wardNames ?? []).map((w: string) => w.replace("Ward ", "W")).join(", ");
      return {
        svId: sv.id, name: sv.name,
        hiName: hiNameById.get(sv.hiId) ?? "",
        wards: wardShort,
        open: svOpen, cleaning: svCleaning, cleaned: svCleaned, total: svTotal,
        avgResHrs, rate,
        zeroResolvedIn7d: resolvedIn7d === 0 && svTotal > 0,
      };
    });

    res.json({
      kpis: { open, cleaning, resolvedThisMonth, totalCleaned, total,
              avgCleanupHours: computeAvgCleanupHrs(allReports),
              resolutionRate: total > 0 ? Math.round((totalCleaned / total) * 100) : 0,
              openThisWeek, resolvedPriorMonth },
      dailyTrend: buildDailyTrend(allReports),
      wardBacklog: buildWardBacklog(allReports),
      hiPerformance: toPerf(groupByKey(allReports, "hiName")),
      supervisorTable,
    });
  } catch (err) {
    logger.error({ err }, "Error computing EE analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/commissioner/analytics ───────────────────────────────────────────
router.get("/commissioner/analytics", requireCommissioner, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  const panchayat = user.panchayatName ?? "Udupi";
  try {
    const eeRow = await db.execute(sql`SELECT id FROM environmental_engineers WHERE panchayat_name = ${panchayat} LIMIT 1`);
    if (!eeRow.rows.length) {
      res.json({ kpis: { open: 0, cleaning: 0, resolvedThisMonth: 0, totalCleaned: 0, total: 0, avgCleanupHours: 0, resolutionRate: 0 }, dailyTrend: [], wardBacklog: [], hiPerformance: [], supervisorPerformance: [] });
      return;
    }
    const eeId = (eeRow.rows[0] as any).id as number;
    const hiRows = await db.execute(sql`SELECT id, name FROM health_inspectors WHERE environmental_engineer_id = ${eeId}`);
    const hiList = hiRows.rows as { id: number; name: string }[];
    if (!hiList.length) {
      res.json({ kpis: { open: 0, cleaning: 0, resolvedThisMonth: 0, totalCleaned: 0, total: 0, avgCleanupHours: 0, resolutionRate: 0 }, dailyTrend: [], wardBacklog: [], hiPerformance: [], supervisorPerformance: [] });
      return;
    }
    const hiIds = hiList.map(h => h.id);
    const hiNameById = new Map(hiList.map(h => [h.id, h.name]));
    const svRows = await db.execute(sql`
      SELECT id, name, health_inspector_id AS "hiId", ward_names AS "wardNames"
      FROM supervisors WHERE health_inspector_id IN (${sql.raw(hiIds.join(","))})
    `);
    const svList = svRows.rows as { id: number; name: string; hiId: number; wardNames: string[] }[];
    if (!svList.length) {
      res.json({ kpis: { open: 0, cleaning: 0, resolvedThisMonth: 0, totalCleaned: 0, total: 0, avgCleanupHours: 0, resolutionRate: 0 }, dailyTrend: [], wardBacklog: [], hiPerformance: [], supervisorPerformance: [] });
      return;
    }
    const wardEntries: { ring: [number, number][]; wardName: string; svName: string; hiName: string }[] = [];
    for (const sv of svList) {
      const hiName = hiNameById.get(sv.hiId) ?? "";
      for (const wn of (sv.wardNames ?? [])) {
        const m = wn.match(/^Ward (\d+)/);
        if (!m) continue;
        const entry = udupiWardRings.find(w => w.name === `Udupi Ward ${m[1]}`);
        if (entry) wardEntries.push({ ring: entry.ring, wardName: entry.name, svName: sv.name, hiName });
      }
    }
    if (!wardEntries.length) {
      res.json({ kpis: { open: 0, cleaning: 0, resolvedThisMonth: 0, totalCleaned: 0, total: 0, avgCleanupHours: 0, resolutionRate: 0 }, dailyTrend: [], wardBacklog: [], hiPerformance: [], supervisorPerformance: [] });
      return;
    }
    const allReports = await fetchReportsInWardEntries(wardEntries, {});
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 3_600_000;
    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
    const todayMs = todayMidnight.getTime();

    const open = allReports.filter(r => r.status === "reported").length;
    const cleaning = allReports.filter(r => r.status === "cleaning").length;
    const resolvedThisMonth = allReports.filter(r => r.cleanedAt && new Date(r.cleanedAt).getTime() >= thirtyDaysAgo).length;
    const totalCleaned = allReports.filter(r => r.status === "cleaned").length;
    const total = allReports.length;
    const openToday = allReports.filter(r => r.createdAt && new Date(r.createdAt).getTime() >= todayMs && r.status === "reported").length;
    const cleanedToday = allReports.filter(r => r.cleanedAt && new Date(r.cleanedAt).getTime() >= todayMs).length;

    // Supervisor count per HI
    const svCountByHiName: Record<string, number> = {};
    for (const sv of svList) {
      const hiName = hiNameById.get(sv.hiId) ?? "";
      svCountByHiName[hiName] = (svCountByHiName[hiName] ?? 0) + 1;
    }
    const hiLeaderboard = toPerf(groupByKey(allReports, "hiName")).map(hi => ({
      ...hi,
      supervisorCount: svCountByHiName[hi.name] ?? 0,
    }));

    res.json({
      kpis: { open, cleaning, resolvedThisMonth, totalCleaned, total,
              avgCleanupHours: computeAvgCleanupHrs(allReports),
              resolutionRate: total > 0 ? Math.round((totalCleaned / total) * 100) : 0,
              openToday, cleanedToday },
      sla: computeSlaHrs(allReports),
      dailyTrend: buildDailyTrend(allReports),
      wardBacklog: buildWardBacklog(allReports),
      hiLeaderboard,
      supervisorPerformance: toPerf(groupByKey(allReports, "supervisorName")),
    });
  } catch (err) {
    logger.error({ err }, "Error computing commissioner analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

