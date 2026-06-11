import { Router, type IRouter } from "express";
import { db, usersTable, officersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import {
  comparePassword,
  signSession,
  getSessionUser,
} from "../lib/auth";

const router: IRouter = Router();

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

  res.json({
    user: sessionUser,
  });
});

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

export default router;
