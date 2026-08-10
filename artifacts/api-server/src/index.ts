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

// ── Udupi hierarchy tables + accounts ─────────────────────────────────────────

/**
 * MUST run before any Drizzle ORM query so the `phone` column exists in the
 * DB to match the schema. Uses a raw pg pool query (not Drizzle) to avoid
 * the chicken-and-egg problem where Drizzle tries to SELECT the column before
 * we've added it.
 */
async function bootstrapPhoneColumn() {
  try {
    const { pool } = await import("@workspace/db");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text");
    await pool.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT false",
    );
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_token text");
  } catch (err) {
    // Non-fatal — column may already exist on a subsequent restart
  }
}

async function ensureUdupiHierarchyTables() {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");

    // phone column is added by bootstrapPhoneColumn() at the very start;

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS environmental_engineers (
        id            serial PRIMARY KEY,
        name          text        NOT NULL,
        phone         text        NOT NULL,
        panchayat_name text       NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS health_inspectors (
        id                       serial PRIMARY KEY,
        name                     text        NOT NULL,
        phone                    text        NOT NULL,
        panchayat_name           text        NOT NULL,
        environmental_engineer_id integer,
        created_at               timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS supervisors (
        id                  serial PRIMARY KEY,
        name                text        NOT NULL,
        phone               text        NOT NULL,
        panchayat_name      text        NOT NULL,
        health_inspector_id integer,
        ward_names          jsonb       NOT NULL DEFAULT '[]',
        created_at          timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS community_mobilisers (
        id             serial PRIMARY KEY,
        name           text        NOT NULL,
        phone          text        NOT NULL,
        panchayat_name text        NOT NULL,
        ward_name      text        NOT NULL,
        ward_number    integer     NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);

    logger.info("Udupi hierarchy tables ready");
  } catch (err) {
    logger.warn({ err }, "Could not ensure Udupi hierarchy tables");
  }
}

async function seedUdupiHierarchy() {
  try {
    const { db, usersTable } = await import("@workspace/db");
    const { sql, eq } = await import("drizzle-orm");
    const { hashPassword } = await import("./lib/auth");

    const PANCHAYAT = "Udupi";

    // ── Initial password provisioning ────────────────────────────────────────
    // All hierarchy accounts are created with a known shared password so staff
    // can log in immediately without an activation flow.
    const KNOWN_PASSWORD = "Udupi@1234";
    const knownHash = await hashPassword(KNOWN_PASSWORD);

    // Helper: insert a users row for a phone-identified person (idempotent).
    async function ensureUser(
      phone: string,
      name: string,
      role: string,
      profileId: number | null,
    ) {
      const existing = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, phone))
        .limit(1);
      if (existing.length > 0) return;

      await db.execute(sql`
        INSERT INTO users (email, password_hash, name, role, officer_id, panchayat_name, phone, password_reset_required, activation_token)
        VALUES (
          ${phone + "@phone.local"},
          ${knownHash},
          ${name},
          ${role},
          ${profileId !== null ? String(profileId) : null},
          ${PANCHAYAT},
          ${phone},
          false,
          NULL
        )
        ON CONFLICT DO NOTHING
      `);
    }

    // ── Environmental Engineer ─────────────────────────────────────────────
    const eePhone = "7624851225";
    const eeName  = "Mr. Ravi Prakash";
    let eeId: number;
    {
      const r = await db.execute(sql`SELECT id FROM environmental_engineers WHERE phone = ${eePhone} LIMIT 1`);
      if (r.rows.length > 0) {
        eeId = r.rows[0].id as number;
      } else {
        const ins = await db.execute(sql`
          INSERT INTO environmental_engineers (name, phone, panchayat_name)
          VALUES (${eeName}, ${eePhone}, ${PANCHAYAT}) RETURNING id
        `);
        eeId = ins.rows[0].id as number;
      }
    }
    await ensureUser(eePhone, eeName, "environmental_engineer", eeId);

    // ── Commissioner (users table only — no separate profile table) ────────
    await ensureUser("8277293917", "Mr. Mahantesh Hangaragi", "commissioner", null);

    // ── Health Inspectors ──────────────────────────────────────────────────
    const hiList = [
      { name: "Mr. Surendra Hobalidara", phone: "9739296004" },
      { name: "Mr. Harish Billava",      phone: "9535052544" },
      { name: "Mr. Satheesh",            phone: "9845905977" },
      { name: "Mr. Prakash Prabhu",      phone: "9964213243" },
    ];
    const hiIds: Record<string, number> = {};
    for (const hi of hiList) {
      let hiId: number;
      const r = await db.execute(sql`SELECT id FROM health_inspectors WHERE phone = ${hi.phone} LIMIT 1`);
      if (r.rows.length > 0) {
        hiId = r.rows[0].id as number;
      } else {
        const ins = await db.execute(sql`
          INSERT INTO health_inspectors (name, phone, panchayat_name, environmental_engineer_id)
          VALUES (${hi.name}, ${hi.phone}, ${PANCHAYAT}, ${eeId}) RETURNING id
        `);
        hiId = ins.rows[0].id as number;
      }
      hiIds[hi.phone] = hiId;
      await ensureUser(hi.phone, hi.name, "health_inspector", hiId);
    }

    // ── Supervisors ────────────────────────────────────────────────────────
    const supervisorList = [
      { name: "Mr. Nagarjun D Amin",  phone: "8431564819", hi: "9739296004", wards: [[1,"Kola"],[2,"Vadabhandeshwara"],[3,"Malpe Central"]] },
      { name: "Mr. Suresh Kelkar",    phone: "9844963244", hi: "9739296004", wards: [[5,"Kalmady"],[10,"Gopalapura"],[4,"Kodavoor"]] },
      { name: "Mr. Yogeesh",          phone: "9743600255", hi: "9739296004", wards: [[6,"Moodubettu"],[9,"Subhrahmanya Nagar"],[7,"Kodankuru"]] },
      { name: "Mrs. Anitha",          phone: "9743883501", hi: "9739296004", wards: [[8,"Nittur"],[28,"Bannanje"],[35,"Ambalapady"]] },
      { name: "Mr. Manohar Karkada",  phone: "8105136113", hi: "9535052544", wards: [[25,"Kunjibettu"],[26,"Kadiyali"],[27,"Gundibailu"]] },
      { name: "Mr. Sachin",           phone: "7676880597", hi: "9535052544", wards: [[22,"76 Badagubettu"],[31,"Bailoor"],[23,"Chitpady"]] },
      { name: "Mr. Shreekanth",       phone: "9880605830", hi: "9845905977", wards: [[30,"Olakadu"],[29,"Tenkapete"],[34,"Shiribeedu"]] },
      { name: "Mr. Prashanth",        phone: "9901995778", hi: "9845905977", wards: [[33,"Ajjarakadu"],[32,"Kinnimulky"]] },
      // East Division (Manipal Division) — under HI Prakash Prabhu
      { name: "Mr. Suresh Shetty",    phone: "8861038802", hi: "9964213243", wards: [[11,"Kakkunje"],[12,"Karamballi"],[13,"Moodu Perampalli"],[19,"Moodu Sagri"]] },
      { name: "Mr. Ravi",             phone: "9035088749", hi: "9964213243", wards: [[20,"Indrali"],[18,"Manipal"],[21,"Indira Nagar"],[24,"Kasthurba Nagar"]] },
      { name: "Mr. Boja Naik",        phone: "9880625188", hi: "9964213243", wards: [[16,"Parkala"],[15,"Shettibettu"],[14,"Saralabettu"],[17,"Eshwar Nagar"]] },
    ] as const;

    for (const sv of supervisorList) {
      const hiId = hiIds[sv.hi];
      const wardNames = JSON.stringify(sv.wards.map(([n, w]) => `Ward ${n}/${w}`));
      let svId: number;
      const r = await db.execute(sql`SELECT id FROM supervisors WHERE phone = ${sv.phone} LIMIT 1`);
      if (r.rows.length > 0) {
        svId = r.rows[0].id as number;
      } else {
        const ins = await db.execute(sql`
          INSERT INTO supervisors (name, phone, panchayat_name, health_inspector_id, ward_names)
          VALUES (${sv.name}, ${sv.phone}, ${PANCHAYAT}, ${hiId}, ${wardNames}::jsonb) RETURNING id
        `);
        svId = ins.rows[0].id as number;
      }
      await ensureUser(sv.phone, sv.name, "supervisor", svId);
    }

    // ── Community Mobilisers ───────────────────────────────────────────────
    const mobiliserList = [
      { name: "Smt. Anasooya",       phone: "9480113566", wardNum: 1,  wardName: "Kola" },
      { name: "Smt. Roopa Sandesh",  phone: "8073001725", wardNum: 3,  wardName: "Malpe Central" },
      { name: "Smt. Vishala",        phone: "8660649340", wardNum: 10, wardName: "Gopalapura" },
      { name: "Mrs. Usha",           phone: "9964786320", wardNum: 4,  wardName: "Kodavoor" },
      { name: "Smt. Usha K",         phone: "9742028159", wardNum: 9,  wardName: "Subhrahmanya Nagar" },
      { name: "Smt. Amrutha Rao",    phone: "9380752725", wardNum: 7,  wardName: "Kodankuru" },
      { name: "Smt. Rashmi",         phone: "9632268961", wardNum: 8,  wardName: "Nittur" },
      { name: "Smt. Vanishree",      phone: "7019922564", wardNum: 28, wardName: "Bannanje" },
      { name: "Smt. Namratha",       phone: "9538608770", wardNum: 25, wardName: "Kunjibettu" },
      { name: "Smt. Sapthami",       phone: "9353499589", wardNum: 26, wardName: "Kadiyali" },
      { name: "Smt. Chandrika",      phone: "9743662050", wardNum: 27, wardName: "Gundibailu" },
      { name: "Smt. Reshma",         phone: "8746819027", wardNum: 22, wardName: "76 Badagubettu" },
      { name: "Smt. Thulasini",      phone: "8748967646", wardNum: 31, wardName: "Bailoor" },
      { name: "Smt. Nalini Prabhu",  phone: "6361668572", wardNum: 23, wardName: "Chitpady" },
      { name: "Mrs. Deepika",        phone: "8296368243", wardNum: 29, wardName: "Tenkapete" },
      { name: "Smt. Nirmitha",       phone: "9743579735", wardNum: 33, wardName: "Ajjarakadu" },
      { name: "Smt. Chaithra",       phone: "9481213815", wardNum: 11, wardName: "Kakkunje" },
      { name: "Smt. Akshaya C",      phone: "7899101290", wardNum: 13, wardName: "Moodu Perampalli" },
      { name: "Smt. Deepa",          phone: "8618325567", wardNum: 19, wardName: "Moodu Sagri" },
      { name: "Smt. Pruthvi",        phone: "9880715984", wardNum: 20, wardName: "Indrali" },
      { name: "Smt. Akshaya",        phone: "8971681037", wardNum: 21, wardName: "Indira Nagar" },
      { name: "Smt. Sangeetha",      phone: "9964586450", wardNum: 16, wardName: "Parkala" },
      { name: "Smt. Ramya",          phone: "9741874680", wardNum: 15, wardName: "Shettibettu" },
      { name: "Smt. Abhirami",       phone: "8147125096", wardNum: 14, wardName: "Saralabettu" },
    ];

    for (const cm of mobiliserList) {
      let cmId: number;
      const r = await db.execute(sql`SELECT id FROM community_mobilisers WHERE phone = ${cm.phone} LIMIT 1`);
      if (r.rows.length > 0) {
        cmId = r.rows[0].id as number;
      } else {
        const ins = await db.execute(sql`
          INSERT INTO community_mobilisers (name, phone, panchayat_name, ward_name, ward_number)
          VALUES (${cm.name}, ${cm.phone}, ${PANCHAYAT}, ${cm.wardName}, ${cm.wardNum}) RETURNING id
        `);
        cmId = ins.rows[0].id as number;
      }
      await ensureUser(cm.phone, cm.name, "community_mobiliser", cmId);
    }

    logger.info("Udupi hierarchy accounts seeded");
  } catch (err) {
    logger.warn({ err }, "Could not seed Udupi hierarchy");
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

// ── Self-healing: ensure all known hierarchy accounts always have the shared
// password unlocked. Runs on every boot so a DB wipe auto-recovers on restart.
async function ensureHierarchyPasswordsUnlocked() {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const { hashPassword } = await import("./lib/auth");

    const knownHash = await hashPassword("Udupi@1234");

    // Every phone number in the Udupi hierarchy — EE, Commissioner, HIs,
    // supervisors, and community mobilisers.
    const knownPhones = [
      "7624851225", // EE — Ravi Prakash
      "8277293917", // Commissioner — Mahantesh Hangaragi
      // Health Inspectors
      "9739296004", "9535052544", "9845905977", "9964213243",
      // Supervisors
      "8431564819", "9844963244", "9743600255", "9743883501",
      "8105136113", "7676880597", "9880605830", "9901995778",
      "8861038802", "9035088749", "9880625188",
      // Community Mobilisers
      "9480113566", "8073001725", "8660649340", "9964786320",
      "9742028159", "9380752725", "9632268961", "7019922564",
      "9538608770", "9353499589", "9743662050", "8746819027",
      "8748967646", "6361668572", "8296368243", "9743579735",
      "9481213815", "7899101290", "8618325567", "9880715984",
      "8971681037", "9964586450", "9741874680", "8147125096",
    ];

    // Only migrate accounts still in the legacy locked/pending-activation state.
    // Once a user has set their own password (activation_token = NULL and
    // password_reset_required = false) we leave their credential untouched.
    // This makes the update fully idempotent and non-destructive.
    for (const phone of knownPhones) {
      await db.execute(sql`
        UPDATE users
        SET password_hash           = ${knownHash},
            password_reset_required  = false,
            activation_token         = NULL
        WHERE phone = ${phone}
          AND (activation_token IS NOT NULL OR password_reset_required = true)
      `);
    }

    logger.info("Hierarchy account passwords normalised to known shared password (legacy-locked accounts only)");
  } catch (err) {
    logger.warn({ err }, "Could not normalise hierarchy passwords");
  }
}

async function seedOfficerPanchayatNames() {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    // Only backfill officers that have no panchayat set yet; never overwrite a
    // valid panchayat assignment (e.g. Udupi officers seeded later).
    await db.execute(sql`
      UPDATE officers SET panchayat_name = 'Saligrama'
      WHERE panchayat_name IS NULL AND deleted_at IS NULL
    `);
    logger.info("Officer panchayat names backfilled (NULL → Saligrama)");
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
    await db.execute(sql`
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false
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
  // Must run before any Drizzle query — adds phone column if missing
  await bootstrapPhoneColumn();
  await ensureAdminExists();
  await ensureReportsColumns();
  await ensurePushSubscriptionsColumns();
  await migrateRoles();
  await ensurePanchayatAdmin();
  await seedOfficerPanchayatNames();
  await clearBrokenDiskImageRefs();
  await relocateDemoReportsToSaligrama();
  // Udupi hierarchy — must run after clearBrokenDiskImageRefs so the
  // system_migrations table already exists
  await ensureUdupiHierarchyTables();
  await seedUdupiHierarchy();
  await ensureHierarchyPasswordsUnlocked();

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
