import { Router, type IRouter } from "express";
import { db, officersTable, reportsTable } from "@workspace/db";
import { eq, sql, and, isNull, isNotNull } from "drizzle-orm";
import { requirePanchayatAdmin } from "../lib/auth";
import geofencesData from "../data/geofences.json";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const wardNames: string[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "ward")
  .map((f) => (f.properties as any)?.name ?? "");

router.get("/panchayat/wards", requirePanchayatAdmin, async (req, res): Promise<void> => {
  res.json({ wards: wardNames });
});

router.get("/panchayat/officers", requirePanchayatAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.panchayatName) {
    res.json({ officers: [], total: 0 });
    return;
  }

  const officers = await db
    .select()
    .from(officersTable)
    .where(and(eq(officersTable.panchayatName, user.panchayatName), isNull(officersTable.deletedAt)))
    .orderBy(officersTable.createdAt);

  const withCounts = await Promise.all(
    officers.map(async (officer) => {
      const [total] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(and(eq(reportsTable.assignedOfficerId, officer.id), isNull(reportsTable.deletedAt)));
      const [pending] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(and(eq(reportsTable.assignedOfficerId, officer.id), isNull(reportsTable.deletedAt), sql`${reportsTable.status} != 'cleaned'`));
      return {
        ...officer,
        reportCount: total.count,
        pendingCount: pending.count,
      };
    })
  );

  res.json({ officers: withCounts, total: withCounts.length });
});

router.get("/panchayat/reports", requirePanchayatAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.panchayatName) {
    res.json({ reports: [], total: 0 });
    return;
  }

  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const archived = req.query.archived === "true";

  const officerRows = await db
    .select({ id: officersTable.id })
    .from(officersTable)
    .where(and(eq(officersTable.panchayatName, user.panchayatName), isNull(officersTable.deletedAt)));

  if (officerRows.length === 0) {
    res.json({ reports: [], total: 0 });
    return;
  }

  const officerIds = officerRows.map((o) => o.id);

  const conditions: any[] = [
    sql`${reportsTable.assignedOfficerId} = ANY(ARRAY[${sql.join(officerIds.map(id => sql`${id}::int`), sql`, `)}])`,
  ];
  if (archived) {
    conditions.push(isNotNull(reportsTable.deletedAt));
  } else {
    conditions.push(isNull(reportsTable.deletedAt));
    if (status) conditions.push(eq(reportsTable.status, status));
  }

  const reports = await db
    .select({ report: reportsTable, officer: officersTable })
    .from(reportsTable)
    .leftJoin(officersTable, eq(reportsTable.assignedOfficerId, officersTable.id))
    .where(and(...conditions))
    .orderBy(sql`${reportsTable.createdAt} DESC`)
    .limit(200);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(and(...conditions));

  const formatted = reports.map(({ report, officer }) => {
    const { reporterIp: _ri, ...safeReport } = report;
    return {
      ...safeReport,
      assignedOfficer: officer
        ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName }
        : null,
    };
  });

  res.json({ reports: formatted, total: countRow.count });
});

router.delete("/panchayat/reports/:id", requirePanchayatAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.panchayatName) {
    res.status(403).json({ error: "No panchayat assigned to this account" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const officerRows = await db
    .select({ id: officersTable.id })
    .from(officersTable)
    .where(and(eq(officersTable.panchayatName, user.panchayatName), isNull(officersTable.deletedAt)));
  const officerIds = officerRows.map((o) => o.id);

  if (officerIds.length === 0) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  const [report] = await db
    .select({ id: reportsTable.id, assignedOfficerId: reportsTable.assignedOfficerId, deletedAt: reportsTable.deletedAt })
    .from(reportsTable)
    .where(eq(reportsTable.id, id))
    .limit(1);

  if (!report || report.assignedOfficerId === null || !officerIds.includes(report.assignedOfficerId)) {
    res.status(404).json({ error: "Report not found" });
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

  logger.info({ reportId: id, panchayatName: user.panchayatName }, "Report archived (soft-deleted) by panchayat admin");
  res.json({ success: true, id });
});

router.get("/panchayat/stats", requirePanchayatAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.panchayatName) {
    res.json({ total: 0, reported: 0, cleaning: 0, cleaned: 0, wardStats: [] });
    return;
  }

  const officerRows = await db
    .select()
    .from(officersTable)
    .where(and(eq(officersTable.panchayatName, user.panchayatName), isNull(officersTable.deletedAt)));

  if (officerRows.length === 0) {
    res.json({ total: 0, reported: 0, cleaning: 0, cleaned: 0, wardStats: [] });
    return;
  }

  const officerIds = officerRows.map((o) => o.id);
  const inOfficers = sql`${reportsTable.assignedOfficerId} = ANY(ARRAY[${sql.join(officerIds.map(id => sql`${id}::int`), sql`, `)}])`;
  const activeFilter = and(inOfficers, isNull(reportsTable.deletedAt));

  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(activeFilter);
  const [reported] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(activeFilter, eq(reportsTable.status, "reported")));
  const [cleaning] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(activeFilter, eq(reportsTable.status, "cleaning")));
  const [cleaned] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(activeFilter, eq(reportsTable.status, "cleaned")));

  const wardStats = await Promise.all(
    officerRows.map(async (o) => {
      const officerActive = and(eq(reportsTable.assignedOfficerId, o.id), isNull(reportsTable.deletedAt));
      const [totalRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(officerActive);
      const [pendingRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(and(officerActive, sql`${reportsTable.status} != 'cleaned'`));
      return {
        wardName: o.areaName ?? "Unassigned",
        officerName: o.name,
        officerId: o.id,
        reportCount: totalRow.count,
        pendingCount: pendingRow.count,
      };
    })
  );

  res.json({
    total: total.count,
    reported: reported.count,
    cleaning: cleaning.count,
    cleaned: cleaned.count,
    wardStats,
  });
});

router.get("/panchayat/analytics", requirePanchayatAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.panchayatName) {
    res.json({ dailyTrend: [], officerLeaderboard: [], hotspots: [], recentReports: [] });
    return;
  }

  const officerRows = await db
    .select()
    .from(officersTable)
    .where(and(eq(officersTable.panchayatName, user.panchayatName), isNull(officersTable.deletedAt)));

  if (officerRows.length === 0) {
    res.json({ dailyTrend: [], officerLeaderboard: [], hotspots: [], recentReports: [] });
    return;
  }

  const officerIds = officerRows.map((o) => o.id);
  const inOfficers = sql`${reportsTable.assignedOfficerId} = ANY(ARRAY[${sql.join(officerIds.map((id) => sql`${id}::int`), sql`, `)}])`;
  const activeFilter = and(inOfficers, isNull(reportsTable.deletedAt));

  // 7-day daily trend
  const dailyRows = await db
    .select({
      date: sql<string>`DATE(${reportsTable.createdAt})::text`,
      status: reportsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(reportsTable)
    .where(and(activeFilter, sql`${reportsTable.createdAt} >= NOW() - INTERVAL '7 days'`))
    .groupBy(sql`DATE(${reportsTable.createdAt})`, reportsTable.status)
    .orderBy(sql`DATE(${reportsTable.createdAt})`);

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  const dailyTrend = last7Days.map((date) => {
    const rows = dailyRows.filter((r) => r.date === date);
    return {
      date,
      reported: rows.find((r) => r.status === "reported")?.count ?? 0,
      cleaning: rows.find((r) => r.status === "cleaning")?.count ?? 0,
      cleaned: rows.find((r) => r.status === "cleaned")?.count ?? 0,
      total: rows.reduce((sum, r) => sum + r.count, 0),
    };
  });

  // Officer leaderboard
  const officerLeaderboard = await Promise.all(
    officerRows.map(async (o) => {
      const officerActive = and(eq(reportsTable.assignedOfficerId, o.id), isNull(reportsTable.deletedAt));
      const [total] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(officerActive);
      const [cleaned] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(and(officerActive, eq(reportsTable.status, "cleaned")));
      const [pending] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(and(officerActive, sql`${reportsTable.status} != 'cleaned'`));
      return {
        id: o.id,
        name: o.name,
        areaName: o.areaName ?? null,
        total: total.count,
        cleaned: cleaned.count,
        pending: pending.count,
        resolutionRate: total.count > 0 ? Math.round((cleaned.count / total.count) * 100) : 0,
      };
    })
  );
  officerLeaderboard.sort((a, b) => b.cleaned - a.cleaned);

  // Hotspots — group by lat/lng rounded to 3 decimals (~100 m precision)
  const hotspots = await db
    .select({
      lat: sql<number>`ROUND(${reportsTable.latitude}::numeric, 3)::float`,
      lng: sql<number>`ROUND(${reportsTable.longitude}::numeric, 3)::float`,
      count: sql<number>`count(*)::int`,
      address: sql<string | null>`MAX(${reportsTable.address})`,
    })
    .from(reportsTable)
    .where(activeFilter)
    .groupBy(
      sql`ROUND(${reportsTable.latitude}::numeric, 3)`,
      sql`ROUND(${reportsTable.longitude}::numeric, 3)`
    )
    .having(sql`count(*) > 1`)
    .orderBy(sql`count(*) DESC`)
    .limit(8);

  // Recent reports
  const recentRows = await db
    .select({ report: reportsTable, officer: officersTable })
    .from(reportsTable)
    .leftJoin(officersTable, eq(reportsTable.assignedOfficerId, officersTable.id))
    .where(activeFilter)
    .orderBy(sql`${reportsTable.createdAt} DESC`)
    .limit(10);

  const recentReports = recentRows.map(({ report, officer }) => ({
    ...report,
    assignedOfficer: officer ? { id: officer.id, name: officer.name, areaName: officer.areaName } : null,
  }));

  res.json({ dailyTrend, officerLeaderboard, hotspots, recentReports });
});

export default router;
