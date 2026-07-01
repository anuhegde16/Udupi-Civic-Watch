import app from "./app";
import { logger } from "./lib/logger";
import { ensureAdminExists } from "./lib/auth";
import { startScheduler } from "./lib/scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// One-time repair migration for reports with genuinely missing images.
//
// IMPORTANT: `/api/uploads/files/%` is the CURRENT, LIVE upload path used by every
// real citizen photo (see routes/uploads.ts). It must never be treated as broken by
// pattern alone — only rows whose underlying object storage file provably no longer
// exists are considered broken. This migration is also guarded to run at most once
// (tracked in `system_migrations`) so a future logic mistake can't silently
// re-corrupt data on every restart/redeploy.
const FIX_IMAGE_URLS_MIGRATION_KEY = "fix_image_urls_v2_safe";
const DUMMY_IMAGE_PATHS = ["/garbage-photo.jpg", "/cleaning-photo.jpg", "/cleaned-photo.jpg"];

function dummyImageForStatus(status: string | null): string {
  if (status === "cleaning") return "/cleaning-photo.jpg";
  if (status === "cleaned") return "/cleaned-photo.jpg";
  return "/garbage-photo.jpg";
}

async function fixImageUrls() {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_migrations (
        key TEXT PRIMARY KEY,
        ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const alreadyRan = await db.execute(
      sql`SELECT 1 FROM system_migrations WHERE key = ${FIX_IMAGE_URLS_MIGRATION_KEY}`
    );
    if (alreadyRan.rows.length > 0) {
      return;
    }

    // Genuinely broken: no image reference at all.
    await db.execute(sql`
      UPDATE reports
      SET image_url = CASE
        WHEN status = 'cleaning' THEN '/cleaning-photo.jpg'
        WHEN status = 'cleaned'  THEN '/cleaned-photo.jpg'
        ELSE '/garbage-photo.jpg'
      END
      WHERE image_url IS NULL
    `);

    // Rows on the current upload path are only "broken" if the file they point at
    // has genuinely vanished from object storage — never assume broken by path alone.
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    const candidatesResult = await db.execute(
      sql`SELECT id, status, image_url FROM reports WHERE image_url LIKE '/api/uploads/files/%'`
    );
    const candidates = candidatesResult.rows as { id: number; status: string | null; image_url: string }[];

    let repairedCount = 0;
    if (bucketId && candidates.length > 0) {
      const { objectStorageClient } = await import("./lib/objectStorage");
      const bucket = objectStorageClient.bucket(bucketId);
      for (const row of candidates) {
        const filename = String(row.image_url)
          .replace("/api/uploads/files/", "")
          .replace(/[^a-zA-Z0-9.\-_]/g, "");
        if (!filename) continue;
        try {
          const [exists] = await bucket.file(`uploads/${filename}`).exists();
          if (!exists) {
            const dummy = dummyImageForStatus(row.status);
            await db.execute(sql`UPDATE reports SET image_url = ${dummy} WHERE id = ${row.id}`);
            repairedCount++;
          }
        } catch (err) {
          logger.warn({ err, reportId: row.id }, "Could not verify report image in object storage; leaving it untouched");
        }
      }
    }

    // Audit: surface reports currently showing a dummy placeholder so it's clear
    // which ones may have already lost their real photo to this bug historically.
    // (Recovering the original file itself is out of scope.)
    const dummyRows = await db.execute(
      sql`SELECT id FROM reports WHERE image_url IN (${sql.join(
        DUMMY_IMAGE_PATHS.map((p) => sql`${p}`),
        sql`, `
      )})`
    );
    const dummyReportIds = (dummyRows.rows as { id: number }[]).map((r) => r.id);
    if (dummyReportIds.length > 0) {
      logger.warn(
        { reportIds: dummyReportIds, count: dummyReportIds.length },
        "Reports currently show a placeholder image — their real photo may have been overwritten by a past migration bug"
      );
    }

    await db.execute(
      sql`INSERT INTO system_migrations (key) VALUES (${FIX_IMAGE_URLS_MIGRATION_KEY}) ON CONFLICT (key) DO NOTHING`
    );
    logger.info({ repairedCount }, "One-time image URL repair migration completed and marked as run");
  } catch (err) {
    logger.warn({ err }, "Could not fix image URLs");
  }
}

// One-time migration: move the original demo seed reports (IDs 13–23) that
// were seeded outside Saligrama into the correct service area. Targets only
// those specific IDs so no real citizen report is ever touched. Idempotent —
// rows already inside the bounding box are left unchanged.
const DEMO_REPORT_SALIGRAMA_LOCATIONS: Record<number, { lat: number; lng: number; address: string }> = {
  13: { lat: 13.5028, lng: 74.7118, address: "Saligrama Town, NH-66" },
  14: { lat: 13.4975, lng: 74.7082, address: "Swarna River Road, Near Bridge" },
  15: { lat: 13.5063, lng: 74.7195, address: "Saligrama Market Area" },
  16: { lat: 13.4922, lng: 74.7153, address: "Saligrama Bus Stand Road" },
  17: { lat: 13.5101, lng: 74.7047, address: "Near Saligrama Gram Panchayat" },
  18: { lat: 13.4870, lng: 74.7210, address: "Keremane Road, Saligrama" },
  19: { lat: 13.5038, lng: 74.7240, address: "Uppinakudru Junction Area" },
  20: { lat: 13.4945, lng: 74.7003, address: "Padavu Road, Saligrama" },
  21: { lat: 13.5085, lng: 74.7138, address: "Saligrama School Road" },
  22: { lat: 13.4888, lng: 74.7074, address: "Heroor Cross, Saligrama" },
  23: { lat: 13.5012, lng: 74.7172, address: "Saligrama Temple Street" },
};

async function relocateDemoReportsToSaligrama() {
  try {
    const { db, reportsTable } = await import("@workspace/db");
    const { eq, inArray } = await import("drizzle-orm");

    const targetIds = Object.keys(DEMO_REPORT_SALIGRAMA_LOCATIONS).map(Number);
    const rows = await db
      .select({ id: reportsTable.id, lat: reportsTable.latitude, lng: reportsTable.longitude })
      .from(reportsTable)
      .where(inArray(reportsTable.id, targetIds));

    let moved = 0;
    for (const r of rows) {
      const loc = DEMO_REPORT_SALIGRAMA_LOCATIONS[r.id];
      if (!loc) continue;
      const alreadyInside =
        r.lat >= 13.46988 && r.lat <= 13.52115 &&
        r.lng >= 74.68630 && r.lng <= 74.73806;
      if (!alreadyInside) {
        await db
          .update(reportsTable)
          .set({ latitude: loc.lat, longitude: loc.lng, address: loc.address })
          .where(eq(reportsTable.id, r.id));
        moved++;
      }
    }

    if (moved > 0) logger.info({ moved }, "Relocated demo reports inside Saligrama boundary");
  } catch (err) {
    logger.warn({ err }, "Could not relocate demo reports to Saligrama");
  }
}

async function migrateRoles() {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`UPDATE users SET role = 'control_center' WHERE role = 'admin'`);
    await db.execute(sql`UPDATE users SET role = 'field_officer' WHERE role = 'officer'`);
    logger.info("Role migration complete");
  } catch (err) {
    logger.warn({ err }, "Role migration failed");
  }
}

async function ensurePanchayatAdmin() {
  try {
    const { db, usersTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");
    const { hashPassword } = await import("./lib/auth");

    const TARGET_EMAIL = "saligrama@udupicivicspot.com";
    const TARGET_PANCHAYAT = "Saligrama";

    // Normalise any row that was seeded with the old long-form name
    await db.execute(sql`
      UPDATE users SET panchayat_name = 'Saligrama'
      WHERE panchayat_name = 'Saligrama Town Panchayat' AND role = 'panchayat_admin'
    `);

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, TARGET_EMAIL)).limit(1);
    if (existing.length > 0) {
      if (existing[0].panchayatName !== TARGET_PANCHAYAT) {
        await db.update(usersTable).set({ panchayatName: TARGET_PANCHAYAT, role: "panchayat_admin" }).where(eq(usersTable.email, TARGET_EMAIL));
        logger.info(`Normalised panchayat admin name to: ${TARGET_PANCHAYAT}`);
      }
      return;
    }

    const passwordHash = await hashPassword(TARGET_EMAIL);
    await db.insert(usersTable).values({
      email: TARGET_EMAIL,
      passwordHash,
      name: "Saligrama Panchayat Admin",
      role: "panchayat_admin",
      panchayatName: TARGET_PANCHAYAT,
    });
    logger.info(`Seeded panchayat admin: ${TARGET_EMAIL}`);
  } catch (err) {
    logger.warn({ err }, "Could not seed panchayat admin");
  }
}

async function seedOfficerPanchayatNames() {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      UPDATE officers SET panchayat_name = 'Saligrama'
      WHERE (panchayat_name IS NULL OR panchayat_name != 'Saligrama') AND deleted_at IS NULL
    `);
    logger.info("Officer panchayat names normalised to Saligrama");
  } catch (err) {
    logger.warn({ err }, "Could not backfill officer panchayat names");
  }
}

async function ensureReportsColumns() {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_uploaded_at timestamp with time zone
    `);
    logger.info("reports schema columns verified");
  } catch (err) {
    logger.warn({ err }, "Could not ensure reports columns");
  }
}

async function ensurePushSubscriptionsColumns() {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`ALTER TABLE push_subscriptions ALTER COLUMN user_id DROP NOT NULL`);
    await db.execute(sql`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS report_id integer`);
    logger.info("push_subscriptions schema columns verified");
  } catch (err) {
    logger.warn({ err }, "Could not ensure push_subscriptions columns");
  }
}

async function start() {
  await ensureAdminExists();
  await ensureReportsColumns();
  await ensurePushSubscriptionsColumns();
  await migrateRoles();
  await ensurePanchayatAdmin();
  await seedOfficerPanchayatNames();
  await fixImageUrls();
  await relocateDemoReportsToSaligrama();

  startScheduler();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}


start();
