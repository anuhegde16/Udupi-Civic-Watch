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

export default router;
