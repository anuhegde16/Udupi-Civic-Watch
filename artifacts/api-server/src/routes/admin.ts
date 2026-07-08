import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, reportsTable, officersTable, usersTable } from "@workspace/db";
import { eq, sql, and, isNull, isNotNull, lt } from "drizzle-orm";
import { ReassignReportBody, AdminListReportsQueryParams } from "@workspace/api-zod";
import { requireAdmin, requireControlCenter, hashPassword } from "../lib/auth";
import {
  sendAssignmentEmail,
  sendWelcomeEmail,
  sendOtpEmail,
  sendStatusUpdateEmail,
  sendPanchayatAdminWelcomeEmail,
  sendNewReportToPanchayatAdmins,
  sendWeeklyDigest,
  type EmailAnalytics,
} from "../lib/email";
import { sendWeeklyDigestToAll } from "../lib/scheduler";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Test mode (in-memory, resets on restart) ────────────────────────────────
let testMode = false;

router.get("/admin/test-mode", (req, res): void => {
  res.json({ testMode });
});

router.post("/admin/test-mode", requireControlCenter, (req, res): void => {
  const parsed = z.object({ testMode: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "testMode must be a boolean" });
    return;
  }
  testMode = parsed.data.testMode;
  logger.info({ testMode }, "Test mode updated by control center");
  res.json({ testMode });
});

router.get("/admin/reports", requireAdmin, async (req, res): Promise<void> => {
  const queryParsed = AdminListReportsQueryParams.safeParse(req.query);
  const status = queryParsed.success ? queryParsed.data.status : undefined;
  const officerId = queryParsed.success ? queryParsed.data.officerId : undefined;
  const limit = queryParsed.success ? (queryParsed.data.limit ?? 100) : 100;
  const offset = queryParsed.success ? (queryParsed.data.offset ?? 0) : 0;
  const archived = req.query.archived === "true";

  let conditions: any[] = [];
  if (archived) {
    conditions.push(isNotNull(reportsTable.deletedAt));
  } else {
    conditions.push(isNull(reportsTable.deletedAt));
    if (status) conditions.push(eq(reportsTable.status, status));
    if (officerId) conditions.push(eq(reportsTable.assignedOfficerId, officerId));
  }

  const reports = await db
    .select({ report: reportsTable, officer: officersTable })
    .from(reportsTable)
    .leftJoin(officersTable, eq(reportsTable.assignedOfficerId, officersTable.id))
    .where(and(...conditions))
    .orderBy(sql`${reportsTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(and(...conditions));

  const formatted = reports.map(({ report, officer }) => {
    const { reporterIp: _ri, ...safeReport } = report;
    return {
      ...safeReport,
      assignedOfficer: officer ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName } : null,
    };
  });

  res.json({ reports: formatted, total: countRow.count });
});

router.get("/admin/reports/bulk-archive-preview", requireControlCenter, async (req, res): Promise<void> => {
  const olderThanDays = parseInt(req.query.olderThanDays as string, 10);
  if (isNaN(olderThanDays) || olderThanDays < 1) {
    res.status(400).json({ error: "olderThanDays must be a positive integer" });
    return;
  }

  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(and(isNull(reportsTable.deletedAt), lt(reportsTable.createdAt, cutoff)));

  res.json({ count: row.count });
});

router.post("/admin/reports/bulk-archive", requireControlCenter, async (req, res): Promise<void> => {
  const parsed = z.object({ olderThanDays: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "olderThanDays must be a positive integer" });
    return;
  }

  const cutoff = new Date(Date.now() - parsed.data.olderThanDays * 24 * 60 * 60 * 1000);
  const now = new Date();

  const archived = await db
    .update(reportsTable)
    .set({ deletedAt: now })
    .where(and(isNull(reportsTable.deletedAt), lt(reportsTable.createdAt, cutoff)))
    .returning({ id: reportsTable.id });

  logger.info({ archivedCount: archived.length, olderThanDays: parsed.data.olderThanDays }, "Bulk archive completed by control center");
  res.json({ archivedCount: archived.length });
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

  const { reporterEmail: _re, reporterIp: _ri, ...safeReport } = report;
  res.json({
    ...safeReport,
    assignedOfficer: { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName },
  });
});

router.delete("/admin/reports/archived/purge-all", requireControlCenter, async (req, res): Promise<void> => {
  const purged = await db
    .delete(reportsTable)
    .where(isNotNull(reportsTable.deletedAt))
    .returning({ id: reportsTable.id });

  logger.info({ deletedCount: purged.length }, "Purged all archived reports by control center");
  res.json({ deletedCount: purged.length });
});

router.delete("/admin/reports/:id", requireControlCenter, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [archived] = await db
    .update(reportsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(reportsTable.id, id), isNull(reportsTable.deletedAt)))
    .returning();

  if (!archived) {
    res.status(404).json({ error: "Report not found or already archived" });
    return;
  }

  logger.info({ reportId: id }, "Report archived (soft-deleted) by control center");
  res.json({ success: true, id });
});

router.delete("/admin/reports/:id/permanent", requireControlCenter, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [existing] = await db
    .select({ id: reportsTable.id, deletedAt: reportsTable.deletedAt })
    .from(reportsTable)
    .where(eq(reportsTable.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  if (!existing.deletedAt) {
    res.status(400).json({ error: "Report must be archived before it can be permanently deleted" });
    return;
  }

  await db.delete(reportsTable).where(eq(reportsTable.id, id));
  logger.info({ reportId: id }, "Report permanently deleted by control center");
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

// ── District-wide analytics (Control Center) ───────────────────────────────
router.get("/admin/analytics", requireAdmin, async (req, res): Promise<void> => {
  const activeFilter = isNull(reportsTable.deletedAt);

  // KPI totals
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(activeFilter);
  const [reported] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(activeFilter, eq(reportsTable.status, "reported")));
  const [cleaning] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(activeFilter, eq(reportsTable.status, "cleaning")));
  const [cleaned] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(activeFilter, eq(reportsTable.status, "cleaned")));

  // 14-day daily trend (by status)
  const dailyRows = await db
    .select({
      date: sql<string>`DATE(${reportsTable.createdAt})::text`,
      status: reportsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(reportsTable)
    .where(and(activeFilter, sql`${reportsTable.createdAt} >= NOW() - INTERVAL '14 days'`))
    .groupBy(sql`DATE(${reportsTable.createdAt})`, reportsTable.status)
    .orderBy(sql`DATE(${reportsTable.createdAt})`);

  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  const dailyTrend = last14Days.map((date) => {
    const rows = dailyRows.filter((r) => r.date === date);
    return {
      date,
      reported: rows.find((r) => r.status === "reported")?.count ?? 0,
      cleaning: rows.find((r) => r.status === "cleaning")?.count ?? 0,
      cleaned: rows.find((r) => r.status === "cleaned")?.count ?? 0,
      total: rows.reduce((sum, r) => sum + r.count, 0),
    };
  });

  // Officer leaderboard — district-wide, every active officer
  const officerRows = await db.select().from(officersTable).where(isNull(officersTable.deletedAt));
  const officerLeaderboard = await Promise.all(
    officerRows.map(async (o) => {
      const officerActive = and(eq(reportsTable.assignedOfficerId, o.id), isNull(reportsTable.deletedAt));
      const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(officerActive);
      const [cleanedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(officerActive, eq(reportsTable.status, "cleaned")));
      const [overdueRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(and(officerActive, eq(reportsTable.status, "reported"), sql`${reportsTable.createdAt} < NOW() - INTERVAL '24 hours'`));
      const [avgRow] = await db
        .select({
          avgHours: sql<number | null>`AVG(EXTRACT(EPOCH FROM (${reportsTable.updatedAt} - ${reportsTable.createdAt})) / 3600)`,
        })
        .from(reportsTable)
        .where(and(officerActive, eq(reportsTable.status, "cleaned")));

      const totalCount = totalRow.count;
      const cleanedCount = cleanedRow.count;
      const pendingCount = totalCount - cleanedCount;
      const resolutionRate = totalCount > 0 ? Math.round((cleanedCount / totalCount) * 100) : 0;

      return {
        id: o.id,
        name: o.name,
        areaName: o.areaName ?? null,
        panchayatName: o.panchayatName ?? null,
        total: totalCount,
        cleaned: cleanedCount,
        pending: pendingCount,
        resolutionRate,
        avgResolutionHours: avgRow.avgHours !== null ? Math.round(avgRow.avgHours * 10) / 10 : null,
        overdueCount: overdueRow.count,
        belowTarget: totalCount > 0 && (resolutionRate < 50 || overdueRow.count >= 3),
      };
    })
  );
  officerLeaderboard.sort((a, b) => b.total - a.total);

  // Hotspots — grouped by rounded lat/lng (~100m), with a 7-day trend signal
  const hotspotRows = await db.execute(sql`
    SELECT
      ROUND(${reportsTable.latitude}::numeric, 3)::float AS lat,
      ROUND(${reportsTable.longitude}::numeric, 3)::float AS lng,
      COUNT(*)::int AS count,
      MAX(${reportsTable.address}) AS address,
      COUNT(*) FILTER (WHERE ${reportsTable.createdAt} >= NOW() - INTERVAL '7 days')::int AS recent7,
      COUNT(*) FILTER (WHERE ${reportsTable.createdAt} >= NOW() - INTERVAL '14 days' AND ${reportsTable.createdAt} < NOW() - INTERVAL '7 days')::int AS prior7
    FROM ${reportsTable}
    WHERE ${reportsTable.deletedAt} IS NULL
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 12
  `);
  const hotspots = ((hotspotRows as any).rows ?? (hotspotRows as unknown as any[])).map((r: any) => ({
    lat: r.lat,
    lng: r.lng,
    count: r.count,
    address: r.address,
    trend: r.recent7 > r.prior7 ? "worsening" : r.recent7 < r.prior7 ? "improving" : "steady",
  }));

  // Delay metrics — overall + median, based on created_at → updated_at deltas
  const [delayRow] = await db.execute(sql`
    SELECT
      AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) FILTER (WHERE status = 'cleaned') AS avg_resolution_hours,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) FILTER (WHERE status = 'cleaned') AS median_resolution_hours,
      AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600) FILTER (WHERE status != 'cleaned') AS avg_open_hours
    FROM ${reportsTable}
    WHERE deleted_at IS NULL
  `).then((r) => (r as any).rows ?? (r as unknown as any[]));

  // Longest-outstanding open reports
  const oldestRows = await db
    .select({ report: reportsTable, officer: officersTable })
    .from(reportsTable)
    .leftJoin(officersTable, eq(reportsTable.assignedOfficerId, officersTable.id))
    .where(and(isNull(reportsTable.deletedAt), sql`${reportsTable.status} != 'cleaned'`))
    .orderBy(sql`${reportsTable.createdAt} ASC`)
    .limit(10);

  const oldestOpenReports = oldestRows.map(({ report, officer }) => ({
    id: report.id,
    status: report.status,
    address: report.address,
    latitude: report.latitude,
    longitude: report.longitude,
    createdAt: report.createdAt,
    hoursOpen: Math.round(((Date.now() - new Date(report.createdAt).getTime()) / 3_600_000) * 10) / 10,
    assignedOfficer: officer ? { id: officer.id, name: officer.name, areaName: officer.areaName } : null,
  }));

  const totalCount = total.count;
  const cleanedCount = cleaned.count;

  res.json({
    kpis: {
      totalReports: totalCount,
      completionRate: totalCount > 0 ? Math.round((cleanedCount / totalCount) * 100) : 0,
      activeHotspots: hotspots.length,
      officersBelowTarget: officerLeaderboard.filter((o) => o.belowTarget).length,
      reported: reported.count,
      cleaning: cleaning.count,
      cleaned: cleanedCount,
    },
    dailyTrend,
    officerLeaderboard,
    hotspots,
    delayMetrics: {
      avgResolutionHours: delayRow?.avg_resolution_hours !== null && delayRow?.avg_resolution_hours !== undefined ? Math.round(Number(delayRow.avg_resolution_hours) * 10) / 10 : null,
      medianResolutionHours: delayRow?.median_resolution_hours !== null && delayRow?.median_resolution_hours !== undefined ? Math.round(Number(delayRow.median_resolution_hours) * 10) / 10 : null,
      avgOpenHours: delayRow?.avg_open_hours !== null && delayRow?.avg_open_hours !== undefined ? Math.round(Number(delayRow.avg_open_hours) * 10) / 10 : null,
    },
    oldestOpenReports,
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

  sendPanchayatAdminWelcomeEmail({ name: created.name, email: created.email, panchayatName: created.panchayatName }).catch(
    (err) => logger.warn({ err }, "Panchayat admin welcome email failed")
  );

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

// ── Manual weekly digest trigger (control center only) ──────────────────────────

router.post("/admin/send-weekly-digest", requireControlCenter, async (req, res): Promise<void> => {
  res.json({ message: "Weekly digest queued — sending in background" });
  sendWeeklyDigestToAll().catch((err) => logger.error({ err }, "Manual weekly digest failed"));
});

// ── Test-send endpoint: fires one of every email type to a given address ────────

router.post("/admin/test-emails", requireControlCenter, async (req, res): Promise<void> => {
  const { to } = req.body as { to?: string };
  if (!to || typeof to !== "string" || !to.includes("@")) {
    res.status(400).json({ error: "Provide a valid 'to' email address" });
    return;
  }

  const base = process.env["REPLIT_DOMAINS"]
    ? `https://${process.env["REPLIT_DOMAINS"]!.split(",")[0]!.trim()}`
    : process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : "https://cleanspot.replit.app";

  // Realistic mock data — no DB reads
  const mockOfficer = {
    id: 999,
    name: "Rajshekhar M",
    email: to,
    phone: "9448263410",
    areaName: "Ward 1",
    panchayatName: "Saligrama",
    areaLat: 13.3409,
    areaLng: 74.7421,
    areaRadius: 1.5,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;

  const mockReport = {
    id: 42,
    description: "Large pile of mixed waste near bus stand",
    address: "Near Bus Stand, Saligrama, Udupi District",
    latitude: 13.3409,
    longitude: 74.7421,
    status: "cleaning" as const,
    photoUrl: null,
    cleanupPhotoUrl: null,
    assignedOfficerId: 999,
    reporterIp: "127.0.0.1",
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    updatedAt: new Date(),
  };

  const mockAnalytics: EmailAnalytics = {
    openReports: 7,
    resolvedThisWeek: 12,
    avgResponseHours: 4,
    panchayatName: "Saligrama",
  };

  const results: { email: string; status: "sent" | "error"; error?: string }[] = [];

  async function tryEmail(label: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ email: label, status: "sent" });
      logger.info({ label, to }, "Test email sent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ email: label, status: "error", error: msg });
      logger.warn({ label, to, err }, "Test email failed");
    }
  }

  await tryEmail("1_welcome_officer", () => sendWelcomeEmail(mockOfficer as any));
  await tryEmail("2_report_assigned", () => sendAssignmentEmail(mockOfficer as any, mockReport as any));
  await tryEmail("3_status_cleaning", () =>
    sendStatusUpdateEmail(to, "Anu Hegde", mockReport as any, mockOfficer.name, "cleaning", mockAnalytics)
  );
  await tryEmail("4_status_cleaned", () =>
    sendStatusUpdateEmail(to, "Anu Hegde", { ...mockReport, status: "cleaned" } as any, mockOfficer.name, "cleaned", mockAnalytics)
  );
  await tryEmail("5_otp_reset", () => sendOtpEmail(to, "847291"));
  await tryEmail("6_panchayat_admin_welcome", () =>
    sendPanchayatAdminWelcomeEmail({ name: "Anu Hegde", email: to, panchayatName: "Saligrama" })
  );
  await tryEmail("7_new_report_panchayat_alert", () =>
    sendNewReportToPanchayatAdmins(mockOfficer as any, mockReport as any, [{ email: to, name: "Anu Hegde" }])
  );
  await tryEmail("8_weekly_digest_panchayat", () =>
    sendWeeklyDigest({
      to,
      recipientName: "Anu Hegde",
      weekLabel: "16 Jun – 22 Jun 2025",
      stats: { total: 8, open: 3, resolved: 5, avgResponseHours: 6 },
      officerRows: [
        { name: "Rajshekhar M", ward: "Ward 1", pending: 1, resolvedThisWeek: 2 },
        { name: "Pradeep", ward: "Ward 2", pending: 0, resolvedThisWeek: 3 },
        { name: "Shivaraj Ramesh Naik", ward: "Ward 3", pending: 2, resolvedThisWeek: 0 },
      ],
      isControlCenter: false,
      panchayatName: "Saligrama",
    })
  );
  await tryEmail("9_weekly_digest_control_center", () =>
    sendWeeklyDigest({
      to,
      recipientName: "Control Centre Admin",
      weekLabel: "16 Jun – 22 Jun 2025",
      stats: { total: 24, open: 9, resolved: 15, avgResponseHours: 5 },
      panchayatRows: [
        { panchayat: "Saligrama", total: 8, open: 3, resolved: 5 },
        { panchayat: "Kundapur Town", total: 10, open: 4, resolved: 6 },
        { panchayat: "Karkala", total: 6, open: 2, resolved: 4 },
      ],
      isControlCenter: true,
    })
  );

  const allSent = results.every((r) => r.status === "sent");
  res.status(allSent ? 200 : 207).json({
    message: `${results.filter((r) => r.status === "sent").length}/${results.length} test emails dispatched to ${to}`,
    results,
  });
});

export default router;
