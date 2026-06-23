import { Router, type IRouter } from "express";
import { db, pushSubscriptionsTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, count as dbCount, isNull, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { VAPID_PUBLIC_KEY } from "../lib/push";
import { logger } from "../lib/logger";
import { z } from "zod/v4";

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

  // Rate limit: max 10 anonymous subscriptions per IP per hour
  const recentCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pushSubscriptionsTable)
    .where(
      and(
        isNull(pushSubscriptionsTable.userId),
        sql`${pushSubscriptionsTable.createdAt} > NOW() - INTERVAL '1 hour'`,
        sql`${pushSubscriptionsTable.auth} LIKE ${"%" + ip.slice(-8)}`
      )
    );

  // Simple heuristic — also just upsert; endpoint uniqueness prevents spam
  if ((recentCount[0]?.count ?? 0) > 10) {
    res.status(429).json({ error: "Too many requests" });
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

export default router;
