import { Router, type IRouter } from "express";
import { db, reportsTable, officersTable, usersTable } from "@workspace/db";
import { eq, sql, and, gte, inArray, isNull } from "drizzle-orm";
import { sendAssignmentEmail, sendStatusUpdateEmail, sendNewReportToPanchayatAdmins, sendReporterAcknowledgement, sendReporterStatusUpdate, type EmailAnalytics } from "../lib/email";
import { logger } from "../lib/logger";
import {
  CreateReportBody,
  UpdateReportBody,
  GetReportParams,
  UpdateReportParams,
  TrackReportParams,
  ListReportsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, getSessionUser } from "../lib/auth";
import { findOfficerForLocation, isWithinServiceArea } from "../lib/geo";

const router: IRouter = Router();

const DUPLICATE_RADIUS_DEG = 0.0004;
const RATE_LIMIT_HOURS = 1;
const RATE_LIMIT_MAX = 5;

router.get("/reports/stats/summary", async (req, res): Promise<void> => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable);
  const [reported] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(eq(reportsTable.status, "reported"));
  const [cleaning] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(eq(reportsTable.status, "cleaning"));
  const [cleaned] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(eq(reportsTable.status, "cleaned"));
  const [last24hCount] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(gte(reportsTable.createdAt, last24h));
  const [last7dCount] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(gte(reportsTable.createdAt, last7d));

  res.json({
    total: total.count,
    reported: reported.count,
    cleaning: cleaning.count,
    cleaned: cleaned.count,
    last24h: last24hCount.count,
    last7d: last7dCount.count,
  });
});

router.get("/reports/public/map", async (req, res): Promise<void> => {
  const spots = await db
    .select({
      id: reportsTable.id,
      latitude: reportsTable.latitude,
      longitude: reportsTable.longitude,
      status: reportsTable.status,
      description: reportsTable.description,
      address: reportsTable.address,
      createdAt: reportsTable.createdAt,
      imageUrl: reportsTable.imageUrl,
    })
    .from(reportsTable)
    .where(sql`${reportsTable.status} IN ('reported', 'cleaning', 'cleaned')`)
    .orderBy(sql`${reportsTable.createdAt} DESC`);

  res.json(spots);
});

router.get("/reports", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const query = ListReportsQueryParams.safeParse(req.query);
  const status = query.success ? query.data.status : undefined;
  const limit = query.success ? (query.data.limit ?? 50) : 50;
  const offset = query.success ? (query.data.offset ?? 0) : 0;

  const isFieldOfficer = user.role === "officer" || user.role === "field_officer";
  const isPanchayatAdmin = user.role === "panchayat_admin";

  let conditions: any[] = [];

  if (isFieldOfficer && user.officerId) {
    conditions.push(eq(reportsTable.assignedOfficerId, user.officerId));
  } else if (isPanchayatAdmin) {
    if (!user.panchayatName) {
      res.json({ reports: [], total: 0 });
      return;
    }
    const panchayatOfficers = await db
      .select({ id: officersTable.id })
      .from(officersTable)
      .where(and(isNull(officersTable.deletedAt), eq(officersTable.panchayatName, user.panchayatName)));
    if (panchayatOfficers.length === 0) {
      res.json({ reports: [], total: 0 });
      return;
    }
    conditions.push(inArray(reportsTable.assignedOfficerId, panchayatOfficers.map((o) => o.id)));
  }

  if (status) {
    conditions.push(eq(reportsTable.status, status));
  }

  const reports = await db
    .select({
      report: reportsTable,
      officer: officersTable,
    })
    .from(reportsTable)
    .leftJoin(officersTable, eq(reportsTable.assignedOfficerId, officersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${reportsTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(conditions.length > 0 ? and(...conditions) : undefined);

  const formatted = reports.map(({ report, officer }) => ({
    ...report,
    assignedOfficer: officer ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName } : null,
  }));

  res.json({ reports: formatted, total: countRow.count });
});

router.post("/reports", async (req, res): Promise<void> => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  const { latitude, longitude, imageUrl, address, description, reporterEmail } = parsed.data;
  const reporterIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip || "";

  // Duplicate check within ~50m radius
  const existing = await db
    .select()
    .from(reportsTable)
    .where(
      and(
        sql`${reportsTable.latitude} BETWEEN ${latitude - DUPLICATE_RADIUS_DEG} AND ${latitude + DUPLICATE_RADIUS_DEG}`,
        sql`${reportsTable.longitude} BETWEEN ${longitude - DUPLICATE_RADIUS_DEG} AND ${longitude + DUPLICATE_RADIUS_DEG}`,
        sql`${reportsTable.status} != 'cleaned'`,
        sql`${reportsTable.createdAt} > NOW() - INTERVAL '24 hours'`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Duplicate report", message: "A report already exists nearby. Your report may have already been submitted." });
    return;
  }

  // Rate limit: max 5 reports per IP per hour
  const recentCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.reporterIp, reporterIp),
        sql`${reportsTable.createdAt} > NOW() - INTERVAL '${sql.raw(RATE_LIMIT_HOURS.toString())} hours'`
      )
    );

  if ((recentCount[0]?.count ?? 0) >= RATE_LIMIT_MAX) {
    res.status(429).json({ error: "Rate limit exceeded", message: "You have submitted too many reports recently. Please try again later." });
    return;
  }

  // Geo-fence: reject if outside the defined service area
  if (!isWithinServiceArea(latitude, longitude)) {
    res.status(422).json({ error: "Outside service area", message: "This location is outside the Saligrama service area. Reports can only be submitted within the designated zone." });
    return;
  }

  const officer = await findOfficerForLocation(latitude, longitude);

  const [report] = await db
    .insert(reportsTable)
    .values({
      imageUrl: imageUrl ?? null,
      latitude,
      longitude,
      address: address ?? null,
      description: description ?? null,
      status: "reported",
      reporterIp,
      reporterEmail: reporterEmail ?? null,
      assignedOfficerId: officer?.id ?? null,
    })
    .returning();

  let assignedOfficer = null;
  if (officer) {
    assignedOfficer = { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName };

    // Notify the field officer and their panchayat admin(s) in parallel (fire-and-forget)
    Promise.allSettled([
      sendAssignmentEmail(officer, report),
      officer.panchayatName
        ? db
            .select({ email: usersTable.email, name: usersTable.name })
            .from(usersTable)
            .where(and(eq(usersTable.role, "panchayat_admin"), eq(usersTable.panchayatName, officer.panchayatName)))
            .then((admins) => sendNewReportToPanchayatAdmins(officer, report, admins.filter((a) => !!a.email) as { email: string; name: string }[]))
        : Promise.resolve(),
    ]).catch((err) => logger.warn({ err }, "Error in new-report email notifications"));
  }

  // Send acknowledgement to the reporter if they provided an email (fire-and-forget)
  if (reporterEmail) {
    sendReporterAcknowledgement(report, reporterEmail).catch((err) =>
      logger.warn({ err, reportId: report.id }, "Reporter acknowledgement email failed")
    );
  }

  res.status(201).json({ ...report, assignedOfficer });
});

router.get("/reports/:id/track", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, id)).limit(1);

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  res.json({
    id: report.id,
    status: report.status,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    cleanupImageUrl: report.cleanupImageUrl,
  });
});

router.get("/reports/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [row] = await db
    .select({ report: reportsTable, officer: officersTable })
    .from(reportsTable)
    .leftJoin(officersTable, eq(reportsTable.assignedOfficerId, officersTable.id))
    .where(eq(reportsTable.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const isFieldOfficer = user.role === "officer" || user.role === "field_officer";
  if (isFieldOfficer && user.officerId && row.report.assignedOfficerId !== user.officerId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (user.role === "panchayat_admin") {
    if (!user.panchayatName || !row.report.assignedOfficerId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const [assignedOfficer] = await db
      .select({ panchayatName: officersTable.panchayatName })
      .from(officersTable)
      .where(eq(officersTable.id, row.report.assignedOfficerId))
      .limit(1);
    if (!assignedOfficer || assignedOfficer.panchayatName !== user.panchayatName) {
      res.status(403).json({ error: "Access denied: report is not in your panchayat" });
      return;
    }
  }

  const { report, officer } = row;
  res.json({
    ...report,
    assignedOfficer: officer ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName } : null,
  });
});

router.patch("/reports/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const isFieldOfficer = user.role === "officer" || user.role === "field_officer";
  if (isFieldOfficer || user.role === "panchayat_admin") {
    const [existing] = await db.select().from(reportsTable).where(eq(reportsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    if (isFieldOfficer) {
      if (existing.assignedOfficerId !== user.officerId) {
        res.status(403).json({ error: "Access denied: report is not assigned to you" });
        return;
      }
    } else {
      // panchayat_admin
      if (!user.panchayatName || !existing.assignedOfficerId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      const [assignedOfficer] = await db
        .select({ panchayatName: officersTable.panchayatName })
        .from(officersTable)
        .where(eq(officersTable.id, existing.assignedOfficerId))
        .limit(1);
      if (!assignedOfficer || assignedOfficer.panchayatName !== user.panchayatName) {
        res.status(403).json({ error: "Access denied: report is not in your panchayat" });
        return;
      }
    }
  }

  const parsed = UpdateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  const updates: Record<string, any> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.cleanupImageUrl !== undefined) updates.cleanupImageUrl = parsed.data.cleanupImageUrl;

  const [report] = await db
    .update(reportsTable)
    .set(updates)
    .where(eq(reportsTable.id, id))
    .returning();

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const [officerRow] = report.assignedOfficerId
    ? await db.select().from(officersTable).where(eq(officersTable.id, report.assignedOfficerId)).limit(1)
    : [];

  res.json({
    ...report,
    assignedOfficer: officerRow ? { id: officerRow.id, name: officerRow.name, email: officerRow.email, phone: officerRow.phone, areaName: officerRow.areaName, wardName: officerRow.areaName } : null,
  });

  // Notify the reporter if they provided an email and status changed (fire-and-forget)
  const newStatus = parsed.data.status;
  if ((newStatus === "cleaning" || newStatus === "cleaned") && report.reporterEmail) {
    sendReporterStatusUpdate(report, report.reporterEmail, newStatus).catch((err) =>
      logger.warn({ err, reportId: report.id }, "Reporter status update email failed")
    );
  }

  // Fire-and-forget status-change notifications
  if ((newStatus === "cleaning" || newStatus === "cleaned") && officerRow) {
    const officerName = officerRow.name;
    const panchayatName = officerRow.panchayatName;

    (async () => {
      try {
        // Panchayat admins for this officer's panchayat
        const panchayatAdmins = panchayatName
          ? await db
              .select({ email: usersTable.email, name: usersTable.name })
              .from(usersTable)
              .where(and(eq(usersTable.role, "panchayat_admin"), eq(usersTable.panchayatName, panchayatName)))
          : [];

        const recipients = [...panchayatAdmins];

        // Control center also gets notified when a report is fully cleaned
        if (newStatus === "cleaned") {
          const ccUsers = await db
            .select({ email: usersTable.email, name: usersTable.name })
            .from(usersTable)
            .where(eq(usersTable.role, "control_center"));
          recipients.push(...ccUsers);
        }

        // Compute analytics snapshot for this panchayat
        let analytics: EmailAnalytics | undefined;
        if (panchayatName) {
          try {
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Officers in this panchayat
            const panchayatOfficers = await db
              .select({ id: officersTable.id })
              .from(officersTable)
              .where(eq(officersTable.panchayatName, panchayatName));

            const officerIds = panchayatOfficers.map((o) => o.id);

            if (officerIds.length > 0) {
              const [openRow] = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(reportsTable)
                .where(and(inArray(reportsTable.assignedOfficerId, officerIds), eq(reportsTable.status, "reported")));

              const [resolvedRow] = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(reportsTable)
                .where(
                  and(
                    inArray(reportsTable.assignedOfficerId, officerIds),
                    eq(reportsTable.status, "cleaned"),
                    gte(reportsTable.updatedAt, oneWeekAgo)
                  )
                );

              // Average hours from report creation to cleaned status (for reports resolved in last 30 days)
              const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
              const [avgRow] = await db
                .select({
                  avg: sql<number>`round(avg(extract(epoch from (updated_at - created_at)) / 3600))::int`,
                })
                .from(reportsTable)
                .where(
                  and(
                    inArray(reportsTable.assignedOfficerId, officerIds),
                    eq(reportsTable.status, "cleaned"),
                    gte(reportsTable.updatedAt, thirtyDaysAgo)
                  )
                );

              analytics = {
                openReports: openRow?.count ?? 0,
                resolvedThisWeek: resolvedRow?.count ?? 0,
                avgResponseHours: avgRow?.avg ?? 0,
                panchayatName,
              };
            }
          } catch (err) {
            logger.warn({ err }, "Failed to compute analytics for status email — sending without it");
          }
        }

        await Promise.all(
          recipients
            .filter((r) => !!r.email)
            .map((r) =>
              sendStatusUpdateEmail(r.email!, r.name ?? "Admin", report, officerName, newStatus, analytics).catch(
                (err) => logger.warn({ err, to: r.email }, "Status email failed")
              )
            )
        );
      } catch (err) {
        logger.warn({ err }, "Error sending status-change notifications");
      }
    })();
  }
});

export default router;
