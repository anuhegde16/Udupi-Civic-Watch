import webpush from "web-push";
import { db, pushSubscriptionsTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger";

const VAPID_PUBLIC_KEY = process.env["VAPID_PUBLIC_KEY"];
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"];
const VAPID_SUBJECT = process.env["VAPID_SUBJECT"] ?? "mailto:admin@udupicivicwatch.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export { VAPID_PUBLIC_KEY };

export interface PushPayload {
  title: string;
  body: string;
  type: string;
  reportId?: number;
  url?: string;
}

async function sendPushToSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: PushPayload
): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify(payload),
      { TTL: 86400 }
    );
    return true;
  } catch (err: any) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
      logger.info({ endpoint }, "Removed stale push subscription");
    } else {
      logger.warn({ err, endpoint }, "Push send failed");
    }
    return false;
  }
}

export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  if (userIds.length === 0) return;

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(inArray(pushSubscriptionsTable.userId, userIds));

  await Promise.allSettled(
    subs.map((s) => sendPushToSubscription(s.endpoint, s.p256dh, s.auth, payload))
  );
}

export async function createNotificationForUsers(
  userIds: number[],
  payload: Pick<PushPayload, "title" | "body" | "type" | "reportId">
): Promise<void> {
  if (userIds.length === 0) return;
  await db.insert(notificationsTable).values(
    userIds.map((userId) => ({
      userId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      reportId: payload.reportId ?? null,
    }))
  );
}

export async function notifyAndPush(
  userIds: number[],
  payload: PushPayload
): Promise<void> {
  if (userIds.length === 0) return;
  await Promise.allSettled([
    createNotificationForUsers(userIds, payload),
    sendPushToUsers(userIds, payload),
  ]);
}

export async function getUserIdsByRole(role: string, panchayatName?: string): Promise<number[]> {
  let q = db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, role));
  const rows = await q;
  if (panchayatName) {
    const filtered = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, role), eq(usersTable.panchayatName, panchayatName)));
    return filtered.map((r) => r.id);
  }
  return rows.map((r) => r.id);
}
