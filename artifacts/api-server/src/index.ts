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

/**
 * One-time migration: clear broken local-disk image references.
 *
 * Before GCS-backed object storage, uploads were saved to ephemeral local
 * disk. Those files are gone after any server restart, so any report still
 * pointing to `/api/uploads/files/<filename>` that doesn't exist in GCS is
 * a broken reference. We null those out so the UI shows "no photo" gracefully.
 *
 * Reports that already had their URLs migrated to GCS (the file exists) are
 * left untouched. New uploads go straight to GCS and are unaffected.
 *
 * Guarded to run at most once (tracked in `system_migrations`) so it doesn't
 * re-scan every report and hit object storage on every restart/redeploy.
 */
const CLEAR_BROKEN_DISK_IMAGE_REFS_MIGRATION_KEY = "clear_broken_disk_image_refs_v1";

async function clearBrokenDiskImageRefs() {
  try {
    const { db, reportsTable } = await import("@workspace/db");
    const { eq, or, like, isNotNull, sql } = await import("drizzle-orm");
    const { objectStorageClient } = await import("./lib/objectStorage");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_migrations (
        key TEXT PRIMARY KEY,
        ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const alreadyRan = await db.execute(
      sql`SELECT 1 FROM system_migrations WHERE key = ${CLEAR_BROKEN_DISK_IMAGE_REFS_MIGRATION_KEY}`
    );
    if (alreadyRan.rows.length > 0) {
      return;
    }

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      logger.warn("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set — skipping broken image ref migration");
      return;
    }
    const bucket = objectStorageClient.bucket(bucketId);

    const DISK_PATTERN = "/api/uploads/files/%";

    // Fetch all reports that have at least one local-disk-style URL
    const candidates = await db
      .select({
        id: reportsTable.id,
        imageUrl: reportsTable.imageUrl,
        imageUrls: reportsTable.imageUrls,
        cleanupImageUrl: reportsTable.cleanupImageUrl,
        cleanupImageUrls: reportsTable.cleanupImageUrls,
      })
      .from(reportsTable)
      .where(
        or(
          like(reportsTable.imageUrl, DISK_PATTERN),
          like(reportsTable.cleanupImageUrl, DISK_PATTERN),
          // Also catch reports where JSONB arrays contain disk-path items
          // (use a raw SQL condition for the JSONB cast)
          isNotNull(reportsTable.imageUrls),
          isNotNull(reportsTable.cleanupImageUrls),
        )
      );

    /** Extract GCS filename from a /api/uploads/files/<filename> URL */
    function gcsPath(url: string): string | null {
      const m = url.match(/^\/api\/uploads\/files\/([^/]+)$/);
      return m ? `uploads/${m[1]}` : null;
    }

    /** Check whether a file actually exists in GCS */
    async function existsInGcs(url: string): Promise<boolean> {
      const path = gcsPath(url);
      if (!path) return false; // Not a local-disk URL; keep as-is
      try {
        const [exists] = await bucket.file(path).exists();
        return exists;
      } catch {
        return false;
      }
    }

    let cleared = 0;

    for (const row of candidates) {
      const updates: Record<string, unknown> = {};

      // --- imageUrl (scalar) ---
      if (row.imageUrl && row.imageUrl.startsWith("/api/uploads/files/")) {
        const inGcs = await existsInGcs(row.imageUrl);
        if (!inGcs) {
          updates.imageUrl = null;
          updates.imageUploadedAt = null;
        }
      }

      // --- imageUrls (JSONB array) ---
      if (Array.isArray(row.imageUrls) && row.imageUrls.length > 0) {
        const kept: typeof row.imageUrls = [];
        for (const item of row.imageUrls) {
          if (item.url.startsWith("/api/uploads/files/")) {
            const inGcs = await existsInGcs(item.url);
            if (inGcs) kept.push(item);
            // else: discard the broken entry
          } else {
            kept.push(item); // Non-disk URL (e.g. already GCS-public) — keep
          }
        }
        if (kept.length !== row.imageUrls.length) {
          updates.imageUrls = kept.length > 0 ? kept : null;
          // Keep imageUrl in sync: if we already cleared it above, leave null;
          // otherwise derive from surviving items if the scalar was intact
          if (!("imageUrl" in updates)) {
            updates.imageUrl = kept[0]?.url ?? null;
          }
        }
      }

      // --- cleanupImageUrl (scalar) ---
      if (row.cleanupImageUrl && row.cleanupImageUrl.startsWith("/api/uploads/files/")) {
        const inGcs = await existsInGcs(row.cleanupImageUrl);
        if (!inGcs) {
          updates.cleanupImageUrl = null;
        }
      }

      // --- cleanupImageUrls (JSONB array) ---
      if (Array.isArray(row.cleanupImageUrls) && row.cleanupImageUrls.length > 0) {
        const kept: typeof row.cleanupImageUrls = [];
        for (const item of row.cleanupImageUrls) {
          if (item.url.startsWith("/api/uploads/files/")) {
            const inGcs = await existsInGcs(item.url);
            if (inGcs) kept.push(item);
          } else {
            kept.push(item);
          }
        }
        if (kept.length !== row.cleanupImageUrls.length) {
          updates.cleanupImageUrls = kept.length > 0 ? kept : null;
          if (!("cleanupImageUrl" in updates)) {
            updates.cleanupImageUrl = kept[0]?.url ?? null;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.update(reportsTable).set(updates as any).where(eq(reportsTable.id, row.id));
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.info({ cleared }, "Cleared broken local-disk image references from reports");
    } else {
      logger.info("No broken local-disk image references found");
    }

    await db.execute(
      sql`INSERT INTO system_migrations (key) VALUES (${CLEAR_BROKEN_DISK_IMAGE_REFS_MIGRATION_KEY}) ON CONFLICT (key) DO NOTHING`
    );
  } catch (err) {
    logger.warn({ err }, "Could not clear broken disk image references");
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
    await db.execute(sql`
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS cleaning_started_at timestamp with time zone
    `);
    await db.execute(sql`
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS cleaned_at timestamp with time zone
    `);
    // Backfill historical rows (created before these columns existed) so delay analytics
    // aren't empty for pre-existing data. Best-effort approximation using updated_at, since
    // we don't have the exact status-transition timestamps for older reports.
    await db.execute(sql`
      UPDATE reports
      SET cleaning_started_at = updated_at
      WHERE cleaning_started_at IS NULL AND status IN ('cleaning', 'cleaned')
    `);
    await db.execute(sql`
      UPDATE reports
      SET cleaned_at = updated_at
      WHERE cleaned_at IS NULL AND status = 'cleaned'
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
  await clearBrokenDiskImageRefs();
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
