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

async function start() {
  await ensureAdminExists();
  await migrateOfficerCredentials();
  await seedSampleData();
  await fixImageUrls();

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
            role: "officer",
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
      radiusKm: 8.0,
    }).returning();

    const [officer2] = await db.insert(officersTable).values({
      name: "Sujata Rao",
      email: "Udupi@udupicivicspot.com",
      passwordHash: o2hash,
      phone: "+91-94480-11002",
      areaName: "Kundapur Taluk",
      centerLat: 13.6253,
      centerLng: 74.6903,
      radiusKm: 10.0,
    }).returning();

    const [officer3] = await db.insert(officersTable).values({
      name: "Vinay Hegde",
      email: "kundapur@udupicivicspot.com",
      passwordHash: o3hash,
      phone: "+91-94480-11003",
      areaName: "Karkala Taluk",
      centerLat: 13.2071,
      centerLng: 74.9978,
      radiusKm: 9.0,
    }).returning();

    await db.insert(usersTable).values([
      { email: "byndoor@udupicivicspot.com", passwordHash: o1hash, name: "Ramesh Shetty", role: "officer", officerId: String(officer1.id) },
      { email: "Udupi@udupicivicspot.com", passwordHash: o2hash, name: "Sujata Rao", role: "officer", officerId: String(officer2.id) },
      { email: "kundapur@udupicivicspot.com", passwordHash: o3hash, name: "Vinay Hegde", role: "officer", officerId: String(officer3.id) },
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
