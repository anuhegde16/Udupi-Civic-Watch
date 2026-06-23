import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, reportsTable, officersTable, usersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
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

  const formatted = reports.map(({ report, officer }) => {
    const { reporterEmail: _re, reporterIp: _ri, ...safeReport } = report;
    return {
      ...safeReport,
      assignedOfficer: officer ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName } : null,
    };
  });

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

  const { reporterEmail: _re, reporterIp: _ri, ...safeReport } = report;
  res.json({
    ...safeReport,
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
