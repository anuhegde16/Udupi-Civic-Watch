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

async function start() {
  await ensureAdminExists();
  await seedSampleData();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

async function seedSampleData() {
  try {
    const { db, officersTable, reportsTable } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const { hashPassword } = await import("./lib/auth");
    
    const existingOfficers = await db.select().from(officersTable).limit(1);
    if (existingOfficers.length > 0) return;

    const hash = await hashPassword("officer123");
    const { usersTable } = await import("@workspace/db");

    // Udupi district officers — Udupi Taluk and Kundapur Taluk
    const [officer1] = await db.insert(officersTable).values({
      name: "Ramesh Shetty",
      email: "ramesh@cleanspot.gov",
      passwordHash: hash,
      phone: "+91-94480-11001",
      areaName: "Udupi Taluk",
      centerLat: 13.3409,
      centerLng: 74.7421,
      radiusKm: 8.0,
    }).returning();

    const [officer2] = await db.insert(officersTable).values({
      name: "Sujata Rao",
      email: "sujata@cleanspot.gov",
      passwordHash: hash,
      phone: "+91-94480-11002",
      areaName: "Kundapur Taluk",
      centerLat: 13.6253,
      centerLng: 74.6903,
      radiusKm: 10.0,
    }).returning();

    const [officer3] = await db.insert(officersTable).values({
      name: "Vinay Hegde",
      email: "vinay@cleanspot.gov",
      passwordHash: hash,
      phone: "+91-94480-11003",
      areaName: "Karkala Taluk",
      centerLat: 13.2071,
      centerLng: 74.9978,
      radiusKm: 9.0,
    }).returning();

    await db.insert(usersTable).values([
      { email: "ramesh@cleanspot.gov", passwordHash: hash, name: "Ramesh Shetty", role: "officer", officerId: String(officer1.id) },
      { email: "sujata@cleanspot.gov", passwordHash: hash, name: "Sujata Rao", role: "officer", officerId: String(officer2.id) },
      { email: "vinay@cleanspot.gov", passwordHash: hash, name: "Vinay Hegde", role: "officer", officerId: String(officer3.id) },
    ]);

    await db.insert(reportsTable).values([
      {
        imageUrl: null,
        latitude: 13.3382,
        longitude: 74.7451,
        address: "Car Street, Udupi",
        description: "Garbage bags piled near the temple entrance, blocking pedestrian path",
        status: "reported",
        reporterIp: "192.168.1.1",
        assignedOfficerId: officer1.id,
      },
      {
        imageUrl: null,
        latitude: 13.3550,
        longitude: 74.7888,
        address: "Manipal Town, Near KMC Hospital",
        description: "Overflowing municipal bin on the main road",
        status: "cleaning",
        reporterIp: "192.168.1.2",
        assignedOfficerId: officer1.id,
      },
      {
        imageUrl: null,
        latitude: 13.6180,
        longitude: 74.6950,
        address: "Kundapur Bus Stand area",
        description: "Plastic waste dumped on roadside near market",
        status: "reported",
        reporterIp: "192.168.1.3",
        assignedOfficerId: officer2.id,
      },
      {
        imageUrl: null,
        latitude: 13.2050,
        longitude: 74.9990,
        address: "Karkala Town Circle",
        description: "Construction debris blocking storm drain",
        status: "cleaned",
        reporterIp: "192.168.1.4",
        assignedOfficerId: officer3.id,
      },
      {
        imageUrl: null,
        latitude: 13.4380,
        longitude: 74.7600,
        address: "Brahmavar Main Road",
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
