/**
 * Per-panchayat public visibility toggle.
 *
 * Controls whether an area is currently open to the public — accepting new
 * complaints via POST /reports, and showing its existing reports on the
 * public map (GET /reports/public/map). Persisted in Postgres (the
 * `panchayat_settings` table) rather than in memory, because the API server
 * restarts periodically (deploys, and an existing unrelated crash-loop) and
 * a flag this important must survive that — unlike test-mode, which is
 * intentionally ephemeral.
 *
 * A panchayat with no row is treated as visible (fail-open to the existing
 * default behavior) — a row only gets written the first time a master admin
 * actually turns an area off.
 *
 * This does NOT affect staff-facing access: officer, supervisor, and
 * panchayat-admin dashboards keep working normally for a hidden area so
 * staff can still manage the existing backlog. No report data is ever
 * deleted by this toggle.
 */
import { db, panchayatSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import geofencesData from "../data/geofences.json";
import { logger } from "./logger";

/** Every panchayat name known to the geofence data, in a stable order. */
export function getKnownPanchayatNames(): string[] {
  const names = new Set<string>();
  for (const feature of geofencesData.features) {
    const panchayat = (feature.properties as { panchayat?: string })?.panchayat;
    if (panchayat) names.add(panchayat);
  }
  return Array.from(names).sort();
}

/** Visibility for every known panchayat, e.g. { Saligrama: true, Udupi: false }. */
export async function getAllPanchayatVisibility(): Promise<Record<string, boolean>> {
  const rows = await db.select().from(panchayatSettingsTable);
  const overrides = new Map(rows.map((r) => [r.panchayatName, r.isVisible]));
  const result: Record<string, boolean> = {};
  for (const name of getKnownPanchayatNames()) {
    result[name] = overrides.get(name) ?? true;
  }
  return result;
}

/** Visibility for one panchayat; defaults to true (visible) when no row exists. */
export async function isPanchayatVisible(panchayatName: string): Promise<boolean> {
  const [row] = await db
    .select({ isVisible: panchayatSettingsTable.isVisible })
    .from(panchayatSettingsTable)
    .where(eq(panchayatSettingsTable.panchayatName, panchayatName))
    .limit(1);
  return row?.isVisible ?? true;
}

export async function setPanchayatVisibility(
  panchayatName: string,
  isVisible: boolean,
  updatedByEmail: string | null
): Promise<void> {
  await db
    .insert(panchayatSettingsTable)
    .values({ panchayatName, isVisible, updatedByEmail })
    .onConflictDoUpdate({
      target: panchayatSettingsTable.panchayatName,
      set: { isVisible, updatedByEmail },
    });
  logger.info({ panchayatName, isVisible, updatedByEmail }, "Panchayat public visibility updated");
}
