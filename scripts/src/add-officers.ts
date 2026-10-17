/**
 * Add the field officers of ONE panchayat from a CSV file (works for any panchayat).
 *
 *   pnpm --filter @workspace/scripts run add:officers -- --panchayat Byndoor --file /path/officers.csv
 *   pnpm --filter @workspace/scripts run add:officers -- --panchayat Byndoor --file /path/officers.csv --apply
 *   add  --password phone  to use each officer's phone number as the temporary password
 *
 * Without --apply nothing is written: it only shows what WOULD happen (a dry run).
 *
 * CSV columns, with a header row:   ward,name,phone,email
 *   ward   = ward number (3) or the full ward name ("Byndoor Ward 3")
 *   phone  = 10-digit mobile number (officers can log in with it)
 *   email  = optional, may be left empty
 *
 * What it does for each row (same result as adding the officer in the admin screen):
 *   - creates the officer, linked to that ward, with the ward's centre point
 *   - creates the login (role field_officer) so they can sign in with phone or email
 *   - gives a temporary password and forces a new one at first login
 *
 * Fixing passwords of officers who were already added (--reset):
 *   Gives officers who were added earlier a new temporary password (random or phone, see below).
 *   Only touches accounts that still have the forced-change flag on, i.e. the officer has NOT
 *   yet chosen their own password. Anyone who already changed their password is left alone.
 *   Like everything else it is a dry run until you add --apply.
 *
 * Temporary password (--password):
 *   random (default) - a random 10-character password per officer, saved to a private file.
 *   phone            - the officer's own 10-digit phone number (easy to hand out, but anyone who
 *                      knows the number can log in first - ask officers to sign in and change it
 *                      the same day). Nothing is written to a password file in this mode.
 * Everything is written in ONE transaction: if any row is wrong, nothing is saved.
 * Rows whose phone or email already exists are skipped, so re-running is safe.
 *
 * The temporary passwords are NEVER printed. They are saved to a private file
 * (permissions 600) that you use to message each officer, then delete.
 * Keep the staff CSV out of git (the /private/ folder is ignored).
 */
import bcryptjs from "bcryptjs";
import pg from "pg";
import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname, resolve } from "node:path";

const { Pool } = pg;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
// pnpm runs scripts from inside the scripts/ folder; INIT_CWD is where the command was typed.
const baseDir = process.env.INIT_CWD ?? process.cwd();
const panchayat = arg("panchayat");
const fileArg = arg("file");
const file = fileArg ? resolve(baseDir, fileArg) : undefined;
const apply = process.argv.includes("--apply");
const reset = process.argv.includes("--reset");
const passwordMode = arg("password") ?? "random";
if (passwordMode !== "random" && passwordMode !== "phone") {
  console.error('--password must be "random" or "phone"');
  process.exit(1);
}
const outFile = resolve(
  baseDir,
  arg("out") ?? `officer-passwords-${(panchayat ?? "x").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
);

if (!panchayat || !file) {
  console.error("Usage: add:officers -- --panchayat <Name> --file <officers.csv> [--apply] [--out <passwords.csv>]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set (run this on the server, where the app's .env is loaded).");
  process.exit(1);
}

// ── Ward lookup (from the master boundary file) ──────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const geo = JSON.parse(
  readFileSync(join(__dirname, "../../artifacts/api-server/src/data/geofences.json"), "utf-8"),
);
const wardFeatures = geo.features.filter(
  (f: any) => f.properties?.type === "ward" && f.properties?.panchayat === panchayat,
);
if (wardFeatures.length === 0) {
  console.error(`No ward boundaries found for panchayat "${panchayat}". Check the spelling.`);
  process.exit(1);
}

function findWard(label: string): { name: string; centerLat: number; centerLng: number } | null {
  const raw = label.trim();
  const candidates = /^\d+$/.test(raw) ? [`${panchayat} Ward ${raw}`, `Ward ${raw}`] : [raw];
  const f = wardFeatures.find((w: any) => candidates.includes(w.properties.name));
  if (!f) return null;
  const ring: [number, number][] = f.geometry.coordinates[0];
  return {
    name: f.properties.name,
    centerLat: ring.reduce((s, [, lat]) => s + lat, 0) / ring.length,
    centerLng: ring.reduce((s, [lon]) => s + lon, 0) / ring.length,
  };
}

// ── Read + check the CSV ─────────────────────────────────────────────────────
interface Row {
  line: number;
  ward: { name: string; centerLat: number; centerLng: number };
  name: string;
  phone: string;
  email: string | null;
}
const problems: string[] = [];
const rows: Row[] = [];
const lines = readFileSync(file, "utf-8")
  .replace(/^﻿/, "")
  .split(/\r?\n/)
  .filter((l) => l.trim() !== "");
const header = lines.shift()?.split(",").map((h) => h.trim().toLowerCase());
if (!header || header.join(",") !== "ward,name,phone,email") {
  console.error('The first line of the CSV must be exactly:  ward,name,phone,email');
  process.exit(1);
}
lines.forEach((l, i) => {
  const line = i + 2;
  const cells = l.split(",").map((c) => c.trim());
  if (cells.length !== 4) return void problems.push(`line ${line}: expected 4 columns, found ${cells.length}`);
  const [wardLabel, name, phoneRaw, emailRaw] = cells;
  const ward = findWard(wardLabel);
  if (!ward) return void problems.push(`line ${line}: no ward "${wardLabel}" in ${panchayat}`);
  if (!name) return void problems.push(`line ${line}: name is empty`);
  const phone = phoneRaw.replace(/^\+91/, "").replace(/\D/g, "").slice(-10);
  if (phone.length !== 10) return void problems.push(`line ${line}: phone must be 10 digits`);
  const email = emailRaw ? emailRaw.toLowerCase() : null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return void problems.push(`line ${line}: email looks wrong`);
  rows.push({ line, ward, name, phone, email });
});
for (const key of ["phone", "email"] as const) {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const v = r[key];
    if (!v) continue;
    if (seen.has(v)) problems.push(`line ${r.line}: same ${key} as line ${seen.get(v)}`);
    else seen.set(v, r.line);
  }
}
if (problems.length) {
  console.error("Fix these problems in the CSV first (nothing was changed):");
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}

function tempPassword(): string {
  // No look-alike characters (0/O, 1/l/I) so it is easy to type from a message.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

async function resetExisting(client: pg.PoolClient) {
  console.log(`${apply ? "RESETTING" : "DRY RUN reset for"} passwords in ${panchayat} (temporary password: ${passwordMode})\n`);
  await client.query("BEGIN");
  const done: { ward: string; name: string; phone: string; password: string }[] = [];
  for (const r of rows) {
    const { rows: u } = await client.query(
      `SELECT id, email, password_reset_required AS must_change FROM users
       WHERE phone = $1 AND panchayat_name = $2 AND role = 'field_officer' LIMIT 1`,
      [r.phone, panchayat],
    );
    if (!u.length) {
      console.log(`  skip   ${r.ward.name.padEnd(20)} ${r.name} - no account found`);
      continue;
    }
    if (!u[0].must_change) {
      console.log(`  keep   ${r.ward.name.padEnd(20)} ${r.name} - already chose their own password (not touched)`);
      continue;
    }
    const password = passwordMode === "phone" ? r.phone : tempPassword();
    const hash = await bcryptjs.hash(password, 10);
    await client.query(`UPDATE users SET password_hash = $1, password_reset_required = true WHERE id = $2`, [hash, u[0].id]);
    await client.query(`UPDATE officers SET password_hash = $1 WHERE email = $2`, [hash, u[0].email]);
    done.push({ ward: r.ward.name, name: r.name, phone: r.phone, password });
    console.log(`  reset  ${r.ward.name.padEnd(20)} ${r.name}`);
  }
  if (!apply) {
    await client.query("ROLLBACK");
    console.log(`\nDry run only - nothing was changed. ${done.length} would be reset. Add --apply to save.`);
    return;
  }
  await client.query("COMMIT");
  console.log(`\nReset ${done.length} officers.`);
  if (done.length && passwordMode === "random") {
    const csv =
      "ward,name,phone,temporary_password\n" + done.map((c) => [c.ward, c.name, c.phone, c.password].join(",")).join("\n") + "\n";
    writeFileSync(outFile, csv, { mode: 0o600 });
    console.log(`Temporary passwords are in: ${outFile}  (private; message each officer, then delete the file)`);
  } else if (done.length) {
    console.log("Each officer logs in with their phone number as BOTH the username and the password,");
    console.log("and is asked to set a new password straight away. Ask them to do it today.");
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    if (reset) {
      await resetExisting(client);
      return;
    }
    console.log(`${apply ? "ADDING" : "DRY RUN for"} ${rows.length} officers in ${panchayat} (temporary password: ${passwordMode})\n`);
    await client.query("BEGIN");
    const created: { ward: string; name: string; phone: string; password: string }[] = [];

    for (const r of rows) {
      // The login email is the real one, or a placeholder built from the phone number.
      const loginEmail = r.email ?? `${r.phone}@phone.local`;
      const dup = await client.query(
        `SELECT 1 FROM officers WHERE deleted_at IS NULL AND (email = $1 OR phone = $2)
         UNION ALL SELECT 1 FROM users WHERE email = $1 OR phone = $2`,
        [loginEmail, r.phone],
      );
      const wardTaken = await client.query(
        `SELECT name FROM officers WHERE deleted_at IS NULL AND panchayat_name = $1 AND area_name = $2`,
        [panchayat, r.ward.name],
      );
      if (dup.rowCount) {
        console.log(`  skip   ${r.ward.name.padEnd(20)} ${r.name} - phone or email already has an account`);
        continue;
      }
      if (wardTaken.rowCount) {
        console.log(`  skip   ${r.ward.name.padEnd(20)} ${r.name} - ward already has officer ${wardTaken.rows[0].name}`);
        continue;
      }

      const password = passwordMode === "phone" ? r.phone : tempPassword();
      const hash = await bcryptjs.hash(password, 10);
      const { rows: o } = await client.query(
        `INSERT INTO officers (name, email, password_hash, phone, area_name, panchayat_name, center_lat, center_lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [r.name, loginEmail, hash, r.phone, r.ward.name, panchayat, r.ward.centerLat, r.ward.centerLng],
      );
      await client.query(
        `INSERT INTO users (email, password_hash, name, role, officer_id, panchayat_name, phone, password_reset_required, activation_token)
         VALUES ($1, $2, $3, 'field_officer', $4, $5, $6, true, NULL)`,
        [loginEmail, hash, r.name, String(o[0].id), panchayat, r.phone],
      );
      created.push({ ward: r.ward.name, name: r.name, phone: r.phone, password });
      console.log(`  add    ${r.ward.name.padEnd(20)} ${r.name}`);
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(`\nDry run only - nothing was saved. ${created.length} would be added. Add --apply to save.`);
      return;
    }
    await client.query("COMMIT");
    if (created.length && passwordMode === "phone") {
      console.log(`\nSaved ${created.length} officers.`);
      console.log("Each officer logs in with their phone number as BOTH the username and the password,");
      console.log("and is asked to set a new password straight away. Ask them to do it today.");
    } else if (created.length) {
      const csv =
        "ward,name,phone,temporary_password\n" +
        created.map((c) => [c.ward, c.name, c.phone, c.password].join(",")).join("\n") +
        "\n";
      writeFileSync(outFile, csv, { mode: 0o600 });
      console.log(`\nSaved ${created.length} officers.`);
      console.log(`Temporary passwords are in: ${outFile}  (private; message each officer, then delete the file)`);
      console.log("Each officer logs in with their phone number + temporary password and is asked to set a new password.");
    } else {
      console.log("\nNothing new to add.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed (nothing was saved):", err.message ?? err);
  process.exit(1);
});
