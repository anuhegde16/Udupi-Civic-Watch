import { Router, type IRouter } from "express";
import { db, usersTable, officersTable, passwordResetsTable } from "@workspace/db";
import { eq, and, gt, isNull, sql } from "drizzle-orm";
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

  const { email: identifier, password } = parsed.data;

  // Accept phone number (no "@") or email address
  const isPhoneLogin = !identifier.includes("@");
  // Normalise phone: strip country code prefix, keep last 10 digits
  const normalizedPhone = isPhoneLogin
    ? identifier.replace(/^\+91/, "").replace(/\D/g, "").slice(-10)
    : null;

  // Reject phone identifiers that are too short to be valid (< 10 digits)
  if (isPhoneLogin && (!normalizedPhone || normalizedPhone.length < 10)) {
    res.status(401).json({ error: "Invalid credentials", message: "Phone/email or password incorrect" });
    return;
  }

  let user: typeof usersTable.$inferSelect | undefined;
  if (isPhoneLogin && normalizedPhone) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.phone, normalizedPhone)).limit(1);
  } else {
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, identifier)).limit(1);
  }

  if (!user) {
    res.status(401).json({ error: "Invalid credentials", message: "Phone/email or password incorrect" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials", message: "Phone/email or password incorrect" });
    return;
  }

  const isFieldOfficer = user.role === "field_officer" || user.role === "officer";

  let officerId: number | null = null;
  if (isFieldOfficer) {
    // Field officers: link via officersTable (email-based legacy lookup)
    const [officer] = await db.select().from(officersTable).where(eq(officersTable.email, user.email)).limit(1);
    if (officer) officerId = officer.id;
  } else if (user.officerId) {
    // Hierarchy roles (supervisor, health_inspector, environmental_engineer,
    // community_mobiliser): profile table id is stored in users.officerId at seed time
    officerId = parseInt(user.officerId, 10) || null;
  }

  const passwordResetRequired = (user as any).passwordResetRequired === true;

  // ── Token-provisioned account check ────────────────────────────────────────
  // Accounts seeded with a one-time activation_token have an unguessable
  // password hash. Even if the password check above passed (impossible in
  // practice), we must never route such users to the change-password page
  // because they do not know their "current" password.
  // Instead we respond without issuing a session, telling the client to
  // direct the user to their activation link.
  if (passwordResetRequired) {
    const tokenRow = await db.execute(
      sql`SELECT activation_token FROM users WHERE id = ${user.id} LIMIT 1`
    );
    const hasActivationToken =
      (tokenRow.rows[0] as any)?.activation_token != null;

    if (hasActivationToken) {
      // No session issued — user must activate via the token link.
      res.status(403).json({
        requiresActivation: true,
        message:
          "Your account has not been activated. Please use the activation link sent by your administrator, or contact them to get your link.",
      });
      return;
    }
  }

  const sessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    officerId,
    panchayatName: user.panchayatName ?? null,
    // Embed the reset flag in the session so requireAuth can enforce it on
    // every request without a DB round-trip.
    ...(passwordResetRequired ? { passwordResetRequired: true } : {}),
  };

  const token = signSession(sessionUser);

  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Admin-forced reset (activation_token is NULL — user knows current password).
  // Session IS issued; requireAuth denies every other route until they change it.
  if (passwordResetRequired) {
    res.json({ user: sessionUser, passwordResetRequired: true });
    return;
  }

  res.json({ user: sessionUser });
});

// ── Change password (required for seeded hierarchy accounts) ──────────────────

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, sessionUser.id))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(usersTable)
    .set({ passwordHash: newHash, passwordResetRequired: false } as any)
    .where(eq(usersTable.id, user.id));

  // Re-issue a clean session without the passwordResetRequired flag so the
  // client can proceed immediately without a full re-login.
  const cleanSession = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    officerId: sessionUser.officerId ?? null,
    panchayatName: user.panchayatName ?? null,
    // passwordResetRequired intentionally omitted
  };
  const newToken = signSession(cleanSession);
  res.cookie("session", newToken, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ success: true, message: "Password changed successfully", user: cleanSession });
});

// ── Activate account (one-time token, replaces need to distribute a shared password) ─

router.post("/auth/activate", async (req, res): Promise<void> => {
  const { activationToken, newPassword } = req.body ?? {};
  if (!activationToken || typeof activationToken !== "string") {
    res.status(400).json({ error: "activationToken is required" });
    return;
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "newPassword must be at least 8 characters" });
    return;
  }

  const newHash = await hashPassword(newPassword);

  // Atomically consume the activation token: the UPDATE only matches when
  // both the token AND password_reset_required are still set. If two
  // concurrent requests race, only one UPDATE will affect a row; the other
  // will see rowCount=0 and receive a 401 without getting a session.
  const updated = await db.execute(sql`
    UPDATE users
    SET password_hash = ${newHash}, password_reset_required = false, activation_token = NULL
    WHERE activation_token = ${activationToken} AND password_reset_required = true
    RETURNING id, email, name, role, officer_id, panchayat_name
  `);

  if (updated.rowCount === 0) {
    res.status(401).json({ error: "Invalid or already-used activation token" });
    return;
  }

  const user = updated.rows[0] as any;

  // Issue a full authenticated session immediately
  const sessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    officerId: user.officer_id ? parseInt(user.officer_id, 10) : null,
    panchayatName: user.panchayat_name ?? null,
    // passwordResetRequired intentionally absent
  };
  const token = signSession(sessionUser);
  res.cookie("session", token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, user: sessionUser });
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
