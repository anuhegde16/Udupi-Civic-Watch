import { Router, type IRouter } from "express";
import { db, reportsTable, officersTable, usersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { ReassignReportBody, AdminListReportsQueryParams } from "@workspace/api-zod";
import { requireAdmin, requireControlCenter, hashPassword } from "../lib/auth";
import { sendAssignmentEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/admin/reports", requireAdmin, async (req, res): Promise<void> => {
  const queryParsed = AdminListReportsQueryParams.safeParse(req.query);
  const status = queryParsed.success ? queryParsed.data.status : undefined;
  const officerId = queryParsed.success ? queryParsed.data.officerId : undefined;
  const limit = queryParsed.success ? (queryParsed.data.limit ?? 100) : 100;
  const offset = queryParsed.success ? (queryParsed.data.offset ?? 0) : 0;

  let conditions: any[] = [];
  if (status) conditions.push(eq(reportsTable.status, status));
  if (officerId) conditions.push(eq(reportsTable.assignedOfficerId, officerId));

  const reports = await db
    .select({ report: reportsTable, officer: officersTable })
    .from(reportsTable)
    .leftJoin(officersTable, eq(reportsTable.assignedOfficerId, officersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${reportsTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const formatted = reports.map(({ report, officer }) => ({
    ...report,
    assignedOfficer: officer ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName } : null,
  }));

  res.json({ reports: formatted, total: countRow.count });
});

router.post("/admin/reports/:id/reassign", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = ReassignReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  const { officerId } = parsed.data;

  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, officerId)).limit(1);
  if (!officer) {
    res.status(404).json({ error: "Officer not found" });
    return;
  }

  const [report] = await db
    .update(reportsTable)
    .set({ assignedOfficerId: officerId })
    .where(eq(reportsTable.id, id))
    .returning();

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  sendAssignmentEmail(officer, report).catch((err) => logger.warn({ err }, "Unhandled error in assignment email"));

  res.json({
    ...report,
    assignedOfficer: { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName },
  });
});

router.delete("/admin/reports/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db
    .delete(reportsTable)
    .where(eq(reportsTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  logger.info({ reportId: id }, "Report deleted by admin");
  res.json({ success: true, id });
});

router.get("/admin/reports/analytics", requireAdmin, async (req, res): Promise<void> => {
  const dailyRows = await db.execute(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('day', created_at), 'Mon DD') AS day,
      COUNT(*)::int AS count
    FROM ${reportsTable}
    WHERE created_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY DATE_TRUNC('day', created_at)
  `);

  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable);
  const [reported] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(eq(reportsTable.status, "reported"));
  const [cleaning] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(eq(reportsTable.status, "cleaning"));
  const [cleaned] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(eq(reportsTable.status, "cleaned"));

  const officerStats = await db.execute(sql`
    SELECT
      o.name,
      COUNT(r.id)::int AS total,
      COUNT(CASE WHEN r.status != 'cleaned' THEN 1 END)::int AS pending,
      COUNT(CASE WHEN r.status = 'cleaned' THEN 1 END)::int AS resolved
    FROM ${officersTable} o
    LEFT JOIN ${reportsTable} r ON r.assigned_officer_id = o.id
    WHERE o.deleted_at IS NULL
    GROUP BY o.id, o.name
    ORDER BY total DESC
    LIMIT 6
  `);

  res.json({
    dailyTrend: ((dailyRows as any).rows ?? (dailyRows as unknown) as any[]).map((r: any) => ({ day: r.day, count: r.count })),
    byStatus: {
      total: total.count,
      reported: reported.count,
      cleaning: cleaning.count,
      cleaned: cleaned.count,
    },
    officers: ((officerStats as any).rows ?? (officerStats as unknown) as any[]).map((r: any) => ({
      name: r.name,
      pending: r.pending,
      resolved: r.resolved,
    })),
  });
});

// ── Panchayat Admin Management (Control Center only) ──────────────────────────

router.get("/admin/panchayat-admins", requireControlCenter, async (req, res): Promise<void> => {
  const admins = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      panchayatName: usersTable.panchayatName,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "panchayat_admin"))
    .orderBy(usersTable.createdAt);

  // For each panchayat admin, count their field officers
  const withCounts = await Promise.all(
    admins.map(async (admin) => {
      if (!admin.panchayatName) return { ...admin, officerCount: 0 };
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(officersTable)
        .where(and(eq(officersTable.panchayatName, admin.panchayatName), sql`${officersTable.deletedAt} IS NULL`));
      return { ...admin, officerCount: row.count };
    })
  );

  res.json({ admins: withCounts, total: withCounts.length });
});

router.post("/admin/panchayat-admins", requireControlCenter, async (req, res): Promise<void> => {
  const { name, email, password, panchayatName } = req.body;

  if (!name || !email || !password || !panchayatName) {
    res.status(400).json({ error: "name, email, password, and panchayatName are required" });
    return;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await hashPassword(password);

  const [created] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      name,
      role: "panchayat_admin",
      panchayatName,
    })
    .returning();

  res.status(201).json({
    id: created.id,
    name: created.name,
    email: created.email,
    panchayatName: created.panchayatName,
    createdAt: created.createdAt,
    officerCount: 0,
  });
});

router.patch("/admin/panchayat-admins/:id", requireControlCenter, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "panchayat_admin")))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Panchayat Admin not found" });
    return;
  }

  const { name, email, panchayatName, password } = req.body ?? {};

  // Check email uniqueness if changing
  if (email && email !== existing.email) {
    const [clash] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (clash) {
      res.status(409).json({ error: "Email already in use by another account" });
      return;
    }
  }

  const updates: Partial<typeof existing> = {};
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (panchayatName) updates.panchayatName = panchayatName;
  if (password && password.length >= 6) updates.passwordHash = await hashPassword(password);

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  logger.info({ userId: id }, "Panchayat admin updated by control center");
  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    panchayatName: updated.panchayatName,
    createdAt: updated.createdAt,
  });
});

router.delete("/admin/panchayat-admins/:id", requireControlCenter, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "panchayat_admin")))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Panchayat Admin not found" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));

  logger.info({ userId: id }, "Panchayat admin deleted by control center");
  res.json({ success: true, message: "Panchayat Admin removed" });
});

export default router;
