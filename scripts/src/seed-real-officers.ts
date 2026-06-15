import bcryptjs from "bcryptjs";
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = dirname(fileURLToPath(import.meta.url));
const geofencesPath = join(__dirname, "../../artifacts/api-server/src/data/geofences.json");
const geofencesData = JSON.parse(readFileSync(geofencesPath, "utf-8"));

function computeZoneGeo(zoneName: string): { centerLat: number; centerLng: number } | null {
  const feature = geofencesData.features.find(
    (f: any) => f.geometry.type === "Polygon" && f.properties?.name === zoneName
  );
  if (!feature) return null;
  const coords: [number, number][] = feature.geometry.coordinates[0];
  const lats = coords.map(([, lat]) => lat);
  const lons = coords.map(([lon]) => lon);
  return {
    centerLat: lats.reduce((s: number, v: number) => s + v, 0) / lats.length,
    centerLng: lons.reduce((s: number, v: number) => s + v, 0) / lons.length,
  };
}

const DUMMY_OFFICER_IDS = [3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

const REAL_OFFICERS = [
  { name: "Rajshekhar M",                phone: "9448263410", email: "rajshekharmattam1968@gmai.com",   ward: "Ward 1"  },
  { name: "Pradeep",                     phone: "7760297271", email: "pradeep.preetham@gamil.com",      ward: "Ward 2"  },
  { name: "Shivaraj Ramesh Naik",        phone: "9481051039", email: "shivarajrameshnaik@gmail.com",    ward: "Ward 3"  },
  { name: "Mamatha",                     phone: "9035627273", email: "mmamatha23839@gmail.com",          ward: "Ward 4"  },
  { name: "Udaya Naik",                  phone: "9900738870", email: "naikudaya68@gmail.com",            ward: "Ward 5"  },
  { name: "Sharada Bai Prabhu Hiremani", phone: "9008979298", email: "sharadahodlur@gmail.com",         ward: "Ward 6"  },
  { name: "Sumitha H.V",                 phone: "8197353162", email: "sumitha.v1980@gmail.com",          ward: "Ward 7"  },
  { name: "Praveen",                     phone: "8147447398", email: "praveen.kateel86@gmail.com",       ward: "Ward 8"  },
  { name: "Prathima",                    phone: "9481384791", email: "prathimanayari@gmail.com",         ward: "Ward 9"  },
  { name: "Dinesh",                      phone: "9743493420", email: "dineshgoldenbridge@gmail.com",     ward: "Ward 10" },
  { name: "Lohith",                      phone: "9620422944", email: "lohithpoojary63@gmail.com",        ward: "Ward 11" },
  { name: "Vasanthi",                    phone: "9964400197", email: "vasanthisudha658@gmail.com",       ward: "Ward 12" },
  { name: "Shwetha",                     phone: "9513059755", email: "swethapoojary461@gmail.com",       ward: "Ward 13" },
  { name: "Deepa",                       phone: "9845687067", email: "maheshdeepa266@gmail.com",         ward: "Ward 14" },
  { name: "Pragathi",                    phone: "7892439074", email: "kunderpragathi@gmail.com",         ward: "Ward 15" },
  { name: "Sushma",                      phone: "9902033726", email: "sushmasushma2069@gmail.com",       ward: "Ward 16" },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== Seeding real Saligrama field officers ===\n");

    const ids = DUMMY_OFFICER_IDS.join(",");

    // Step 1: NULL out report assignments for dummy officers
    await client.query(`UPDATE reports SET assigned_officer_id = NULL WHERE assigned_officer_id = ANY($1)`, [DUMMY_OFFICER_IDS]);
    console.log("✓ Nulled out report assignments for dummy officers");

    // Step 2: Delete user login rows for dummy officers
    await client.query(`DELETE FROM users WHERE officer_id = ANY($1)`, [DUMMY_OFFICER_IDS.map(String)]);
    console.log("✓ Deleted user login rows for dummy officers");

    // Step 3: Hard-delete all dummy officers
    await client.query(`DELETE FROM officers WHERE id = ANY($1)`, [DUMMY_OFFICER_IDS]);
    console.log("✓ Hard-deleted dummy officers\n");

    // Step 4: Insert 16 real officers + user rows
    console.log("Inserting real officers:");
    for (const o of REAL_OFFICERS) {
      const passwordHash = await bcryptjs.hash(o.email, 10);
      const geo = computeZoneGeo(o.ward);

      const { rows } = await client.query(
        `INSERT INTO officers (name, email, password_hash, phone, area_name, panchayat_name, center_lat, center_lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [o.name, o.email, passwordHash, o.phone, o.ward, "Saligrama", geo?.centerLat ?? null, geo?.centerLng ?? null]
      );
      const officerId = rows[0].id;

      await client.query(
        `INSERT INTO users (email, password_hash, name, role, officer_id, panchayat_name)
         VALUES ($1, $2, $3, 'field_officer', $4, 'Saligrama')`,
        [o.email, passwordHash, o.name, String(officerId)]
      );

      const geoStr = geo ? `${geo.centerLat.toFixed(4)}, ${geo.centerLng.toFixed(4)}` : "null";
      console.log(`  ✓ ${o.name.padEnd(30)} ${o.ward.padEnd(8)}  geo: ${geoStr}`);
    }

    // Step 5: Verify
    console.log("\n=== Verification ===");
    const { rows: officers } = await client.query(
      `SELECT id, name, email, area_name FROM officers WHERE deleted_at IS NULL ORDER BY id`
    );
    console.log(`Active officers: ${officers.length}`);
    for (const o of officers) {
      console.log(`  [${o.id}] ${o.name.padEnd(30)} ${o.area_name ?? "—"}`);
    }

    const { rows: userRows } = await client.query(`SELECT count(*)::int as cnt FROM users WHERE role = 'field_officer'`);
    console.log(`\nField officer user rows: ${userRows[0].cnt}`);

    const { rows: adminRows } = await client.query(
      `SELECT email, role FROM users WHERE role IN ('control_center', 'panchayat_admin') ORDER BY role`
    );
    console.log(`\nPreserved admin/panchayat accounts:`);
    for (const u of adminRows) {
      console.log(`  ${u.role}: ${u.email}`);
    }

    console.log("\n✅ Done");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
