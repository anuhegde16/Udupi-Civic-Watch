import { Router, type IRouter } from "express";
import { db, officersTable, reportsTable } from "@workspace/db";
import { eq, sql, and, isNull } from "drizzle-orm";
import { requirePanchayatAdmin } from "../lib/auth";
import geofencesData from "../data/geofences.json";

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

router.get("/panchayat/reports", requirePanchayatAdmin, async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.panchayatName) {
    res.json({ reports: [], total: 0 });
    return;
  }

  const status = typeof req.query.status === "string" ? req.query.status : undefined;

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
  if (status) conditions.push(eq(reportsTable.status, status));

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

  const formatted = reports.map(({ report, officer }) => ({
    ...report,
    assignedOfficer: officer
      ? { id: officer.id, name: officer.name, email: officer.email, phone: officer.phone, areaName: officer.areaName, wardName: officer.areaName }
      : null,
  }));

  res.json({ reports: formatted, total: countRow.count });
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
  const inArray = sql`${reportsTable.assignedOfficerId} = ANY(ARRAY[${sql.join(officerIds.map(id => sql`${id}::int`), sql`, `)}])`;

  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(inArray);
  const [reported] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(inArray, eq(reportsTable.status, "reported")));
  const [cleaning] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(inArray, eq(reportsTable.status, "cleaning")));
  const [cleaned] = await db.select({ count: sql<number>`count(*)::int` }).from(reportsTable).where(and(inArray, eq(reportsTable.status, "cleaned")));

  const wardStats = await Promise.all(
    officerRows.map(async (o) => {
      const [totalRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(eq(reportsTable.assignedOfficerId, o.id));
      const [pendingRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(and(eq(reportsTable.assignedOfficerId, o.id), sql`${reportsTable.status} != 'cleaned'`));
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

export default router;
