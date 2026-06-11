import app from "./app";
import { logger } from "./lib/logger";
import { ensureAdminExists } from "./lib/auth";

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

async function fixImageUrls() {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      UPDATE reports
      SET image_url = CASE
        WHEN status = 'cleaning' THEN '/cleaning-photo.jpg'
        WHEN status = 'cleaned'  THEN '/cleaned-photo.jpg'
        ELSE '/garbage-photo.jpg'
      END
      WHERE image_url IS NULL
         OR image_url LIKE '/api/uploads/files/%'
    `);
    logger.info("Image URLs fixed for reports");
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
    const { eq } = await import("drizzle-orm");
    const { hashPassword } = await import("./lib/auth");

    const TARGET_EMAIL = "saligrama@udupicivicspot.com";
    const TARGET_PANCHAYAT = "Saligrama Town Panchayat";

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, TARGET_EMAIL)).limit(1);
    if (existing.length > 0) {
      if (!existing[0].panchayatName) {
        await db.update(usersTable).set({ panchayatName: TARGET_PANCHAYAT, role: "panchayat_admin" }).where(eq(usersTable.email, TARGET_EMAIL));
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
      WHERE panchayat_name IS NULL AND deleted_at IS NULL
    `);
    logger.info("Officer panchayat names backfilled to Saligrama");
  } catch (err) {
    logger.warn({ err }, "Could not backfill officer panchayat names");
  }
}

async function start() {
  await ensureAdminExists();
  await migrateRoles();
  await ensurePanchayatAdmin();
  await migrateOfficerCredentials();
  await seedSampleData();
  await seedOfficerPanchayatNames();
  await fixImageUrls();
  await relocateDemoReportsToSaligrama();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

async function migrateOfficerCredentials() {
  try {
    const { db, officersTable, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { hashPassword } = await import("./lib/auth");

    const TARGET = [
      { name: "Ramesh Shetty", email: "byndoor@udupicivicspot.com" },
      { name: "Sujata Rao",    email: "Udupi@udupicivicspot.com"   },
      { name: "Vinay Hegde",   email: "kundapur@udupicivicspot.com" },
    ];

    for (const target of TARGET) {
      const targetHash = await hashPassword(target.email);
      const [officer] = await db
        .select()
        .from(officersTable)
        .where(eq(officersTable.name, target.name))
        .limit(1);

      if (!officer) continue;

      const oldEmail = officer.email;
      const needsUpdate = officer.email !== target.email || officer.passwordHash !== targetHash;

      if (needsUpdate) {
        await db
          .update(officersTable)
          .set({ email: target.email, passwordHash: targetHash })
          .where(eq(officersTable.id, officer.id));

        const [existingUser] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, oldEmail))
          .limit(1);

        if (existingUser) {
          await db
            .update(usersTable)
            .set({ email: target.email, passwordHash: targetHash })
            .where(eq(usersTable.id, existingUser.id));
        } else {
          await db.insert(usersTable).values({
            email: target.email,
            passwordHash: targetHash,
            name: target.name,
            role: "field_officer",
            officerId: String(officer.id),
          });
        }

        logger.info(`Updated officer credentials: ${target.name} / ${target.email}`);
      }
    }
  } catch (err) {
    logger.warn({ err }, "Officer credential migration failed");
  }
}

async function seedSampleData() {
  try {
    const { db, officersTable, reportsTable } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const { hashPassword } = await import("./lib/auth");
    
    const existingOfficers = await db.select().from(officersTable).limit(1);
    if (existingOfficers.length > 0) return;

    const { usersTable } = await import("@workspace/db");

    // Password = email address for easy demo access
    const o1hash = await hashPassword("byndoor@udupicivicspot.com");
    const o2hash = await hashPassword("Udupi@udupicivicspot.com");
    const o3hash = await hashPassword("kundapur@udupicivicspot.com");

    const [officer1] = await db.insert(officersTable).values({
      name: "Ramesh Shetty",
      email: "byndoor@udupicivicspot.com",
      passwordHash: o1hash,
      phone: "+91-94480-11001",
      areaName: "Udupi Taluk",
      centerLat: 13.3409,
      centerLng: 74.7421,
    }).returning();

    const [officer2] = await db.insert(officersTable).values({
      name: "Sujata Rao",
      email: "Udupi@udupicivicspot.com",
      passwordHash: o2hash,
      phone: "+91-94480-11002",
      areaName: "Kundapur Taluk",
      centerLat: 13.6253,
      centerLng: 74.6903,
    }).returning();

    const [officer3] = await db.insert(officersTable).values({
      name: "Vinay Hegde",
      email: "kundapur@udupicivicspot.com",
      passwordHash: o3hash,
      phone: "+91-94480-11003",
      areaName: "Karkala Taluk",
      centerLat: 13.2071,
      centerLng: 74.9978,
    }).returning();

    await db.insert(usersTable).values([
      { email: "byndoor@udupicivicspot.com", passwordHash: o1hash, name: "Ramesh Shetty", role: "field_officer", officerId: String(officer1.id) },
      { email: "Udupi@udupicivicspot.com", passwordHash: o2hash, name: "Sujata Rao", role: "field_officer", officerId: String(officer2.id) },
      { email: "kundapur@udupicivicspot.com", passwordHash: o3hash, name: "Vinay Hegde", role: "field_officer", officerId: String(officer3.id) },
    ]);

    await db.insert(reportsTable).values([
      {
        imageUrl: "/garbage-photo.jpg",
        latitude: 13.5028,
        longitude: 74.7118,
        address: "Saligrama Town, NH-66",
        description: "Garbage bags piled near the temple entrance, blocking pedestrian path",
        status: "reported",
        reporterIp: "192.168.1.1",
        assignedOfficerId: officer1.id,
      },
      {
        imageUrl: "/cleaning-photo.jpg",
        latitude: 13.4975,
        longitude: 74.7082,
        address: "Swarna River Road, Near Bridge",
        description: "Overflowing municipal bin on the main road",
        status: "cleaning",
        reporterIp: "192.168.1.2",
        assignedOfficerId: officer1.id,
      },
      {
        imageUrl: "/garbage-photo.jpg",
        latitude: 13.5063,
        longitude: 74.7195,
        address: "Saligrama Market Area",
        description: "Plastic waste dumped on roadside near market",
        status: "reported",
        reporterIp: "192.168.1.3",
        assignedOfficerId: officer2.id,
      },
      {
        imageUrl: "/cleaned-photo.jpg",
        latitude: 13.4922,
        longitude: 74.7153,
        address: "Saligrama Bus Stand Road",
        description: "Construction debris blocking storm drain",
        status: "cleaned",
        reporterIp: "192.168.1.4",
        assignedOfficerId: officer3.id,
      },
      {
        imageUrl: "/garbage-photo.jpg",
        latitude: 13.5101,
        longitude: 74.7047,
        address: "Near Saligrama Gram Panchayat",
        description: "Burning garbage creating air pollution near school",
        status: "reported",
        reporterIp: "192.168.1.5",
        assignedOfficerId: officer1.id,
      },
    ]);

    logger.info("Sample data seeded successfully");
  } catch (err) {
    logger.warn({ err }, "Skipping seed data (may already exist)");
  }
}

start();
