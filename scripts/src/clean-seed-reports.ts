/**
 * clean-seed-reports.ts
 *
 * Deletes all rows whose description starts with '[SEED]'.
 * Run this before re-seeding to get a clean slate:
 *
 *   pnpm --filter @workspace/scripts run seed:clean
 *   pnpm --filter @workspace/scripts run seed:ward-reports
 */

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== Cleaning seed reports ===\n");

    const result = await client.query(
      `DELETE FROM reports WHERE description LIKE '[SEED]%'`
    );

    const count = result.rowCount ?? 0;
    console.log(`✅ Deleted ${count} seed report${count === 1 ? "" : "s"}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
