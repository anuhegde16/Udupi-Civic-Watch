import { Router, type IRouter } from "express";
import { db, usersTable, officersTable, passwordResetsTable } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import {
  comparePassword,
  signSession,
  getSessionUser,
  hashPassword,
} from "../lib/auth";
import { sendOtpEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { createHash, randomBytes } from "crypto";

const router: IRouter = Router();

// ── Login ──────────────────────────────────────────────────────────────────────

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", message: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid credentials", message: "Email or password incorrect" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials", message: "Email or password incorrect" });
    return;
  }

  const isFieldOfficer = user.role === "field_officer" || user.role === "officer";

  let officerId: number | null = null;
  if (isFieldOfficer) {
    const [officer] = await db.select().from(officersTable).where(eq(officersTable.email, email)).limit(1);
    if (officer) officerId = officer.id;
  }

  const sessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    officerId,
    panchayatName: user.panchayatName ?? null,
  };

  const token = signSession(sessionUser);

  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ user: sessionUser });
});

// ── Me / Logout ────────────────────────────────────────────────────────────────

router.get("/auth/me", async (req, res): Promise<void> => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(user);
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  res.clearCookie("session");
  res.json({ success: true, message: "Logged out" });
});

// ── Forgot password — step 1: send OTP ────────────────────────────────────────

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  // Always respond 200 to prevent email enumeration
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) {
    res.json({ message: "If that email is registered, a code has been sent." });
    return;
  }

  // Invalidate any previous unused OTPs for this email
  await db
    .update(passwordResetsTable)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetsTable.email, user.email), isNull(passwordResetsTable.usedAt)));

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = createHash("sha256").update(otp).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.insert(passwordResetsTable).values({
    email: user.email,
    otpHash,
    expiresAt,
  });

  sendOtpEmail(user.email, otp).catch((err) =>
    logger.warn({ err, email: user.email }, "Failed to send OTP email")
  );

  logger.info({ email: user.email }, "OTP issued for password reset");
  res.json({ message: "If that email is registered, a code has been sent." });
});

// ── Forgot password — step 2: verify OTP, get reset token ─────────────────────

router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const { email, otp } = req.body ?? {};
  if (!email || !otp) {
    res.status(400).json({ error: "email and otp are required" });
    return;
  }

  const now = new Date();
  const otpHash = createHash("sha256").update(String(otp)).digest("hex");

  const [record] = await db
    .select()
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.email, email),
        eq(passwordResetsTable.otpHash, otpHash),
        isNull(passwordResetsTable.usedAt),
        gt(passwordResetsTable.expiresAt, now)
      )
    )
    .limit(1);

  if (!record) {
    res.status(400).json({ error: "Invalid or expired code", message: "The code is incorrect or has expired. Please request a new one." });
    return;
  }

  const resetToken = randomBytes(32).toString("hex");
  const resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes to complete reset

  await db
    .update(passwordResetsTable)
    .set({ resetToken, expiresAt: resetExpiresAt })
    .where(eq(passwordResetsTable.id, record.id));

  res.json({ resetToken });
});

// ── Forgot password — step 3: set new password ────────────────────────────────

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { resetToken, newPassword } = req.body ?? {};
  if (!resetToken || !newPassword) {
    res.status(400).json({ error: "resetToken and newPassword are required" });
    return;
  }

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters", message: "Password must be at least 8 characters long." });
    return;
  }

  const now = new Date();

  const [record] = await db
    .select()
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.resetToken, resetToken),
        isNull(passwordResetsTable.usedAt),
        gt(passwordResetsTable.expiresAt, now)
      )
    )
    .limit(1);

  if (!record) {
    res.status(400).json({ error: "Invalid or expired session", message: "Your reset session has expired. Please start over." });
    return;
  }

  const passwordHash = await hashPassword(newPassword);

  // Update password in users table
  const result = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.email, record.email))
    .returning({ id: usersTable.id });

  if (result.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Also update the officers table if this is a field officer
  await db
    .update(officersTable)
    .set({ passwordHash })
    .where(eq(officersTable.email, record.email));

  // Mark the reset record as used
  await db
    .update(passwordResetsTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetsTable.id, record.id));

  logger.info({ email: record.email }, "Password reset successfully");
  res.json({ success: true });
});

export default router;
