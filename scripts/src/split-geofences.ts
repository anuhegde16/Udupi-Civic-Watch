/**
 * Splits the master ward-boundary file into the small per-panchayat files the web app loads on demand.
 *
 *   master (edit this):  artifacts/api-server/src/data/geofences.json
 *   generated (don't edit by hand):
 *     artifacts/cleanspot/src/data/geo/index.json     small list: names, ward lists, bounding boxes
 *     artifacts/cleanspot/src/data/geo/<slug>.json    one panchayat's outline + wards
 *
 * Adding a new panchayat:
 *   1. Append its features (1 "district" outline + its "ward" polygons) to the master file.
 *   2. Run:  pnpm --filter @workspace/scripts run geo:split
 *   3. Commit the master file and the regenerated geo/ folder.
 *
 * `--check` regenerates in memory and exits with an error if the committed files are out of date.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const masterPath = resolve(here, "../../artifacts/api-server/src/data/geofences.json");
const outDir = resolve(here, "../../artifacts/cleanspot/src/data/geo");

type Feature = {
  type: "Feature";
  properties: { name: string; type: string; panchayat: string; wardName?: string };
  geometry: { type: string; coordinates: number[][][] };
};

const master = JSON.parse(readFileSync(masterPath, "utf-8")) as { features: Feature[] };

const order: string[] = [];
const byPanchayat = new Map<string, Feature[]>();
for (const f of master.features) {
  const p = f.properties.panchayat;
  if (!p) throw new Error(`Feature "${f.properties.name}" has no panchayat property`);
  if (f.geometry.type !== "Polygon") throw new Error(`Feature "${f.properties.name}" is not a Polygon`);
  if (!byPanchayat.has(p)) {
    byPanchayat.set(p, []);
    order.push(p);
  }
  byPanchayat.get(p)!.push(f);
}

const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const outputs = new Map<string, string>();
const index: unknown[] = [];
for (const name of order) {
  const features = byPanchayat.get(name)!;
  const slug = slugOf(name);
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const f of features) {
    for (const [lon, lat] of f.geometry.coordinates[0]) {
      if (lat < s) s = lat;
      if (lat > n) n = lat;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
    }
  }
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  const wards = features
    .filter((f) => f.properties.type === "ward")
    .map((f) => (f.properties.wardName ? { name: f.properties.name, label: f.properties.wardName } : { name: f.properties.name }));
  index.push({ name, slug, wardCount: wards.length, bbox: [r(s), r(w), r(n), r(e)], wards });
  outputs.set(`${slug}.json`, JSON.stringify({ type: "FeatureCollection", features }));
}
outputs.set("index.json", JSON.stringify({ panchayats: index }, null, 1) + "\n");

if (process.argv.includes("--check")) {
  const stale: string[] = [];
  for (const [file, content] of outputs) {
    const p = join(outDir, file);
    if (!existsSync(p) || readFileSync(p, "utf-8") !== content) stale.push(file);
  }
  for (const file of existsSync(outDir) ? readdirSync(outDir) : []) {
    if (file.endsWith(".json") && !outputs.has(file)) stale.push(`${file} (no longer in master)`);
  }
  if (stale.length) {
    console.error(`Out of date: ${stale.join(", ")}\nRun: pnpm --filter @workspace/scripts run geo:split`);
    process.exit(1);
  }
  console.log(`Ward data is up to date (${order.length} panchayats, ${master.features.length} features).`);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(outDir)) {
    if (file.endsWith(".json") && !outputs.has(file)) unlinkSync(join(outDir, file));
  }
  for (const [file, content] of outputs) writeFileSync(join(outDir, file), content, "utf-8");
  console.log(`Wrote ${outputs.size} files to ${outDir} (${order.length} panchayats, ${master.features.length} features).`);
}
