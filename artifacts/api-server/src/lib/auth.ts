import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable, officersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
  /** When true the user must change their password before any API access */
  passwordResetRequired?: boolean;
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
  // commissioner inherits all panchayat_admin permissions
  return role === "panchayat_admin" || role === "commissioner";
}

function isFieldOfficerRole(role: string): boolean {
  return role === "field_officer" || role === "officer";
}

function isSupervisorRole(role: string): boolean {
  return role === "supervisor";
}

function isHealthInspectorRole(role: string): boolean {
  return role === "health_inspector";
}

function isEnvEngineerRole(role: string): boolean {
  return role === "environmental_engineer";
}

function isCommissionerRole(role: string): boolean {
  return role === "commissioner";
}

function isCommunityMobiliserRole(role: string): boolean {
  return role === "community_mobiliser";
}

/**
 * Check the DB for the current password_reset_required flag.
 * Used as a slow-path fallback for pre-rotation sessions that predate the
 * flag being embedded in the session cookie.
 * Fails open (returns false) on DB errors so a transient error never locks
 * out all users.
 */
async function fetchDbResetFlag(userId: number): Promise<boolean> {
  try {
    const rows = await db.execute(
      sql`SELECT password_reset_required FROM users WHERE id = ${userId} LIMIT 1`,
    );
    return (rows.rows[0] as any)?.password_reset_required === true;
  } catch {
    return false;
  }
}

/**
 * Deny with 403 if the user must change their password.
 *
 * Fast path: session cookie already carries the flag (set at login for new
 * hierarchy accounts).
 *
 * Slow path: DB lookup for stale pre-rotation sessions that predate the flag
 * being embedded — one SELECT by primary key, < 1 ms on the same host.
 *
 * Returns true (and writes the 403 response) when the request is denied.
 * The only routes exempt from this check are POST /auth/change-password and
 * POST /auth/activate, both of which call getSessionUser() directly.
 */
async function denyIfPasswordResetRequired(
  user: SessionUser,
  res: Response,
): Promise<boolean> {
  if (user.passwordResetRequired) {
    res.status(403).json({
      error: "Password change required before accessing this resource",
      passwordResetRequired: true,
    });
    return true;
  }
  // Slow path: catch pre-rotation sessions that lack the flag in their cookie
  if (await fetchDbResetFlag(user.id)) {
    res.status(403).json({
      error: "Password change required before accessing this resource",
      passwordResetRequired: true,
    });
    return true;
  }
  return false;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  (req as any).user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isControlCenterRole(user.role)) { res.status(403).json({ error: "Control Center access required" }); return; }
  (req as any).user = user;
  next();
}

export async function requireControlCenter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isControlCenterRole(user.role)) { res.status(403).json({ error: "Control Center access required" }); return; }
  (req as any).user = user;
  next();
}

export async function requirePanchayatAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isPanchayatAdminRole(user.role)) { res.status(403).json({ error: "Panchayat Admin access required" }); return; }
  (req as any).user = user;
  next();
}

export async function requirePanchayatOrControlCenter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isControlCenterRole(user.role) && !isPanchayatAdminRole(user.role)) { res.status(403).json({ error: "Admin or Panchayat Admin access required" }); return; }
  (req as any).user = user;
  next();
}

export async function requireOfficer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isFieldOfficerRole(user.role)) { res.status(403).json({ error: "Field Officer access required" }); return; }
  (req as any).user = user;
  next();
}

export async function requireSupervisor(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isSupervisorRole(user.role)) { res.status(403).json({ error: "Supervisor access required" }); return; }
  (req as any).user = user;
  next();
}

export async function requireHealthInspector(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isHealthInspectorRole(user.role)) { res.status(403).json({ error: "Health Inspector access required" }); return; }
  (req as any).user = user;
  next();
}

export async function requireEnvEngineer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isEnvEngineerRole(user.role)) { res.status(403).json({ error: "Environmental Engineer access required" }); return; }
  (req as any).user = user;
  next();
}

export async function requireCommissioner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isCommissionerRole(user.role)) { res.status(403).json({ error: "Commissioner access required" }); return; }
  (req as any).user = user;
  next();
}

export async function requireCommunityMobiliser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getSessionUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (await denyIfPasswordResetRequired(user, res)) return;
  if (!isCommunityMobiliserRole(user.role)) { res.status(403).json({ error: "Community Mobiliser access required" }); return; }
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
