import { pgTable, text, serial, timestamp, real, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { officersTable } from "./officers";

export interface PhotoItem {
  url: string;
  uploadedAt: string;
}

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url"),
  imageUploadedAt: timestamp("image_uploaded_at", { withTimezone: true }),
  imageUrls: jsonb("image_urls").$type<PhotoItem[]>(),
  cleanupImageUrl: text("cleanup_image_url"),
  cleanupImageUrls: jsonb("cleanup_image_urls").$type<PhotoItem[]>(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  address: text("address"),
  description: text("description"),
  status: text("status").notNull().default("reported"),
  reporterIp: text("reporter_ip"),
  reporterEmail: text("reporter_email"),
  assignedOfficerId: integer("assigned_officer_id").references(() => officersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
