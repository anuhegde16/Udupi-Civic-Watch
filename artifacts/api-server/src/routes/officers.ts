import { Router, type IRouter } from "express";
import { db, officersTable, reportsTable, usersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { CreateOfficerBody, UpdateOfficerBody, GetOfficerReportsQueryParams } from "@workspace/api-zod";
import { requireAuth, requireAdmin, hashPassword } from "../lib/auth";

const router: IRouter = Router();

router.get("/officers", requireAdmin, async (req, res): Promise<void> => {
  const officers = await db.select().from(officersTable).orderBy(officersTable.createdAt);

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

router.post("/officers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateOfficerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  const { name, email, password, phone, areaName, centerLat, centerLng, radiusKm } = parsed.data;

  const existing = await db.select().from(officersTable).where(eq(officersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await hashPassword(password);

  const [officer] = await db
    .insert(officersTable)
    .values({
      name,
      email,
      passwordHash,
      phone: phone ?? null,
      areaName: areaName ?? null,
      centerLat: centerLat ?? null,
      centerLng: centerLng ?? null,
      radiusKm: radiusKm ?? null,
    })
    .returning();

  await db.insert(usersTable).values({
    email,
    passwordHash,
    name,
    role: "officer",
    officerId: String(officer.id),
  });

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

router.patch("/officers/:id", requireAdmin, async (req, res): Promise<void> => {
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

  const updates: Record<string, any> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.areaName !== undefined) updates.areaName = parsed.data.areaName;
  if (parsed.data.centerLat !== undefined) updates.centerLat = parsed.data.centerLat;
  if (parsed.data.centerLng !== undefined) updates.centerLng = parsed.data.centerLng;
  if (parsed.data.radiusKm !== undefined) updates.radiusKm = parsed.data.radiusKm;

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

router.delete("/officers/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [officer] = await db.delete(officersTable).where(eq(officersTable.id, id)).returning();

  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  res.json({ success: true, message: "Officer deleted" });
});

router.get("/officers/:id/reports", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const queryParsed = GetOfficerReportsQueryParams.safeParse(req.query);
  const status = queryParsed.success ? queryParsed.data.status : undefined;

  let conditions: any[] = [eq(reportsTable.assignedOfficerId, id)];
  if (status) conditions.push(eq(reportsTable.status, status));

  const reports = await db
    .select({ report: reportsTable, officer: officersTable })
    .from(reportsTable)
    .leftJoin(officersTable, eq(reportsTable.assignedOfficerId, officersTable.id))
    .where(and(...conditions))
    .orderBy(sql`${reportsTable.createdAt} DESC`);

  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(...conditions));

  const formatted = reports.map(({ report, officer }) => ({
    ...report,
    assignedOfficer: officer ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName } : null,
  }));

  res.json({ reports: formatted, total: countRow.count });
});

export default router;
