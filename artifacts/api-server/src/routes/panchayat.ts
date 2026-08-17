import { Router, type IRouter } from "express";
import { db, officersTable, reportsTable } from "@workspace/db";
import { eq, sql, and, isNull, isNotNull, gte, lte } from "drizzle-orm";
import { requirePanchayatAdmin } from "../lib/auth";
import geofencesData from "../data/geofences.json";
import { logger } from "../lib/logger";
import { generateInsightNarrative } from "../lib/smart-insights";
import { inUdupi, udupiWardRings, udupiBox, pointInPolygon as pip } from "../lib/geo";

const router: IRouter = Router();

const wardNames: string[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "ward")
  .map((f) => (f.properties as any)?.name ?? "");

router.get("/panchayat/wards", requirePanchayatAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const panchayatWards =
    user?.panchayatName === "Udupi"
      ? wardNames.filter((n) => n.startsWith("Udupi Ward"))
      : wardNames.filter((n) => !n.startsWith("Udupi Ward"));
  res.json({ wards: panchayatWards });
});

router.get("/panchayat/officers", requirePanchayatAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.panchayatName) {
    res.json({ officers: [], total: 0 });
    return;
  }

  // Udupi uses the supervisors table (multi-ward per supervisor, no officers rows).
  // Compute per-ward report counts via geographic PiP against active reports.
  if (user.panchayatName === "Udupi") {
    const { minLat, maxLat, minLng, maxLng } = udupiBox;
    const [svRows, rawReports] = await Promise.all([
      db.execute(sql`
        SELECT id, name, phone, panchayat_name, ward_names, created_at
        FROM supervisors
        WHERE panchayat_name = 'Udupi'
        ORDER BY id
      `),
      db
        .select({ id: reportsTable.id, latitude: reportsTable.latitude, longitude: reportsTable.longitude, status: reportsTable.status })
        .from(reportsTable)
        .where(
          and(
            sql`${reportsTable.latitude}  BETWEEN ${minLat} AND ${maxLat}`,
            sql`${reportsTable.longitude} BETWEEN ${minLng} AND ${maxLng}`,
            isNull(reportsTable.deletedAt),
          ),
        ),
    ]);
    const activeReports = rawReports.filter((r) => inUdupi(r.latitude, r.longitude));

    const expanded: any[] = [];
    for (const sv of svRows.rows as any[]) {
      const wards: string[] = Array.isArray(sv.ward_names)
        ? sv.ward_names
        : (JSON.parse(sv.ward_names ?? "[]") as string[]);
      for (const wn of wards) {
        const m = (wn as string).match(/^Ward (\d+)\//);
        if (!m) continue;
        const areaName = `Udupi Ward ${m[1]}`;
        const wardRing = udupiWardRings.find((w) => w.name === areaName)?.ring;
        const wardReports = wardRing
          ? activeReports.filter((r) => pip(r.latitude, r.longitude, wardRing))
          : [];
        expanded.push({
          id: sv.id,
          name: sv.name,
          email: `${sv.phone}@phone.local`,
          phone: sv.phone,
          areaName,
          panchayatName: "Udupi",
          reportCount: wardReports.length,
          pendingCount: wardReports.filter((r) => r.status !== "cleaned").length,
          createdAt: sv.created_at,
        });
      }
    }
    res.json({ officers: expanded, total: expanded.length });
    return;
  }

  const officers = await db
    .select()
    .from(officersTable)
    .where(and(eq(officersTable.panchayatName, user.panchayatName), isNull(officersTable.deletedAt)))
    .orderBy(officersTable.createdAt);

  // One GROUP BY instead of 2N parallel COUNT queries — collapses from 20 DB
  // round-trips (for 10 officers) to a single aggregation.
  if (officers.length === 0) {
    res.json({ officers: [], total: 0 });
    return;
  }
  const officerIds = officers.map((o) => o.id);
  const countRows = await db.execute(sql`
    SELECT
      assigned_officer_id,
      COUNT(*)::int                                        AS total_count,
      COUNT(*) FILTER (WHERE status != 'cleaned')::int     AS pending_count
    FROM reports
    WHERE deleted_at IS NULL
      AND assigned_officer_id = ANY(ARRAY[${sql.join(officerIds.map((id) => sql`${id}`), sql`, `)}]::int[])
    GROUP BY assigned_officer_id
  `);
  const countMap = new Map<number, { total: number; pending: number }>();
  for (const row of countRows.rows as any[]) {
    countMap.set(Number(row.assigned_officer_id), {
      total:   row.total_count,
      pending: row.pending_count,
    });
  }

  const withCounts = officers.map((officer) => {
    const counts = countMap.get(officer.id) ?? { total: 0, pending: 0 };
    return { ...officer, reportCount: counts.total, pendingCount: counts.pending };
  });

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
  const fromDate = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const toDate   = typeof req.query.to   === "string" ? new Date(req.query.to)   : undefined;

  // Udupi: reports aren't assigned to officers — use geographic bounding-box + PiP filter
  if (user.panchayatName === "Udupi") {
    const { minLat, maxLat, minLng, maxLng } = udupiBox;
    const boxConds: any[] = [
      sql`${reportsTable.latitude}  BETWEEN ${minLat} AND ${maxLat}`,
      sql`${reportsTable.longitude} BETWEEN ${minLng} AND ${maxLng}`,
    ];
    if (archived) {
      boxConds.push(isNotNull(reportsTable.deletedAt));
    } else {
      boxConds.push(isNull(reportsTable.deletedAt));
      if (status) boxConds.push(eq(reportsTable.status, status));
    }
    if (fromDate && !isNaN(fromDate.getTime())) boxConds.push(gte(reportsTable.createdAt, fromDate));
    if (toDate   && !isNaN(toDate.getTime()))   boxConds.push(lte(reportsTable.createdAt, toDate));
    const rawRows = await db
      .select({ report: reportsTable })
      .from(reportsTable)
      .where(and(...boxConds))
      .orderBy(sql`${reportsTable.createdAt} DESC`)
      .limit(500);

    const inArea = rawRows.filter(({ report }) => inUdupi(report.latitude, report.longitude));
    const formatted = inArea.slice(0, 200).map(({ report }) => {
      const { reporterIp: _ri, ...safeReport } = report;
      // Annotate each report with the ward it falls inside so the frontend can
      // filter ward-level slide-out reports without knowing officer IDs.
      const wardMatch = udupiWardRings.find(({ ring }) => pip(report.latitude, report.longitude, ring));
      return { ...safeReport, assignedOfficer: null, geographicWardName: wardMatch?.name ?? null };
    });
    res.json({ reports: formatted, total: inArea.length });
    return;
  }

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
  if (fromDate && !isNaN(fromDate.getTime())) conditions.push(gte(reportsTable.createdAt, fromDate));
  if (toDate   && !isNaN(toDate.getTime()))   conditions.push(lte(reportsTable.createdAt, toDate));

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

  // Udupi: authorize by geographic containment (no officers rows to check against)
  if (user.panchayatName === "Udupi") {
    const [report] = await db
      .select({ id: reportsTable.id, latitude: reportsTable.latitude, longitude: reportsTable.longitude, deletedAt: reportsTable.deletedAt })
      .from(reportsTable)
      .where(eq(reportsTable.id, id))
      .limit(1);

    if (!report || !inUdupi(report.latitude, report.longitude)) {
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

    logger.info({ reportId: id, panchayatName: "Udupi" }, "Report archived (soft-deleted) by Udupi panchayat admin");
    res.json({ success: true, id });
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

  // Udupi: geographic filtering — supervisors, not officers
  if (user.panchayatName === "Udupi") {
    const { minLat, maxLat, minLng, maxLng } = udupiBox;
    const rawAll = await db
      .select()
      .from(reportsTable)
      .where(
        and(
          sql`${reportsTable.latitude}  BETWEEN ${minLat} AND ${maxLat}`,
          sql`${reportsTable.longitude} BETWEEN ${minLng} AND ${maxLng}`,
          isNull(reportsTable.deletedAt),
        ),
      );
    const activeReports = rawAll.filter((r) => inUdupi(r.latitude, r.longitude));

    const total    = activeReports.length;
    const reported = activeReports.filter((r) => r.status === "reported").length;
    const cleaning = activeReports.filter((r) => r.status === "cleaning").length;
    const cleaned  = activeReports.filter((r) => r.status === "cleaned").length;

    const svRows = await db.execute(sql`
      SELECT id, name, phone, ward_names FROM supervisors WHERE panchayat_name = 'Udupi' ORDER BY id
    `);
    const wardStats: any[] = [];
    for (const sv of svRows.rows as any[]) {
      const wards: string[] = Array.isArray(sv.ward_names)
        ? sv.ward_names
        : (JSON.parse(sv.ward_names ?? "[]") as string[]);
      for (const wn of wards) {
        const m = (wn as string).match(/^Ward (\d+)\//);
        if (!m) continue;
        const wardName = `Udupi Ward ${m[1]}`;
        const wardRing = udupiWardRings.find((w) => w.name === wardName)?.ring;
        const wardReports = wardRing
          ? activeReports.filter((r) => pip(r.latitude, r.longitude, wardRing))
          : [];
        wardStats.push({
          wardName,
          officerName: sv.name,
          officerId: sv.id,
          reportCount: wardReports.length,
          pendingCount: wardReports.filter((r) => r.status !== "cleaned").length,
        });
      }
    }
    res.json({ total, reported, cleaning, cleaned, wardStats });
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

  // Waste composition — scoped to this panchayat's officers
  // Use a subquery filter to avoid table-alias conflicts in raw SQL templates
  const officerIdList = officerIds.map((id) => sql`${id}::int`);
  const officerSubfilter = sql`assigned_officer_id = ANY(ARRAY[${sql.join(officerIdList, sql`, `)}])`;

  const wasteTypeRows = await db.execute(sql`
    SELECT
      wt.waste_type,
      COUNT(*)::int AS count
    FROM reports rpt,
    LATERAL jsonb_array_elements_text(rpt.waste_types) AS wt(waste_type)
    WHERE rpt.deleted_at IS NULL AND rpt.waste_types IS NOT NULL
      AND rpt.assigned_officer_id = ANY(ARRAY[${sql.join(officerIdList, sql`, `)}])
    GROUP BY wt.waste_type
    ORDER BY count DESC
    LIMIT 10
  `);
  const wasteTypes = ((wasteTypeRows as any).rows ?? (wasteTypeRows as unknown as any[])).map((r: any) => ({
    type: r.waste_type as string,
    count: r.count as number,
  }));
  const totalWasteCount = wasteTypes.reduce((s: number, r: { count: number }) => s + r.count, 0);

  const severityRows = await db.execute(sql`
    SELECT
      waste_severity,
      COUNT(*)::int AS count
    FROM reports
    WHERE deleted_at IS NULL AND waste_severity IS NOT NULL
      AND ${officerSubfilter}
    GROUP BY waste_severity
    ORDER BY count DESC
  `);
  const severityBreakdown = ((severityRows as any).rows ?? (severityRows as unknown as any[])).map((r: any) => ({
    severity: r.waste_severity as string,
    count: r.count as number,
  }));

  const brandRows = await db.execute(sql`
    SELECT
      bn.brand_name,
      COUNT(*)::int AS count
    FROM reports rpt,
    LATERAL jsonb_array_elements_text(rpt.brand_names) AS bn(brand_name)
    WHERE rpt.deleted_at IS NULL AND rpt.brand_names IS NOT NULL AND jsonb_array_length(rpt.brand_names) > 0
      AND rpt.assigned_officer_id = ANY(ARRAY[${sql.join(officerIdList, sql`, `)}])
    GROUP BY bn.brand_name
    ORDER BY count DESC
    LIMIT 10
  `);
  const rawTopBrands = ((brandRows as any).rows ?? (brandRows as unknown as any[])).map((r: any) => ({
    brand: r.brand_name as string,
    count: r.count as number,
  }));
  const totalBrandCount = rawTopBrands.reduce((s: number, r: { count: number }) => s + r.count, 0);
  const topBrands = rawTopBrands.map((r: { brand: string; count: number }) => ({
    ...r,
    pct: totalBrandCount > 0 ? Math.round((r.count / totalBrandCount) * 100) : 0,
  }));

  const [aiAnalysedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(and(isNull(reportsTable.deletedAt), isNotNull(reportsTable.photoAiAnalysedAt), sql`${officerSubfilter}`));

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportsTable)
    .where(and(isNull(reportsTable.deletedAt), sql`${officerSubfilter}`));

  res.json({
    dailyTrend,
    officerLeaderboard,
    hotspots,
    recentReports,
    wasteComposition: {
      types: wasteTypes.map((t: { type: string; count: number }) => ({
        ...t,
        pct: totalWasteCount > 0 ? Math.round((t.count / totalWasteCount) * 100) : 0,
      })),
      severityBreakdown,
      topBrands,
      aiAnalysedCount: aiAnalysedRow?.count ?? 0,
      unanalysedCount: (totalRow?.count ?? 0) - (aiAnalysedRow?.count ?? 0),
    },
  });
});

// ── Smart Insights (Panchayat Admin) ─────────────────────────────────────────

router.get("/panchayat/smart-insights", requirePanchayatAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;

  const emptyResponse = () => ({
    narrative: null,
    narrativeGeneratedAt: null,
    peakHours: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 })),
    dayOfWeek: [
      { day: "Sun", count: 0 }, { day: "Mon", count: 0 }, { day: "Tue", count: 0 },
      { day: "Wed", count: 0 }, { day: "Thu", count: 0 }, { day: "Fri", count: 0 },
      { day: "Sat", count: 0 },
    ],
    sla: { within24h: 0, within48h: 0, within72h: 0, beyond72h: 0, totalCleaned: 0 },
    weekOverWeek: { thisWeek: 0, lastWeek: 0, changePct: null },
    wasteKeywords: [],
    photoSubmissionRate: 0,
    unassignedRate: 0,
  });

  if (!user.panchayatName) {
    res.json(emptyResponse());
    return;
  }

  const officerRows = await db
    .select({ id: officersTable.id })
    .from(officersTable)
    .where(and(eq(officersTable.panchayatName, user.panchayatName), isNull(officersTable.deletedAt)));

  if (officerRows.length === 0) {
    res.json(emptyResponse());
    return;
  }

  const officerIds = officerRows.map((o) => o.id);
  const officerIdList = officerIds.map((id) => sql`${id}::int`);
  const inOfficers = sql`assigned_officer_id = ANY(ARRAY[${sql.join(officerIdList, sql`, `)}])`;

  const rowsOf = (r: any): any[] => (r as any).rows ?? (r as unknown as any[]);

  const [peakHoursRows, dowRows, slaRows, wowRows, wasteKwRows, rateRows] = await Promise.all([
    db.execute(sql`
      SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS count
      FROM reports
      WHERE deleted_at IS NULL AND ${inOfficers}
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY hour ORDER BY hour
    `),
    db.execute(sql`
      SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*)::int AS count
      FROM reports
      WHERE deleted_at IS NULL AND ${inOfficers}
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY dow ORDER BY dow
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (cleaned_at - created_at)) / 3600 <= 24)::int AS within_24h,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (cleaned_at - created_at)) / 3600 > 24
                           AND EXTRACT(EPOCH FROM (cleaned_at - created_at)) / 3600 <= 48)::int AS within_48h,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (cleaned_at - created_at)) / 3600 > 48
                           AND EXTRACT(EPOCH FROM (cleaned_at - created_at)) / 3600 <= 72)::int AS within_72h,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (cleaned_at - created_at)) / 3600 > 72)::int AS beyond_72h,
        COUNT(*)::int AS total_cleaned
      FROM reports
      WHERE deleted_at IS NULL AND status = 'cleaned' AND cleaned_at IS NOT NULL
        AND ${inOfficers}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS this_week,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days'
                           AND created_at < NOW() - INTERVAL '7 days')::int AS last_week
      FROM reports
      WHERE deleted_at IS NULL AND ${inOfficers}
    `),
    db.execute(sql`
      SELECT keyword, COUNT(*)::int AS count
      FROM (
        SELECT
          CASE
            WHEN description ILIKE '%plastic%' OR description ILIKE '%polythene%' OR description ILIKE '%wrapper%' THEN 'Plastic'
            WHEN description ILIKE '%food%' OR description ILIKE '%vegetable%' OR description ILIKE '%organic%'
              OR description ILIKE '%leaves%' OR description ILIKE '%leaf%' THEN 'Organic'
            WHEN description ILIKE '%construction%' OR description ILIKE '%rubble%' OR description ILIKE '%debris%'
              OR description ILIKE '%brick%' OR description ILIKE '%sand%' THEN 'Construction'
            WHEN description ILIKE '%garbage%' OR description ILIKE '%dump%' OR description ILIKE '%litter%'
              OR description ILIKE '%rubbish%' OR description ILIKE '%trash%' THEN 'Garbage'
            WHEN description ILIKE '%drain%' OR description ILIKE '%sewage%' OR description ILIKE '%stagnant%' THEN 'Drainage'
            WHEN description ILIKE '%metal%' OR description ILIKE '%iron%' OR description ILIKE '%scrap%' THEN 'Metal'
            WHEN description ILIKE '%paper%' OR description ILIKE '%cardboard%' THEN 'Paper'
            WHEN description ILIKE '%glass%' THEN 'Glass'
            ELSE NULL
          END AS keyword
        FROM reports
        WHERE deleted_at IS NULL AND description IS NOT NULL AND description != ''
          AND ${inOfficers}
      ) t
      WHERE keyword IS NOT NULL
      GROUP BY keyword
      ORDER BY count DESC
      LIMIT 10
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE image_url IS NOT NULL
                           OR (image_urls IS NOT NULL AND jsonb_array_length(image_urls) > 0))::int AS with_photo
      FROM reports
      WHERE deleted_at IS NULL AND ${inOfficers}
    `),
  ]);

  const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

  const peakHours = Array.from({ length: 24 }, (_, h) => {
    const row = rowsOf(peakHoursRows).find((r: any) => r.hour === h);
    return { hour: h, count: (row?.count as number) ?? 0 };
  });

  const dayOfWeek = Array.from({ length: 7 }, (_, d) => {
    const row = rowsOf(dowRows).find((r: any) => r.dow === d);
    return { day: DOW_NAMES[d]!, count: (row?.count as number) ?? 0 };
  });

  const slaRow = rowsOf(slaRows)[0] ?? {};
  const sla = {
    within24h: (slaRow.within_24h as number) ?? 0,
    within48h: (slaRow.within_48h as number) ?? 0,
    within72h: (slaRow.within_72h as number) ?? 0,
    beyond72h: (slaRow.beyond_72h as number) ?? 0,
    totalCleaned: (slaRow.total_cleaned as number) ?? 0,
  };

  const wowRow = rowsOf(wowRows)[0] ?? {};
  const thisWeek = (wowRow.this_week as number) ?? 0;
  const lastWeek = (wowRow.last_week as number) ?? 0;
  const weekOverWeek = {
    thisWeek,
    lastWeek,
    changePct: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
  };

  const wasteKeywords: { keyword: string; count: number }[] = rowsOf(wasteKwRows).map((r: any) => ({
    keyword: r.keyword as string,
    count: r.count as number,
  }));

  const rateRow = rowsOf(rateRows)[0] ?? {};
  const total = (rateRow.total as number) ?? 0;
  const photoSubmissionRate = total > 0 ? Math.round(((rateRow.with_photo as number) / total) * 100) : 0;

  const narrative = await generateInsightNarrative({
    totalReports: total,
    photoRate: photoSubmissionRate,
    unassignedRate: 0,
    weekOverWeek,
    sla,
    topWasteKeywords: wasteKeywords,
    context: user.panchayatName,
  });

  req.log.info({ panchayatName: user.panchayatName, thisWeek, lastWeek }, "Panchayat smart insights generated");

  res.json({
    narrative,
    narrativeGeneratedAt: narrative ? new Date().toISOString() : null,
    peakHours,
    dayOfWeek,
    sla,
    weekOverWeek,
    wasteKeywords,
    photoSubmissionRate,
    unassignedRate: 0,
  });
});

export default router;
