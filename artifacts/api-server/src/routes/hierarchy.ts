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
  type SessionUser,
} from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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
    const rows = await db.execute(sql`
      SELECT
        r.id, r.status, r.address, r.description, r.latitude, r.longitude,
        r.image_url AS "imageUrl", r.image_urls AS "imageUrls",
        r.cleanup_image_url AS "cleanupImageUrl", r.cleanup_image_urls AS "cleanupImageUrls",
        r.waste_types AS "wasteTypes", r.waste_severity AS "wasteSeverity",
        r.created_at AS "createdAt", r.updated_at AS "updatedAt",
        r.cleaning_started_at AS "cleaningStartedAt", r.cleaned_at AS "cleanedAt",
        o.id AS "officerId", o.name AS "officerName", o.area_name AS "wardName"
      FROM supervisors sv
      JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
      JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
      JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
      WHERE sv.id = ${Number(user.officerId)}
      ORDER BY r.created_at DESC
    `);
    const reports = (rows.rows as any[]);
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
    // Verify the report is in one of this supervisor's wards
    const check = await db.execute(sql`
      SELECT r.id
      FROM supervisors sv
      JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
      JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
      JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
      WHERE sv.id = ${Number(user.officerId)} AND r.id = ${id}
      LIMIT 1
    `);
    if (!check.rows.length) {
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
    const rows = await db.execute(sql`
      SELECT
        sv.id, sv.name, sv.phone, sv.ward_names AS "wardNames",
        COUNT(r.id) FILTER (WHERE r.status = 'reported') ::int AS "reportedCount",
        COUNT(r.id) FILTER (WHERE r.status = 'cleaning') ::int AS "cleaningCount",
        COUNT(r.id) FILTER (WHERE r.status = 'cleaned')  ::int AS "cleanedCount",
        COUNT(r.id)::int AS "totalCount"
      FROM supervisors sv
      LEFT JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
      LEFT JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
      LEFT JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
      WHERE sv.health_inspector_id = ${Number(user.officerId)}
      GROUP BY sv.id, sv.name, sv.phone, sv.ward_names
      ORDER BY sv.name
    `);
    res.json({ supervisors: rows.rows });
  } catch (err) {
    logger.error({ err }, "Error fetching HI supervisor stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/health-inspector/supervisor/:supervisorId/reports ─────────────────
// Returns all reports for a specific supervisor (must be under this HI).
router.get("/health-inspector/supervisor/:supervisorId/reports", requireHealthInspector, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(403).json({ error: "No HI profile" }); return; }
  const rawSvId = Array.isArray(req.params.supervisorId) ? req.params.supervisorId[0] : req.params.supervisorId;
  const svId = parseInt(rawSvId, 10);
  if (isNaN(svId)) { res.status(400).json({ error: "Invalid supervisorId" }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT
        r.id, r.status, r.address, r.description, r.latitude, r.longitude,
        r.image_url AS "imageUrl", r.image_urls AS "imageUrls",
        r.waste_types AS "wasteTypes", r.waste_severity AS "wasteSeverity",
        r.created_at AS "createdAt",
        o.area_name AS "wardName"
      FROM supervisors sv
      JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
      JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
      JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
      WHERE sv.health_inspector_id = ${Number(user.officerId)} AND sv.id = ${svId}
      ORDER BY r.created_at DESC
    `);
    res.json({ reports: rows.rows });
  } catch (err) {
    logger.error({ err }, "Error fetching supervisor reports for HI");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/env-engineer/full-hierarchy ──────────────────────────────────────
// Returns all HIs under this EE, each with their supervisors (ward names + report counts).
router.get("/env-engineer/full-hierarchy", requireEnvEngineer, async (req, res): Promise<void> => {
  const user = (req as any).user as SessionUser;
  if (!user.officerId) { res.status(404).json({ error: "EE profile not found" }); return; }
  try {
    const hiRows = await db.execute(sql`
      SELECT hi.id, hi.name, hi.phone,
             COUNT(DISTINCT sv.id)::int AS "supervisorCount",
             COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'reported')::int AS "reportedCount",
             COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'cleaning')::int AS "cleaningCount",
             COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'cleaned')::int  AS "cleanedCount"
      FROM health_inspectors hi
      LEFT JOIN supervisors sv ON sv.health_inspector_id = hi.id
      LEFT JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
      LEFT JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
      LEFT JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
      WHERE hi.environmental_engineer_id = ${Number(user.officerId)}
      GROUP BY hi.id, hi.name, hi.phone
      ORDER BY hi.name
    `);

    const healthInspectors = await Promise.all(
      (hiRows.rows as any[]).map(async (hi) => {
        const svRows = await db.execute(sql`
          SELECT sv.id, sv.name, sv.phone, sv.ward_names AS "wardNames",
                 COUNT(r.id) FILTER (WHERE r.status = 'reported')::int AS "reportedCount",
                 COUNT(r.id) FILTER (WHERE r.status = 'cleaning')::int AS "cleaningCount",
                 COUNT(r.id) FILTER (WHERE r.status = 'cleaned')::int  AS "cleanedCount"
          FROM supervisors sv
          LEFT JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
          LEFT JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
          LEFT JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
          WHERE sv.health_inspector_id = ${hi.id}
          GROUP BY sv.id, sv.name, sv.phone, sv.ward_names
          ORDER BY sv.name
        `);
        return { ...hi, supervisors: svRows.rows };
      })
    );

    res.json({ healthInspectors });
  } catch (err) {
    logger.error({ err }, "Error fetching EE full hierarchy");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/community-mobiliser/reports ──────────────────────────────────────
// Read-only: all active Udupi reports with ward, status, AI data, photos.
// No PII (no reporter email/IP). Guarded by requireCommunityMobiliser.
router.get("/community-mobiliser/reports", requireCommunityMobiliser, async (req, res): Promise<void> => {
  try {
    const wardFilter = typeof req.query.ward === "string" ? req.query.ward : undefined;
    const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
    const wasteTypeFilter = typeof req.query.wasteType === "string" ? req.query.wasteType : undefined;

    let whereClause = sql`r.deleted_at IS NULL`;
    if (wardFilter) {
      whereClause = sql`${whereClause} AND o.area_name = ${wardFilter}`;
    }
    if (statusFilter) {
      whereClause = sql`${whereClause} AND r.status = ${statusFilter}`;
    }
    if (wasteTypeFilter) {
      whereClause = sql`${whereClause} AND r.waste_types @> ${JSON.stringify([wasteTypeFilter])}::jsonb`;
    }

    const rows = await db.execute(sql`
      SELECT
        r.id, r.status, r.address, r.description, r.latitude, r.longitude,
        r.image_url AS "imageUrl", r.image_urls AS "imageUrls",
        r.cleanup_image_url AS "cleanupImageUrl",
        r.waste_types AS "wasteTypes", r.waste_severity AS "wasteSeverity",
        r.brand_names AS "brandNames",
        r.created_at AS "createdAt",
        o.area_name AS "wardName",
        o.panchayat_name AS "panchayatName"
      FROM reports r
      LEFT JOIN officers o ON o.id = r.assigned_officer_id AND o.deleted_at IS NULL
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT 500
    `);

    const reports = rows.rows as any[];
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

    const hiRows = await db.execute(sql`
      SELECT hi.id, hi.name, hi.phone,
             COUNT(DISTINCT sv.id)::int AS "supervisorCount",
             COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'reported')::int AS "reportedCount",
             COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'cleaning')::int AS "cleaningCount",
             COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'cleaned')::int  AS "cleanedCount"
      FROM health_inspectors hi
      LEFT JOIN supervisors sv ON sv.health_inspector_id = hi.id
      LEFT JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
      LEFT JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
      LEFT JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
      WHERE hi.environmental_engineer_id = ${ee.id}
      GROUP BY hi.id, hi.name, hi.phone
      ORDER BY hi.name
    `);

    const healthInspectors = await Promise.all(
      (hiRows.rows as any[]).map(async (hi) => {
        const svRows = await db.execute(sql`
          SELECT sv.id, sv.name, sv.phone, sv.ward_names AS "wardNames",
                 COUNT(r.id) FILTER (WHERE r.status = 'reported')::int AS "reportedCount",
                 COUNT(r.id)::int AS "totalCount"
          FROM supervisors sv
          LEFT JOIN LATERAL jsonb_array_elements_text(sv.ward_names) AS wn ON true
          LEFT JOIN officers o ON o.area_name = split_part(wn, '/', 1) AND o.deleted_at IS NULL
          LEFT JOIN reports r ON r.assigned_officer_id = o.id AND r.deleted_at IS NULL
          WHERE sv.health_inspector_id = ${hi.id}
          GROUP BY sv.id, sv.name, sv.phone, sv.ward_names
          ORDER BY sv.name
        `);
        return { ...hi, supervisors: svRows.rows };
      })
    );

    res.json({ environmentalEngineer: { ...ee, healthInspectors } });
  } catch (err) {
    logger.error({ err }, "Error fetching commissioner hierarchy");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
