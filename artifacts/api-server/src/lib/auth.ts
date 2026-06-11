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
  panchayatName?: string | null;
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

function isControlCenterRole(role: string): boolean {
  return role === "control_center" || role === "admin";
}

function isPanchayatAdminRole(role: string): boolean {
  return role === "panchayat_admin";
}

function isFieldOfficerRole(role: string): boolean {
  return role === "field_officer" || role === "officer";
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
  if (!isControlCenterRole(user.role)) {
    res.status(403).json({ error: "Control Center access required" });
    return;
  }
  (req as any).user = user;
  next();
}

export function requireControlCenter(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!isControlCenterRole(user.role)) {
    res.status(403).json({ error: "Control Center access required" });
    return;
  }
  (req as any).user = user;
  next();
}

export function requirePanchayatAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!isPanchayatAdminRole(user.role)) {
    res.status(403).json({ error: "Panchayat Admin access required" });
    return;
  }
  (req as any).user = user;
  next();
}

export function requirePanchayatOrControlCenter(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!isControlCenterRole(user.role) && !isPanchayatAdminRole(user.role)) {
    res.status(403).json({ error: "Admin or Panchayat Admin access required" });
    return;
  }
  (req as any).user = user;
  next();
}

export function requireOfficer(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!isFieldOfficerRole(user.role)) {
    res.status(403).json({ error: "Field Officer access required" });
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
  const TARGET_EMAIL = "admin@udupicivicwatch.com";
  const TARGET_PASSWORD = "admin@udupicivicwatch.com";

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, TARGET_EMAIL))
    .limit(1);

  if (existing.length === 0) {
    const hash = await hashPassword(TARGET_PASSWORD);
    await db.insert(usersTable).values({
      email: TARGET_EMAIL,
      passwordHash: hash,
      name: "Control Center",
      role: "control_center",
    });
    logger.info("Created default control center user: admin@udupicivicwatch.com");
    return;
  }

  const admin = existing[0];
  const isCorrectPassword = await comparePassword(TARGET_PASSWORD, admin.passwordHash);
  const needsRoleUpdate = admin.role === "admin";

  if (admin.email !== TARGET_EMAIL || !isCorrectPassword || needsRoleUpdate) {
    const hash = await hashPassword(TARGET_PASSWORD);
    await db
      .update(usersTable)
      .set({
        email: TARGET_EMAIL,
        passwordHash: hash,
        role: "control_center",
        name: admin.name || "Control Center",
      })
      .where(eq(usersTable.id, admin.id));
    logger.info(`Updated control center credentials: ${TARGET_EMAIL}`);
  }
}
