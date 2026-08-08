import { Router, type IRouter } from "express";
import { db, officersTable, reportsTable, usersTable } from "@workspace/db";
import { eq, sql, and, isNull, gte } from "drizzle-orm";
import { CreateOfficerBody, UpdateOfficerBody, GetOfficerReportsQueryParams } from "@workspace/api-zod";
import { requireAuth, requireAdmin, requirePanchayatOrControlCenter, hashPassword } from "../lib/auth";
import { sendWelcomeEmail } from "../lib/email";
import { logger } from "../lib/logger";
import geofencesData from "../data/geofences.json";

function computeZoneGeo(zoneName: string): { centerLat: number; centerLng: number } | null {
  const feature = geofencesData.features.find(
    (f) => f.geometry.type === "Polygon" && (f.properties as any)?.name === zoneName
  );
  if (!feature || feature.geometry.type !== "Polygon") return null;

  const coords = feature.geometry.coordinates[0] as [number, number][];
  const lats = coords.map(([, lat]) => lat);
  const lons = coords.map(([lon]) => lon);

  const centerLat = lats.reduce((s, v) => s + v, 0) / lats.length;
  const centerLng = lons.reduce((s, v) => s + v, 0) / lons.length;

  return { centerLat, centerLng };
}

const router: IRouter = Router();

router.get("/officers", requirePanchayatOrControlCenter, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const isPanchayatAdmin = user.role === "panchayat_admin" || user.role === "commissioner";

  let query = db
    .select()
    .from(officersTable)
    .where(isNull(officersTable.deletedAt))
    .orderBy(officersTable.createdAt) as any;

  const officers = await db
    .select()
    .from(officersTable)
    .where(
      isPanchayatAdmin && user.panchayatName
        ? and(isNull(officersTable.deletedAt), eq(officersTable.panchayatName, user.panchayatName))
        : isNull(officersTable.deletedAt)
    )
    .orderBy(officersTable.createdAt);

  const withCounts = await Promise.all(
    officers.map(async (officer) => {
      const [total] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(eq(reportsTable.assignedOfficerId, officer.id));
      const [pending] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(and(eq(reportsTable.assignedOfficerId, officer.id), sql`${reportsTable.status} != 'cleaned'`));
      return {
        ...officer,
        reportCount: total.count,
        pendingCount: pending.count,
      };
    })
  );

  res.json({ officers: withCounts, total: withCounts.length });
});

router.post("/officers", requirePanchayatOrControlCenter, async (req, res): Promise<void> => {
  const parsed = CreateOfficerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  const user = (req as any).user;
  const isPanchayatAdmin = user.role === "panchayat_admin" || user.role === "commissioner";

  let { name, email, password, phone, areaName, centerLat, centerLng, panchayatName } = parsed.data as any;

  // Panchayat admin automatically scopes created officers to their panchayat
  if (isPanchayatAdmin) {
    panchayatName = user.panchayatName;
  }

  if (areaName) {
    const zoneGeo = computeZoneGeo(areaName);
    if (zoneGeo) {
      centerLat = zoneGeo.centerLat;
      centerLng = zoneGeo.centerLng;
    }
  }

  const existing = await db
    .select()
    .from(officersTable)
    .where(and(eq(officersTable.email, email), isNull(officersTable.deletedAt)))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await hashPassword(password);

  // Remove any stale user account with this email
  await db.delete(usersTable).where(
    and(
      eq(usersTable.email, email),
      sql`${usersTable.role} IN ('officer', 'field_officer')`
    )
  );

  const [officer] = await db
    .insert(officersTable)
    .values({
      name,
      email,
      passwordHash,
      phone: phone ?? null,
      areaName: areaName ?? null,
      panchayatName: panchayatName ?? null,
      centerLat: centerLat ?? null,
      centerLng: centerLng ?? null,
    })
    .returning();

  await db.insert(usersTable).values({
    email,
    passwordHash,
    name,
    role: "field_officer",
    officerId: String(officer.id),
    panchayatName: panchayatName ?? null,
  });

  sendWelcomeEmail(officer).catch((err) => logger.warn({ err }, "Unhandled error in welcome email"));

  res.status(201).json({ ...officer, reportCount: 0, pendingCount: 0 });
});

router.get("/officers/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, id)).limit(1);

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(eq(reportsTable.assignedOfficerId, id));
  const [pending] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(eq(reportsTable.assignedOfficerId, id), sql`${reportsTable.status} != 'cleaned'`));

  res.json({ ...officer, reportCount: total.count, pendingCount: pending.count });
});

router.patch("/officers/:id", requirePanchayatOrControlCenter, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdateOfficerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  // Fetch existing officer — needed for old email lookup when updating users table
  const [existing] = await db
    .select()
    .from(officersTable)
    .where(and(eq(officersTable.id, id), isNull(officersTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  // Panchayat admin / commissioner can only edit officers in their own panchayat
  if ((user.role === "panchayat_admin" || user.role === "commissioner") && user.panchayatName) {
    if (existing.panchayatName !== user.panchayatName) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const updates: Record<string, any> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.areaName !== undefined) updates.areaName = parsed.data.areaName;
  if (parsed.data.centerLat !== undefined) updates.centerLat = parsed.data.centerLat;
  if (parsed.data.centerLng !== undefined) updates.centerLng = parsed.data.centerLng;
  if ((parsed.data as any).panchayatName !== undefined) updates.panchayatName = (parsed.data as any).panchayatName;

  // Handle email change: uniqueness check + sync users table
  if (parsed.data.email !== undefined && parsed.data.email !== null && parsed.data.email !== existing.email) {
    const [clash] = await db
      .select()
      .from(officersTable)
      .where(and(eq(officersTable.email, parsed.data.email), isNull(officersTable.deletedAt), sql`${officersTable.id} != ${id}`))
      .limit(1);
    if (clash) {
      res.status(409).json({ error: "Email already in use by another officer" });
      return;
    }
    updates.email = parsed.data.email;
    await db
      .update(usersTable)
      .set({ email: parsed.data.email })
      .where(and(eq(usersTable.email, existing.email), sql`${usersTable.role} IN ('officer', 'field_officer')`));
  }

  // Handle password change: hash + sync users table
  if (parsed.data.password) {
    const newHash = await hashPassword(parsed.data.password);
    const lookupEmail = updates.email ?? existing.email;
    await db
      .update(usersTable)
      .set({ passwordHash: newHash })
      .where(and(eq(usersTable.email, lookupEmail), sql`${usersTable.role} IN ('officer', 'field_officer')`));
    updates.passwordHash = newHash;
  }

  const [officer] = await db
    .update(officersTable)
    .set(updates)
    .where(eq(officersTable.id, id))
    .returning();

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(eq(reportsTable.assignedOfficerId, id));
  const [pending] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(eq(reportsTable.assignedOfficerId, id), sql`${reportsTable.status} != 'cleaned'`));

  res.json({ ...officer, reportCount: total.count, pendingCount: pending.count });
});

router.delete("/officers/:id", requirePanchayatOrControlCenter, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(officersTable)
    .where(and(eq(officersTable.id, id), isNull(officersTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  // Panchayat admin / commissioner can only delete officers in their own panchayat
  if ((user.role === "panchayat_admin" || user.role === "commissioner") && user.panchayatName) {
    if (existing.panchayatName !== user.panchayatName) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const tombstoneEmail = `__deleted_${id}__${Date.now()}`;
  await db
    .update(officersTable)
    .set({ email: tombstoneEmail, deletedAt: new Date() })
    .where(eq(officersTable.id, id));

  await db.delete(usersTable).where(
    and(
      eq(usersTable.email, existing.email),
      sql`${usersTable.role} IN ('officer', 'field_officer')`
    )
  );

  res.json({ success: true, message: "Officer removed" });
});

router.get("/officers/:id/reports", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const isFieldOfficer = user.role === "officer" || user.role === "field_officer";
  const isControlCenter = user.role === "admin" || user.role === "control_center";

  if (isFieldOfficer) {
    if (!user.officerId || user.officerId !== id) {
      res.status(403).json({ error: "Access denied: you can only view your own reports" });
      return;
    }
  } else if (user.role === "panchayat_admin" || user.role === "commissioner") {
    const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, id)).limit(1);
    if (!officer || officer.panchayatName !== user.panchayatName) {
      res.status(403).json({ error: "Access denied: officer is not in your panchayat" });
      return;
    }
  } else if (!isControlCenter) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const queryParsed = GetOfficerReportsQueryParams.safeParse(req.query);
  const status = queryParsed.success ? queryParsed.data.status : undefined;
  const limit = queryParsed.success && queryParsed.data.limit ? queryParsed.data.limit : 500;
  const days = queryParsed.success ? queryParsed.data.days : undefined;

  let conditions: any[] = [eq(reportsTable.assignedOfficerId, id), isNull(reportsTable.deletedAt)];
  if (status) conditions.push(eq(reportsTable.status, status));
  if (days && days > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    conditions.push(gte(reportsTable.createdAt, cutoff));
  }

  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(...conditions));

  const reports = await db
    .select({ report: reportsTable, officer: officersTable })
    .from(reportsTable)
    .leftJoin(officersTable, eq(reportsTable.assignedOfficerId, officersTable.id))
    .where(and(...conditions))
    .orderBy(sql`${reportsTable.createdAt} DESC`)
    .limit(limit);

  const formatted = reports.map(({ report, officer }) => ({
    ...report,
    assignedOfficer: officer ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName } : null,
  }));

  res.json({ reports: formatted, total: countRow.count });
});

export default router;
