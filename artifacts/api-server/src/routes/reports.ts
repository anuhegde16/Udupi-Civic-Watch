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
import { notifyAndPush, sendPushToReportSubscriptions } from "../lib/push";
import { analyseWastePhoto, toPublicImageUrl } from "../lib/waste-analysis";

const router: IRouter = Router();

// Strip citizen PII from all outbound report objects — never expose to API callers
function sanitizeReport<T extends { reporterEmail?: string | null; reporterIp?: string | null }>(
  report: T
): Omit<T, "reporterEmail" | "reporterIp"> {
  const { reporterEmail: _re, reporterIp: _ri, ...safe } = report;
  return safe;
}

const DUPLICATE_RADIUS_DEG = 0.000045; // ~5m at Udupi's latitude (13°N)
const RATE_LIMIT_HOURS = 1;
const RATE_LIMIT_MAX = 5;

router.get("/reports/stats/summary", async (req, res): Promise<void> => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(isNull(reportsTable.deletedAt));
  const [reported] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(isNull(reportsTable.deletedAt), eq(reportsTable.status, "reported")));
  const [cleaning] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(isNull(reportsTable.deletedAt), eq(reportsTable.status, "cleaning")));
  const [cleaned] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(isNull(reportsTable.deletedAt), eq(reportsTable.status, "cleaned")));
  const [last24hCount] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(isNull(reportsTable.deletedAt), gte(reportsTable.createdAt, last24h)));
  const [last7dCount] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(isNull(reportsTable.deletedAt), gte(reportsTable.createdAt, last7d)));

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
      cleanupImageUrl: reportsTable.cleanupImageUrl,
    })
    .from(reportsTable)
    .where(and(isNull(reportsTable.deletedAt), sql`${reportsTable.status} IN ('reported', 'cleaning', 'cleaned')`))
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

  let conditions: any[] = [isNull(reportsTable.deletedAt)];

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
    .where(and(...conditions))
    .orderBy(sql`${reportsTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(...conditions));

  const formatted = reports.map(({ report, officer }) => ({
    ...sanitizeReport(report),
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

  const { latitude, longitude, imageUrl, imageUrls: rawImageUrls, address, description, reporterEmail } = parsed.data;
  const reporterIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip || "";

  // Duplicate check within ~5m radius (active reports only), unless force=true
  const { force } = parsed.data;
  if (!force) {
    const existing = await db
      .select({ id: reportsTable.id, createdAt: reportsTable.createdAt })
      .from(reportsTable)
      .where(
        and(
          isNull(reportsTable.deletedAt),
          sql`${reportsTable.latitude} BETWEEN ${latitude - DUPLICATE_RADIUS_DEG} AND ${latitude + DUPLICATE_RADIUS_DEG}`,
          sql`${reportsTable.longitude} BETWEEN ${longitude - DUPLICATE_RADIUS_DEG} AND ${longitude + DUPLICATE_RADIUS_DEG}`,
          sql`${reportsTable.status} != 'cleaned'`,
          sql`${reportsTable.createdAt} > NOW() - INTERVAL '24 hours'`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({
        error: "Duplicate report",
        message: "A report already exists nearby.",
        existingReportId: existing[0].id,
        existingReportCreatedAt: existing[0].createdAt,
      });
      return;
    }
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

  // Resolve image data — prefer imageUrls array, fall back to legacy imageUrl string
  const resolvedImageUrls = (rawImageUrls && rawImageUrls.length > 0)
    ? rawImageUrls
    : (imageUrl ? [{ url: imageUrl, uploadedAt: new Date().toISOString() }] : null);
  const primaryImage = resolvedImageUrls?.[0] ?? null;
  const resolvedImageUrl = primaryImage?.url ?? null;

  // Derive timestamp from uploadedAt field; fall back to filename-encoded timestamp
  let imageUploadedAt: Date | null = null;
  if (primaryImage?.uploadedAt) {
    const d = new Date(primaryImage.uploadedAt);
    if (!isNaN(d.getTime())) imageUploadedAt = d;
  }
  if (!imageUploadedAt && resolvedImageUrl) {
    const filenameMatch = resolvedImageUrl.match(/\/uploads\/files\/(\d+)-[^/]+$/);
    if (filenameMatch?.[1]) {
      const ts = parseInt(filenameMatch[1], 10);
      if (!isNaN(ts) && ts > 0) imageUploadedAt = new Date(ts);
    }
  }

  const [report] = await db
    .insert(reportsTable)
    .values({
      imageUrl: resolvedImageUrl,
      imageUploadedAt,
      imageUrls: resolvedImageUrls ?? null,
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

  // Always notify control center about every new report regardless of assignment
  const ccRowsForNewReport = await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.role, ["control_center", "admin"]));
  const ccNewReportUserIds = ccRowsForNewReport.map((r) => r.id);
  const locationSuffix = report.address ? ` — ${report.address}` : "";
  const ccNotifBody = `New waste report #${report.id}${officer ? ` → ${officer.name}` : " (unassigned)"}${locationSuffix}`;
  if (ccNewReportUserIds.length > 0) {
    notifyAndPush(ccNewReportUserIds, {
      title: "New Waste Report",
      body: ccNotifBody,
      type: "new_report",
      reportId: report.id,
      url: `/admin/reports?report=${report.id}`,
    }).catch((err) => logger.warn({ err }, "CC new-report notify failed"));
  }

  if (officer) {
    assignedOfficer = { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName };

    // Collect user IDs to notify (field officer's user account + panchayat admins)
    const officerUserRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, officer.email));
    const officerUserIds = officerUserRows.map((r) => r.id);

    const panchayatAdminRows = officer.panchayatName
      ? await db
          .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(and(eq(usersTable.role, "panchayat_admin"), eq(usersTable.panchayatName, officer.panchayatName)))
      : [];
    const panchayatAdminUserIds = panchayatAdminRows.map((r) => r.id);

    // Separate body text: officer hears "assigned to you", admin hears officer name
    const officerNotifBody = `New waste report assigned to you${locationSuffix}. Tap to view details. (Report #${report.id})`;
    const adminNotifBody = `Report #${report.id} assigned to ${officer.name}${locationSuffix}`;

    // Notify the field officer and their panchayat admin(s) in parallel (fire-and-forget)
    Promise.allSettled([
      sendAssignmentEmail(officer, report),
      panchayatAdminRows.length > 0
        ? sendNewReportToPanchayatAdmins(officer, report, panchayatAdminRows.filter((a) => !!a.email) as { email: string; name: string }[])
        : Promise.resolve(),
      notifyAndPush(officerUserIds, {
        title: "New Report Assigned",
        body: officerNotifBody,
        type: "new_report",
        reportId: report.id,
        url: `/officer/report/${report.id}`,
      }),
      notifyAndPush(panchayatAdminUserIds, {
        title: "New Waste Report",
        body: adminNotifBody,
        type: "new_report",
        reportId: report.id,
        url: `/master/dashboard?report=${report.id}`,
      }),
    ]).catch((err) => logger.warn({ err }, "Error in new-report notifications"));
  }

  // Send acknowledgement to the reporter if they provided an email (fire-and-forget)
  if (reporterEmail) {
    sendReporterAcknowledgement(report, reporterEmail).catch((err) =>
      logger.warn({ err, reportId: report.id }, "Reporter acknowledgement email failed")
    );
  }

  // Fire-and-forget AI photo analysis — does not block the response
  if (resolvedImageUrl) {
    analyseWastePhoto(toPublicImageUrl(resolvedImageUrl))
      .then(async (result) => {
        if (!result) return;
        await db
          .update(reportsTable)
          .set({
            wasteTypes: result.wasteTypes,
            brandNames: result.brandNames,
            wasteSeverity: result.severity,
            photoAiAnalysedAt: new Date(),
          })
          .where(eq(reportsTable.id, report.id));
        logger.info({ reportId: report.id, severity: result.severity, wasteTypes: result.wasteTypes }, "AI photo analysis complete");
      })
      .catch((err) => logger.warn({ err, reportId: report.id }, "AI photo analysis fire-and-forget failed"));
  }

  res.status(201).json({ ...sanitizeReport(report), assignedOfficer });
});

router.get("/reports/:id/track", async (req, res): Promise<void> => {
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

  const { report, officer } = row;

  if (report.deletedAt) {
    res.status(410).json({ error: "archived", message: "This report has been archived." });
    return;
  }

  res.json({
    id: report.id,
    status: report.status,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    imageUrl: report.imageUrl,
    imageUrls: report.imageUrls ?? null,
    cleanupImageUrl: report.cleanupImageUrl,
    cleanupImageUrls: report.cleanupImageUrls ?? null,
    wardName: officer?.areaName ?? null,
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
  const isAdminOrPanchayat = user.role === "admin" || user.role === "control_center" || user.role === "panchayat_admin";
  const safeReport = sanitizeReport(report);
  res.json({
    ...safeReport,
    ...(isAdminOrPanchayat && report.reporterEmail ? { reporterEmail: report.reporterEmail } : {}),
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

  // Always fetch existing — needed for auth checks AND to capture old status for email deduplication
  const [existing] = await db.select().from(reportsTable).where(eq(reportsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  const oldStatus = existing.status;

  const isFieldOfficer = user.role === "officer" || user.role === "field_officer";
  if (isFieldOfficer) {
    if (existing.assignedOfficerId !== user.officerId) {
      res.status(403).json({ error: "Access denied: report is not assigned to you" });
      return;
    }
  } else if (user.role === "panchayat_admin") {
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

  const parsed = UpdateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  const updates: Record<string, any> = {};
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "cleaning" && !existing.cleaningStartedAt) {
      updates.cleaningStartedAt = new Date();
    }
    if (parsed.data.status === "cleaned" && !existing.cleanedAt) {
      updates.cleanedAt = new Date();
      if (!existing.cleaningStartedAt && !updates.cleaningStartedAt) {
        updates.cleaningStartedAt = new Date();
      }
    }
  }
  if (parsed.data.cleanupImageUrls && parsed.data.cleanupImageUrls.length > 0) {
    updates.cleanupImageUrls = parsed.data.cleanupImageUrls;
    updates.cleanupImageUrl = parsed.data.cleanupImageUrls[0].url;
  } else if (parsed.data.cleanupImageUrl !== undefined) {
    updates.cleanupImageUrl = parsed.data.cleanupImageUrl;
  }

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
    ...sanitizeReport(report),
    assignedOfficer: officerRow ? { id: officerRow.id, name: officerRow.name, email: officerRow.email, phone: officerRow.phone, areaName: officerRow.areaName, wardName: officerRow.areaName } : null,
  });

  // Notify the reporter only when status actually changes — prevents duplicate emails
  const newStatus = parsed.data.status;
  if (newStatus && newStatus !== oldStatus && (newStatus === "cleaning" || newStatus === "cleaned") && report.reporterEmail) {
    sendReporterStatusUpdate(report, report.reporterEmail, newStatus).catch((err) =>
      logger.warn({ err, reportId: report.id }, "Reporter status update email failed")
    );
  }

  // Notify citizen push subscribers (anonymous, linked to this report) on cleaning and cleaned
  if (newStatus === "cleaning" && newStatus !== oldStatus) {
    sendPushToReportSubscriptions(report.id, {
      title: "Cleanup Has Started 🧹",
      body: `A crew has started cleaning the waste you reported (#${report.id}). We'll let you know when it's done.`,
      type: "report_cleaning",
      reportId: report.id,
      url: `/track/${report.id}`,
    }, "cleaning").catch((err) => logger.warn({ err, reportId: report.id }, "Citizen cleaning push notification failed"));
  }

  if (newStatus === "cleaned" && newStatus !== oldStatus) {
    sendPushToReportSubscriptions(report.id, {
      title: "Your Report Has Been Cleaned! ✓",
      body: `Report #${report.id} has been cleaned. Thank you for helping keep Udupi clean.`,
      type: "report_cleaned",
      reportId: report.id,
      url: `/track/${report.id}`,
    }, "cleaned").catch((err) => logger.warn({ err, reportId: report.id }, "Citizen cleaned push notification failed"));
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
              .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
              .from(usersTable)
              .where(and(eq(usersTable.role, "panchayat_admin"), eq(usersTable.panchayatName, panchayatName)))
          : [];

        // Control center also gets notified when a report is fully cleaned
        const ccUsers = newStatus === "cleaned"
          ? await db
              .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
              .from(usersTable)
              .where(inArray(usersTable.role, ["control_center", "admin"]))
          : [];

        // Push notifications for status change — panchayat admins + control center (both for any status change)
        const statusLabel = newStatus === "cleaning" ? "Cleaning Started" : "Report Cleaned ✓";
        const pushBody = `Report #${report.id} — ${officerName} ${newStatus === "cleaning" ? "have initiated cleaning" : "marked as cleaned"}`;

        // Control center gets both cleaning and cleaned events
        const ccUsersForPush = newStatus === "cleaning"
          ? await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.role, ["control_center", "admin"]))
          : ccUsers;

        const panchayatAdminIds = panchayatAdmins.map((r) => r.id);
        const ccUserIds = [...new Set([...ccUsersForPush.map((r) => r.id)])];

        await Promise.allSettled([
          panchayatAdminIds.length > 0 ? notifyAndPush(panchayatAdminIds, {
            title: statusLabel,
            body: pushBody,
            type: `status_${newStatus}`,
            reportId: report.id,
            url: `/master/dashboard?report=${report.id}`,
          }) : Promise.resolve(),
          ccUserIds.length > 0 ? notifyAndPush(ccUserIds, {
            title: statusLabel,
            body: pushBody,
            type: `status_${newStatus}`,
            reportId: report.id,
            url: `/admin/reports?report=${report.id}`,
          }) : Promise.resolve(),
        ]);

        // Also notify the field officer (so they have a record in their bell)
        const officerUserRows = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.email, officerRow.email));
        if (officerUserRows.length > 0) {
          notifyAndPush(officerUserRows.map((r) => r.id), {
            title: statusLabel,
            body: pushBody,
            type: `status_${newStatus}`,
            reportId: report.id,
            url: `/officer/report/${report.id}`,
          }).catch((err) => logger.warn({ err }, "Officer self-notify push failed"));
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

        // Send to panchayat admins and control center separately so each gets the correct CTA URL
        await Promise.all([
          ...panchayatAdmins
            .filter((r) => !!r.email)
            .map((r) =>
              sendStatusUpdateEmail(r.email!, r.name ?? "Admin", report, officerName, newStatus, analytics, false).catch(
                (err) => logger.warn({ err, to: r.email }, "Status email failed")
              )
            ),
          ...ccUsers
            .filter((r) => !!r.email)
            .map((r) =>
              sendStatusUpdateEmail(r.email!, r.name ?? "Admin", report, officerName, newStatus, analytics, true).catch(
                (err) => logger.warn({ err, to: r.email }, "Status email failed")
              )
            ),
        ]);
      } catch (err) {
        logger.warn({ err }, "Error sending status-change notifications");
      }
    })();
  }
});

export default router;
