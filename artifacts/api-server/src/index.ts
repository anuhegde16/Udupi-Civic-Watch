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

    const [officer1] = await db.insert(officersTable).values({
      name: "Maria Santos",
      email: "maria@cleanspot.gov",
      passwordHash: hash,
      phone: "+1-555-0101",
      areaName: "Downtown District",
      centerLat: 14.5995,
      centerLng: 120.9842,
      radiusKm: 3.0,
    }).returning();

    const [officer2] = await db.insert(officersTable).values({
      name: "Carlos Rivera",
      email: "carlos@cleanspot.gov",
      passwordHash: hash,
      phone: "+1-555-0102",
      areaName: "North Zone",
      centerLat: 14.6200,
      centerLng: 120.9900,
      radiusKm: 4.0,
    }).returning();

    await db.insert(usersTable).values([
      { email: "maria@cleanspot.gov", passwordHash: hash, name: "Maria Santos", role: "officer", officerId: String(officer1.id) },
      { email: "carlos@cleanspot.gov", passwordHash: hash, name: "Carlos Rivera", role: "officer", officerId: String(officer2.id) },
    ]);

    await db.insert(reportsTable).values([
      {
        imageUrl: null,
        latitude: 14.5980,
        longitude: 120.9830,
        address: "123 Rizal Ave, Downtown",
        description: "Large pile of construction debris blocking sidewalk",
        status: "reported",
        reporterIp: "192.168.1.1",
        assignedOfficerId: officer1.id,
      },
      {
        imageUrl: null,
        latitude: 14.5970,
        longitude: 120.9860,
        address: "45 Mabini St, Downtown",
        description: "Overflowing trash bins near market",
        status: "cleaning",
        reporterIp: "192.168.1.2",
        assignedOfficerId: officer1.id,
      },
      {
        imageUrl: null,
        latitude: 14.6190,
        longitude: 120.9910,
        address: "78 Quezon Blvd, North",
        description: "Illegal dumping site along canal",
        status: "reported",
        reporterIp: "192.168.1.3",
        assignedOfficerId: officer2.id,
      },
      {
        imageUrl: null,
        latitude: 14.6210,
        longitude: 120.9880,
        address: "12 Aurora Blvd, North",
        description: "Garbage bags left on street",
        status: "cleaned",
        reporterIp: "192.168.1.4",
        assignedOfficerId: officer2.id,
      },
    ]);

    logger.info("Sample data seeded successfully");
  } catch (err) {
    logger.warn({ err }, "Skipping seed data (may already exist)");
  }
}

start();
