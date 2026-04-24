import { Router, type IRouter } from "express";
import { db, reportsTable, officersTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { sendAssignmentEmail } from "../lib/email";
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
import { findOfficerForLocation } from "../lib/geo";

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
    })
    .from(reportsTable)
    .where(sql`${reportsTable.status} IN ('reported', 'cleaning')`)
    .orderBy(sql`${reportsTable.createdAt} DESC`);

  res.json(spots);
});

router.get("/reports", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const query = ListReportsQueryParams.safeParse(req.query);
  const status = query.success ? query.data.status : undefined;
  const limit = query.success ? (query.data.limit ?? 50) : 50;
  const offset = query.success ? (query.data.offset ?? 0) : 0;

  let conditions: any[] = [];

  if (user.role === "officer" && user.officerId) {
    conditions.push(eq(reportsTable.assignedOfficerId, user.officerId));
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
    assignedOfficer: officer ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName } : null,
  }));

  res.json({ reports: formatted, total: countRow.count });
});

router.post("/reports", async (req, res): Promise<void> => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  const { latitude, longitude, imageUrl, address, description } = parsed.data;
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
      assignedOfficerId: officer?.id ?? null,
    })
    .returning();

  let assignedOfficer = null;
  if (officer) {
    assignedOfficer = { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName };
    sendAssignmentEmail(officer, report).catch((err) => logger.warn({ err }, "Unhandled error in assignment email"));
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
  res.json({
    ...report,
    assignedOfficer: officer ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName } : null,
  });
});

router.patch("/reports/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
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
    assignedOfficer: officerRow ? { id: officerRow.id, name: officerRow.name, email: officerRow.email, phone: officerRow.phone, areaName: officerRow.areaName } : null,
  });
});

export default router;
