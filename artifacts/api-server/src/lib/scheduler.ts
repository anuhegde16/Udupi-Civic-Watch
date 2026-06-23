import cron from "node-cron";
import { db, reportsTable, officersTable, usersTable } from "@workspace/db";
import { sql, eq, gte, inArray, isNull, and } from "drizzle-orm";
import { sendWeeklyDigest, type WeeklyOfficerRow, type WeeklyPanchayatRow } from "./email";
import { logger } from "./logger";

function buildWeekLabel(): string {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
  const yearStr = end.toLocaleDateString("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" });
  return `${fmt(start)} – ${fmt(end)} ${yearStr}`;
}

export async function sendWeeklyDigestToAll(): Promise<void> {
  logger.info("Starting weekly digest send");
  const weekLabel = buildWeekLabel();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const panchayatAdmins = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, panchayatName: usersTable.panchayatName })
    .from(usersTable)
    .where(eq(usersTable.role, "panchayat_admin"));

  const byPanchayat = new Map<string, typeof panchayatAdmins>();
  for (const admin of panchayatAdmins) {
    if (!admin.panchayatName) continue;
    const arr = byPanchayat.get(admin.panchayatName) ?? [];
    arr.push(admin);
    byPanchayat.set(admin.panchayatName, arr);
  }

  const panchayatRows: WeeklyPanchayatRow[] = [];

  for (const [panchayatName, admins] of byPanchayat) {
    const officers = await db
      .select({ id: officersTable.id, name: officersTable.name, areaName: officersTable.areaName })
      .from(officersTable)
      .where(and(eq(officersTable.panchayatName, panchayatName), isNull(officersTable.deletedAt)))
      .orderBy(officersTable.areaName);

    const officerIds = officers.map((o) => o.id);
    if (officerIds.length === 0) continue;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportsTable)
      .where(and(inArray(reportsTable.assignedOfficerId, officerIds), gte(reportsTable.createdAt, oneWeekAgo)));

    const [openRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportsTable)
      .where(and(inArray(reportsTable.assignedOfficerId, officerIds), eq(reportsTable.status, "reported")));

    const [resolvedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportsTable)
      .where(and(
        inArray(reportsTable.assignedOfficerId, officerIds),
        eq(reportsTable.status, "cleaned"),
        gte(reportsTable.updatedAt, oneWeekAgo)
      ));

    const [avgRow] = await db
      .select({ avg: sql<number>`coalesce(round(avg(extract(epoch from (updated_at - created_at)) / 3600))::int, 0)` })
      .from(reportsTable)
      .where(and(
        inArray(reportsTable.assignedOfficerId, officerIds),
        eq(reportsTable.status, "cleaned"),
        gte(reportsTable.updatedAt, thirtyDaysAgo)
      ));

    const total = totalRow?.count ?? 0;
    const open = openRow?.count ?? 0;
    const resolved = resolvedRow?.count ?? 0;
    const avgResponseHours = avgRow?.avg ?? 0;

    panchayatRows.push({ panchayat: panchayatName, total, open, resolved });

    const officerRows: WeeklyOfficerRow[] = await Promise.all(
      officers.map(async (o) => {
        const [pendingRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(reportsTable)
          .where(and(eq(reportsTable.assignedOfficerId, o.id), sql`${reportsTable.status} != 'cleaned'`));

        const [resRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(reportsTable)
          .where(and(
            eq(reportsTable.assignedOfficerId, o.id),
            eq(reportsTable.status, "cleaned"),
            gte(reportsTable.updatedAt, oneWeekAgo)
          ));

        return {
          name: o.name,
          ward: o.areaName ?? "—",
          pending: pendingRow?.count ?? 0,
          resolvedThisWeek: resRow?.count ?? 0,
        };
      })
    );

    for (const admin of admins) {
      if (!admin.email) continue;
      await sendWeeklyDigest({
        to: admin.email,
        recipientName: admin.name ?? "Admin",
        weekLabel,
        stats: { total, open, resolved, avgResponseHours },
        officerRows,
        isControlCenter: false,
        panchayatName,
      }).catch((err) => logger.warn({ err, to: admin.email }, "Panchayat admin weekly digest failed"));
    }
  }

  const ccUsers = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.role, "control_center"));

  if (ccUsers.length > 0) {
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportsTable)
      .where(gte(reportsTable.createdAt, oneWeekAgo));

    const [openRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportsTable)
      .where(eq(reportsTable.status, "reported"));

    const [resolvedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportsTable)
      .where(and(eq(reportsTable.status, "cleaned"), gte(reportsTable.updatedAt, oneWeekAgo)));

    const [avgRow] = await db
      .select({ avg: sql<number>`coalesce(round(avg(extract(epoch from (updated_at - created_at)) / 3600))::int, 0)` })
      .from(reportsTable)
      .where(and(eq(reportsTable.status, "cleaned"), gte(reportsTable.updatedAt, thirtyDaysAgo)));

    const stats = {
      total: totalRow?.count ?? 0,
      open: openRow?.count ?? 0,
      resolved: resolvedRow?.count ?? 0,
      avgResponseHours: avgRow?.avg ?? 0,
    };

    for (const cc of ccUsers) {
      if (!cc.email) continue;
      await sendWeeklyDigest({
        to: cc.email,
        recipientName: cc.name ?? "Admin",
        weekLabel,
        stats,
        panchayatRows,
        isControlCenter: true,
      }).catch((err) => logger.warn({ err, to: cc.email }, "Control center weekly digest failed"));
    }
  }

  logger.info({ panchayats: panchayatRows.length, ccRecipients: ccUsers.length }, "Weekly digest send complete");
}

export function startScheduler(): void {
  cron.schedule(
    "0 0 8 * * 1",
    () => {
      sendWeeklyDigestToAll().catch((err) => logger.error({ err }, "Weekly digest cron failed"));
    },
    { timezone: "Asia/Kolkata" }
  );
  logger.info("Weekly digest scheduler started — fires every Monday at 08:00 IST");
}
