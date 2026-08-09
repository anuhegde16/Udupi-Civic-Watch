/**
 * reset-dev-passwords.ts
 *
 * Resets passwords for all known dev hierarchy accounts (commissioner,
 * environmental engineer, health inspectors, and supervisors) to a single
 * target password you supply on the command line.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run reset:dev-passwords -- <newPassword>
 *
 * Safety guards:
 *   - Refuses to run when NODE_ENV=production
 *   - Refuses to run when DATABASE_URL looks like a cloud production database
 *     (neon.tech, supabase.co, elephantsql.com, cockroachdb, etc.)
 */

import bcryptjs from "bcryptjs";
import pg from "pg";

const { Pool } = pg;

// ── Production guards ────────────────────────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  console.error(
    "❌  Refused: NODE_ENV=production. This script is for development use only.",
  );
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL ?? "";

if (!dbUrl) {
  console.error("❌  DATABASE_URL must be set.");
  process.exit(1);
}

// Blocklist of hostnames that indicate a cloud/production database.
const PRODUCTION_HOST_PATTERNS = [
  /\.neon\.tech/,
  /\.supabase\.co/,
  /\.elephantsql\.com/,
  /\.cockroachdb\.com/,
  /\.amazonaws\.com/,
  /\.rds\./,
  /\.digitalocean\.com/,
  /\.railway\.app/,
  /\.render\.com/,
];

const urlHostMatch = dbUrl.match(/(?:@|\/\/)([^/:?]+)/);
const dbHost = urlHostMatch?.[1] ?? "";

const looksLikeProduction = PRODUCTION_HOST_PATTERNS.some((pat) =>
  pat.test(dbHost),
);

if (looksLikeProduction) {
  console.error(
    `❌  Refused: DATABASE_URL points to a host that looks like a production database (${dbHost}).`,
  );
  console.error(
    "    Set DATABASE_URL to your local/dev database before running this script.",
  );
  process.exit(1);
}

// ── Argument parsing ─────────────────────────────────────────────────────────

// Strip leading "--" separator that pnpm injects when using "-- <arg>"
const args = process.argv.slice(2).filter((a) => a !== "--");
const newPassword = args[0];

if (!newPassword || newPassword.trim() === "") {
  console.error(
    "Usage: pnpm --filter @workspace/scripts run reset:dev-passwords -- <newPassword>",
  );
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error("❌  Password must be at least 6 characters.");
  process.exit(1);
}

// ── Dev hierarchy accounts ───────────────────────────────────────────────────
//
// These are the phone numbers used as identifiers in seedUdupiHierarchy()
// (artifacts/api-server/src/index.ts).  Email is derived as <phone>@phone.local.

const DEV_HIERARCHY_PHONES = [
  // Commissioner
  "8277293917",
  // Environmental Engineer
  "7624851225",
  // Health Inspectors
  "9739296004",
  "9535052544",
  "9845905977",
  "9964213243",
  // Supervisors
  "8431564819",
  "9844963244",
  "9743600255",
  "9743883501",
  "8105136113",
  "7676880597",
  "9880605830",
  "9901995778",
  "8861038802",
  "9035088749",
  "9880625188",
];

const DEV_HIERARCHY_EMAILS = DEV_HIERARCHY_PHONES.map(
  (p) => `${p}@phone.local`,
);

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  try {
    console.log("=== Dev password reset ===\n");
    console.log(`Target database host : ${dbHost || "(local)"}`);
    console.log(`Accounts to reset    : ${DEV_HIERARCHY_EMAILS.length}`);
    console.log("");

    const passwordHash = await bcryptjs.hash(newPassword, 10);

    let updated = 0;
    let missing = 0;

    for (const email of DEV_HIERARCHY_EMAILS) {
      const { rows } = await client.query<{ id: number; name: string }>(
        `SELECT id, name FROM users WHERE email = $1 LIMIT 1`,
        [email],
      );

      if (rows.length === 0) {
        console.log(`  ⚠  Not found (may not be seeded yet): ${email}`);
        missing++;
        continue;
      }

      const { id, name } = rows[0];

      await client.query(
        `UPDATE users
         SET password_hash            = $1,
             password_reset_required  = false,
             activation_token         = NULL
         WHERE id = $2`,
        [passwordHash, id],
      );

      console.log(`  ✓  [${String(id).padStart(4)}] ${name} (${email})`);
      updated++;
    }

    console.log("\n=== Summary ===");
    console.log(`Updated : ${updated}`);
    if (missing > 0) {
      console.log(
        `Skipped : ${missing}  (run the server once to seed these accounts first)`,
      );
    }
    console.log("\n✅  Done");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
