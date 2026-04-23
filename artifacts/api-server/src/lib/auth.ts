import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable, officersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcryptjs";
import { logger } from "./logger";

const SESSION_SECRET = process.env.SESSION_SECRET || "cleanspot-secret";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
  officerId?: number | null;
}

export function signSession(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64");
  const sig = Buffer.from(`${payload}.${SESSION_SECRET}`).toString("base64");
  return `${payload}.${sig}`;
}

export function verifySession(token: string): SessionUser | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const sig = parts[parts.length - 1];
    const payload = parts.slice(0, -1).join(".");
    const expectedSig = Buffer.from(`${payload}.${SESSION_SECRET}`).toString("base64");
    if (sig !== expectedSig) return null;
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function getSessionUser(req: Request): SessionUser | null {
  const token = req.cookies?.session;
  if (!token) return null;
  return verifySession(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  (req as any).user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  (req as any).user = user;
  next();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function ensureAdminExists(): Promise<void> {
  const existing = await db.select().from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
  if (existing.length === 0) {
    const hash = await hashPassword("admin123");
    await db.insert(usersTable).values({
      email: "admin@cleanspot.gov",
      passwordHash: hash,
      name: "System Admin",
      role: "admin",
    });
    logger.info("Created default admin user: admin@cleanspot.gov / admin123");
  }
}
