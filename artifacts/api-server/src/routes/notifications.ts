import { Router, type IRouter } from "express";
import { db, pushSubscriptionsTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, count as dbCount } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { VAPID_PUBLIC_KEY, sendTestPushToUser } from "../lib/push";
import { logger } from "../lib/logger";
import { z } from "zod/v4";

// In-memory IP rate limiter for anonymous push subscriptions: 5 per IP per hour
const ANON_SUB_RATE_LIMIT = 5;
const ANON_SUB_WINDOW_MS = 60 * 60 * 1000;
const anonSubIpMap = new Map<string, number[]>();

function checkAnonSubRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - ANON_SUB_WINDOW_MS;
  const timestamps = (anonSubIpMap.get(ip) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= ANON_SUB_RATE_LIMIT) return false;
  timestamps.push(now);
  anonSubIpMap.set(ip, timestamps);
  return true;
}

const router: IRouter = Router();

const PushSubscriptionBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

const AnonymousPushSubscriptionBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  reportId: z.number().int().positive(),
});

router.get("/notifications/vapid-public-key", (req, res): void => {
  if (!VAPID_PUBLIC_KEY) {
    res.status(503).json({ error: "Push notifications not configured" });
    return;
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

router.post("/notifications/push-subscription", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const parsed = PushSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid subscription", message: parsed.error.message });
    return;
  }

  const { endpoint, keys } = parsed.data;

  await db
    .insert(pushSubscriptionsTable)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, updatedAt: new Date() },
    });

  logger.info({ userId: user.id }, "Push subscription saved");
  res.json({ success: true });
});

router.delete("/notifications/push-subscription", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    res.status(400).json({ error: "endpoint required" });
    return;
  }
  await db
    .delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.userId, user.id)));
  res.json({ success: true });
});

router.post("/notifications/anonymous-subscription", async (req, res): Promise<void> => {
  const parsed = AnonymousPushSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid subscription", message: parsed.error.message });
    return;
  }

  const { endpoint, keys, reportId } = parsed.data;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";

  if (!checkAnonSubRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests", message: "You have subscribed too many times recently. Please try again later." });
    return;
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({ userId: null, reportId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { reportId, p256dh: keys.p256dh, auth: keys.auth, updatedAt: new Date() },
    });

  logger.info({ reportId }, "Anonymous citizen push subscription saved");
  res.json({ success: true });
});

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "50", 10), 100);

  const [items, [unreadRow]] = await Promise.all([
    db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, user.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit),
    db
      .select({ count: dbCount() })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false))),
  ]);

  res.json({ notifications: items, unreadCount: unreadRow?.count ?? 0 });
});

router.post("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const rawId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const id = parseInt(rawId ?? "", 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)));
  res.json({ success: true });
});

router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.read, false)));
  res.json({ success: true });
});

router.delete("/notifications/clear-all", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, user.id));
  logger.info({ userId: user.id }, "Cleared all notifications");
  res.json({ success: true });
});

router.post("/notifications/test", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;

  if (!VAPID_PUBLIC_KEY) {
    res.status(503).json({ success: false, error: "Push notifications not configured on the server" });
    return;
  }

  try {
    const stats = await sendTestPushToUser(user.id, {
      title: "Push notifications are working",
      body: "You will receive alerts when new reports are assigned to you.",
      type: "test",
    });

    if (stats.attempted === 0) {
      res.status(400).json({ success: false, error: "No active push subscription found for this device" });
      return;
    }

    if (stats.succeeded === 0) {
      logger.warn({ userId: user.id, stats }, "Test push: all deliveries failed");
      res.status(502).json({
        success: false,
        error: "Notification could not be delivered. Your subscription may be stale — try disabling and re-enabling push notifications.",
      });
      return;
    }

    logger.info({ userId: user.id, stats }, "Test push notification sent");
    res.json({ success: true, sent: stats.succeeded });
  } catch (err) {
    logger.warn({ err, userId: user.id }, "Test push notification failed");
    res.status(500).json({ success: false, error: "Failed to send test notification" });
  }
});

export default router;
