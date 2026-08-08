import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("field_officer"),
  officerId: text("officer_id"),
  panchayatName: text("panchayat_name"),
  // Phone-number login: for Udupi hierarchy accounts that have no email address.
  // Placeholder email `{phone}@phone.local` is stored in the email column;
  // login looks up by this column when the identifier has no "@".
  phone: text("phone"),
  // When true the user must change their password before the session is issued.
  // Set to true for all seeded hierarchy accounts (shared initial password).
  passwordResetRequired: boolean("password_reset_required").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
