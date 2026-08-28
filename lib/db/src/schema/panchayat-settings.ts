import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per panchayat (e.g. "Saligrama", "Udupi"). Controls whether that
 * area is currently open to the public — accepting new complaints and
 * showing its existing reports on the public map.
 *
 * A panchayat with no row here is treated as visible/active (fail-open to
 * the current default behavior) — a row only needs to be written when a
 * master admin actually turns an area off. See
 * lib/panchayat-visibility.ts in the api-server for the read/write helpers.
 *
 * This does NOT affect staff-facing access (officer/supervisor/panchayat
 * admin dashboards) — hiding an area only pauses public-facing intake and
 * the public map. Existing report data is never deleted by this toggle.
 */
export const panchayatSettingsTable = pgTable("panchayat_settings", {
  panchayatName: text("panchayat_name").primaryKey(),
  isVisible: boolean("is_visible").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedByEmail: text("updated_by_email"),
});

export const upsertPanchayatSettingSchema = createInsertSchema(panchayatSettingsTable).omit({
  updatedAt: true,
});
export type UpsertPanchayatSetting = z.infer<typeof upsertPanchayatSettingSchema>;
export type PanchayatSetting = typeof panchayatSettingsTable.$inferSelect;
