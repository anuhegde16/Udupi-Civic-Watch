import nodemailer from "nodemailer";
import type { Officer, Report } from "@workspace/db";
import { logger } from "./logger";

const SMTP_HOST = process.env["SMTP_HOST"];
const SMTP_PORT = parseInt(process.env["SMTP_PORT"] ?? "465", 10);
const SMTP_USER = process.env["SMTP_USER"];
const SMTP_PASS = process.env["SMTP_PASS"];
const FROM_ADDRESS = process.env["SMTP_FROM"] ?? "Udupi Civic Watch <info@udupicivicwatch.in>";

function createTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const transporter = createTransport();

export function isSmtpConfigured(): boolean {
  return transporter !== null;
}

const CONTROL_CENTER_URL = "https://udupicivicwatch.in/admin/login";
const PANCHAYAT_ADMIN_URL = "https://udupicivicwatch.in/master/login";
const FIELD_OFFICER_URL = "https://udupicivicwatch.in/staff/login";
const CITIZEN_TRACK_URL = "https://udupicivicwatch.in/track";

function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Layout helpers ──────────────────────────────────────────────────────────────

function emailShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:36px 16px;">
  <tr><td align="center">
  <table role="presentation" width="100%" style="max-width:580px;">

    <!-- Government identity bar -->
    <tr>
      <td style="background:#1a3a6b;padding:10px 24px;border-radius:8px 8px 0 0;">
        <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:1.5px;color:#a8c4e8;text-transform:uppercase;text-align:center;">
          Government of Karnataka &nbsp;·&nbsp; Udupi District Administration &nbsp;·&nbsp; Swachh Bharat Mission
        </p>
      </td>
    </tr>

    <!-- Logo row -->
    <tr>
      <td style="background:#ffffff;padding:14px 24px 10px;text-align:center;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
        <img src="https://udupicivicwatch.in/ucw-logo.png"
          width="180" height="auto"
          alt="Udupi Civic Watch"
          style="display:block;margin:0 auto;max-width:180px;width:100%;height:auto;border:0;" />
      </td>
    </tr>

    <!-- Teal header -->
    <tr>
      <td style="background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%);padding:28px 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;color:#99f6e4;text-transform:uppercase;">Udupi Civic Watch</p>
              <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">${escapeHtml(title)}</p>
            </td>
            <td align="right" style="vertical-align:top;">
              <div style="width:44px;height:44px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:22px;">🌿</span>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="background:#ffffff;padding:32px;">
        ${body}
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f1f5f9;border-top:3px solid #0d9488;padding:20px 32px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 6px;font-size:11px;color:#64748b;text-align:center;line-height:1.6;">
          <strong style="color:#0d9488;">Udupi Civic Watch</strong> &nbsp;·&nbsp; Udupi District Administration &nbsp;·&nbsp; Swachh Bharat Mission<br>
          This is an automated notification. Please do not reply to this email.
        </p>
        <p style="margin:8px 0 0;font-size:10px;color:#94a3b8;text-align:center;">
          © 2025 Udupi District Administration, Karnataka, India
        </p>
        <p style="margin:10px 0 0;font-size:10px;color:#cbd5e1;text-align:center;letter-spacing:0.3px;">
          Powered by <a href="https://tripnirvigna.com" style="color:#cbd5e1;text-decoration:none;">Trip Nirvigna</a>
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;
}

function quoteBlock(quote: string, author: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td style="border-left:4px solid #0d9488;background:#f0fdfa;padding:16px 20px;border-radius:0 8px 8px 0;">
          <p style="margin:0 0 6px;font-size:15px;font-style:italic;color:#134e4a;line-height:1.7;">"${escapeHtml(quote)}"</p>
          <p style="margin:0;font-size:12px;font-weight:700;color:#0d9488;letter-spacing:0.5px;">— ${escapeHtml(author)}</p>
        </td>
      </tr>
    </table>`;
}

function reportDetailCard(report: Report): string {
  const coordsText = `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`;
  const mapsUrl = googleMapsUrl(report.latitude, report.longitude);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;overflow:hidden;">
      <tr>
        <td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Report Details</p>
        </td>
      </tr>
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;width:120px;">Report ID</td>
            <td style="padding:5px 0;font-size:14px;color:#0f172a;font-weight:700;">#${report.id}</td>
          </tr>
          ${report.description ? `
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Description</td>
            <td style="padding:5px 0;font-size:14px;color:#334155;line-height:1.5;">${escapeHtml(report.description)}</td>
          </tr>` : ""}
          ${report.address ? `
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Location</td>
            <td style="padding:5px 0;font-size:14px;color:#334155;">${escapeHtml(report.address)}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">GPS</td>
            <td style="padding:5px 0;font-size:13px;color:#334155;font-family:monospace;">
              <a href="${mapsUrl}" style="color:#0d9488;text-decoration:none;">${coordsText} ↗</a>
            </td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Reported At</td>
            <td style="padding:5px 0;font-size:14px;color:#334155;">${formatDate(report.createdAt)}</td>
          </tr>
        </table>
      </td></tr>
    </table>`;
}

function analyticsBlock(stats: { openReports: number; resolvedThisWeek: number; avgResponseHours: number; panchayatName?: string }): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:0 0 10px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">
            ${stats.panchayatName ? escapeHtml(stats.panchayatName) + " · " : ""}Area Snapshot
          </p>
        </td>
      </tr>
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="33%" style="text-align:center;background:#fef2f2;border-radius:10px;padding:16px 8px;border:1px solid #fecaca;">
                <p style="margin:0;font-size:28px;font-weight:800;color:#dc2626;">${stats.openReports}</p>
                <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px;">Open Reports</p>
              </td>
              <td width="2%" style="min-width:8px;"></td>
              <td width="33%" style="text-align:center;background:#f0fdf4;border-radius:10px;padding:16px 8px;border:1px solid #bbf7d0;">
                <p style="margin:0;font-size:28px;font-weight:800;color:#16a34a;">${stats.resolvedThisWeek}</p>
                <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;">Resolved This Week</p>
              </td>
              <td width="2%" style="min-width:8px;"></td>
              <td width="33%" style="text-align:center;background:#eff6ff;border-radius:10px;padding:16px 8px;border:1px solid #bfdbfe;">
                <p style="margin:0;font-size:28px;font-weight:800;color:#2563eb;">${stats.avgResponseHours}</p>
                <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.5px;">Avg Response Hrs</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function ctaButton(label: string, url: string, style: "primary" | "outline" = "primary"): string {
  const bg = style === "primary" ? "#0d9488" : "#ffffff";
  const color = style === "primary" ? "#ffffff" : "#0d9488";
  const border = style === "primary" ? "none" : "2px solid #0d9488";
  return `<a href="${url}" style="display:inline-block;background:${bg};color:${color};text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;border:${border};letter-spacing:0.3px;">${escapeHtml(label)}</a>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">`;
}

// ── Core send ──────────────────────────────────────────────────────────────────

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    const missing = [
      !SMTP_HOST && "SMTP_HOST",
      !SMTP_USER && "SMTP_USER",
      !SMTP_PASS && "SMTP_PASS",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`SMTP not configured — missing env vars: ${missing}`);
  }
  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
    logger.info({ to, subject }, "Email sent");
  } catch (err) {
    logger.warn({ err, to }, "Failed to send email");
    throw err;
  }
}

// ── 1. Assignment email — field officer ────────────────────────────────────────

export async function sendAssignmentEmail(officer: Officer, report: Report): Promise<void> {
  if (!officer.email) {
    logger.warn({ officerId: officer.id }, "Officer has no email — skipping");
    return;
  }

  const mapsUrl = googleMapsUrl(report.latitude, report.longitude);
  const dashUrl = FIELD_OFFICER_URL;
  const subject = `[Civic Watch] New waste report in your ward — #${report.id}`;

  const body = `
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Dear ${escapeHtml(officer.name)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
      A new waste report has been assigned to your ward. Your prompt action helps keep our community clean and healthy.
    </p>

    ${quoteBlock(
      "A clean environment is not a gift to our children — it is a duty we owe them.",
      "Swachh Bharat Mission"
    )}

    ${reportDetailCard(report)}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding-right:12px;">${ctaButton("📍 Open in Maps", mapsUrl)}</td>
        <td>${ctaButton("View Dashboard", dashUrl, "outline")}</td>
      </tr>
    </table>

    ${divider()}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      Please mark this report as <em>Cleaning</em> once you begin work and <em>Cleaned</em> when resolved.
      Your panchayat admin is notified at each step.
    </p>`;

  logger.info({ officerId: officer.id, reportId: report.id }, "Sending assignment email");
  await sendEmail(officer.email, subject, emailShell("New Report Assigned", body));
}

// ── 2. Welcome email — new field officer ──────────────────────────────────────

export async function sendWelcomeEmail(officer: Officer): Promise<void> {
  if (!officer.email) return;

  const loginUrl = FIELD_OFFICER_URL;
  const subject = `Welcome to Udupi Civic Watch — your officer account is ready`;

  const body = `
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Welcome, ${escapeHtml(officer.name)}! 🌿</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
      Your field officer account on <strong>Udupi Civic Watch</strong> has been created.
      You are now part of Udupi District's frontline team working to build a cleaner, healthier community.
    </p>

    ${quoteBlock(
      "Real change, enduring change, happens one step at a time — and every report you resolve is one step forward.",
      "Udupi District Administration"
    )}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;overflow:hidden;">
      <tr>
        <td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Your Account Details</p>
        </td>
      </tr>
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${officer.areaName ? `
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;width:130px;">Assigned Ward</td>
            <td style="padding:5px 0;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(officer.areaName)}</td>
          </tr>` : ""}
          ${officer.panchayatName ? `
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Panchayat</td>
            <td style="padding:5px 0;font-size:14px;color:#0f172a;">${escapeHtml(officer.panchayatName)}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Login Email</td>
            <td style="padding:5px 0;font-size:14px;color:#0d9488;font-family:monospace;">${escapeHtml(officer.email)}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Password</td>
            <td style="padding:5px 0;font-size:14px;color:#334155;">Same as your email (change after first login)</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td>${ctaButton("🔐 Log In to Dashboard", loginUrl)}</td>
      </tr>
    </table>

    ${divider()}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      If you did not expect this email, please contact your panchayat administrator immediately.
    </p>`;

  logger.info({ officerId: officer.id }, "Sending welcome email");
  await sendEmail(officer.email, subject, emailShell("Welcome to Civic Watch", body));
}

// ── 3. OTP / password reset ────────────────────────────────────────────────────

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const subject = `[Civic Watch] Your password reset code: ${otp}`;

  const body = `
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Password Reset Request</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
      We received a request to reset your Udupi Civic Watch password.
      Use the one-time code below — it expires in <strong>10 minutes</strong>.
    </p>

    <div style="text-align:center;margin:0 0 32px;">
      <div style="display:inline-block;background:#f0fdfa;border:2px dashed #0d9488;border-radius:14px;padding:20px 40px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#0d9488;letter-spacing:2px;text-transform:uppercase;">One-Time Code</p>
        <p style="margin:0;font-size:42px;font-weight:900;letter-spacing:16px;color:#0d9488;font-family:monospace;">${otp}</p>
      </div>
    </div>

    ${divider()}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      If you did not request a password reset, you can safely ignore this email — your password will not change.
    </p>`;

  logger.info({ to: email }, "Sending OTP email");
  await sendEmail(email, subject, emailShell("Password Reset Code", body));
}

// ── 4. Status update — panchayat admin & control center ───────────────────────

export type EmailAnalytics = {
  openReports: number;
  resolvedThisWeek: number;
  avgResponseHours: number;
  panchayatName?: string;
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; quote: string; quoteAuthor: string; verb: string }> = {
  cleaning: {
    label: "Cleaning In Progress",
    color: "#92400e",
    bg: "#fffbeb",
    verb: "started cleaning",
    quote: "Action is the foundational key to all success. Every mop, every bag, every effort counts.",
    quoteAuthor: "District Sanitation Programme",
  },
  cleaned: {
    label: "Cleaned & Resolved ✓",
    color: "#14532d",
    bg: "#f0fdf4",
    verb: "marked as cleaned",
    quote: "We do not inherit the earth from our ancestors — we borrow it from our children. Today, we gave it back a little cleaner.",
    quoteAuthor: "Swachh Bharat Mission",
  },
};

export async function sendStatusUpdateEmail(
  to: string,
  recipientName: string,
  report: Report,
  officerName: string,
  newStatus: "cleaning" | "cleaned",
  analytics?: EmailAnalytics,
  isControlCenter?: boolean
): Promise<void> {
  const mapsUrl = googleMapsUrl(report.latitude, report.longitude);
  const dashUrl = isControlCenter ? CONTROL_CENTER_URL : PANCHAYAT_ADMIN_URL;
  const meta = STATUS_META[newStatus] ?? STATUS_META.cleaned;
  const subject = `[Civic Watch] Report #${report.id} — ${meta.label}`;

  const body = `
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">
      Field officer <strong>${escapeHtml(officerName)}</strong> has <strong>${meta.verb}</strong> waste report
      <strong>#${report.id}</strong>.
    </p>

    <!-- Status badge -->
    <div style="margin:0 0 24px;">
      <span style="display:inline-block;background:${meta.bg};color:${meta.color};border:1.5px solid ${meta.color}33;
        font-size:13px;font-weight:800;padding:8px 20px;border-radius:999px;letter-spacing:0.5px;">
        ${escapeHtml(meta.label)}
      </span>
    </div>

    ${quoteBlock(meta.quote, meta.quoteAuthor)}

    ${reportDetailCard(report)}

    ${analytics ? analyticsBlock(analytics) : ""}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding-right:12px;">${ctaButton("📍 View on Map", mapsUrl)}</td>
        <td>${ctaButton("All Reports", dashUrl, "outline")}</td>
      </tr>
    </table>

    ${divider()}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      You are receiving this because you are listed as ${newStatus === "cleaned" ? "a panchayat admin or control center officer" : "a panchayat admin"} for this area.
    </p>`;

  await sendEmail(to, subject, emailShell(`Report #${report.id} Update`, body));
}

// ── 5. Welcome email — new panchayat admin ────────────────────────────────────

export async function sendPanchayatAdminWelcomeEmail(admin: {
  name: string;
  email: string;
  panchayatName?: string | null;
}): Promise<void> {
  if (!admin.email) return;

  const loginUrl = PANCHAYAT_ADMIN_URL;
  const subject = `Welcome to Udupi Civic Watch — your panchayat admin account is ready`;

  const body = `
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Welcome, ${escapeHtml(admin.name)}! 🌿</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
      Your <strong>Panchayat Admin</strong> account on <strong>Udupi Civic Watch</strong> has been created.
      You oversee field officers in your area and receive updates whenever a waste report is submitted or resolved.
    </p>

    ${quoteBlock(
      "Good governance is the foundation of a clean nation. Your oversight keeps Udupi's communities thriving.",
      "Udupi District Administration"
    )}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;overflow:hidden;">
      <tr>
        <td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Your Account Details</p>
        </td>
      </tr>
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;width:130px;">Role</td>
            <td style="padding:5px 0;font-size:14px;color:#0f172a;font-weight:600;">Panchayat Admin</td>
          </tr>
          ${admin.panchayatName ? `
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Panchayat</td>
            <td style="padding:5px 0;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(admin.panchayatName)}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Login Email</td>
            <td style="padding:5px 0;font-size:14px;color:#0d9488;font-family:monospace;">${escapeHtml(admin.email)}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Password</td>
            <td style="padding:5px 0;font-size:14px;color:#334155;">As set by your administrator — change it after your first login</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td>${ctaButton("🔐 Log In to Portal", loginUrl)}</td>
      </tr>
    </table>

    ${divider()}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      If you did not expect this email, please contact the Udupi Civic Watch control centre immediately at
      <a href="mailto:officer@udupi.gov.in" style="color:#0d9488;">officer@udupi.gov.in</a>.
    </p>`;

  logger.info({ email: admin.email }, "Sending panchayat admin welcome email");
  await sendEmail(admin.email, subject, emailShell("Panchayat Admin Account Created", body));
}

// ── 6. Reporter acknowledgement — citizen who submitted the report ─────────────

export async function sendReporterAcknowledgement(report: Report, reporterEmail: string): Promise<void> {
  const trackUrl = CITIZEN_TRACK_URL;
  const subject = `Your complaint #${report.id} has been received — Udupi Civic Watch`;

  const coordsText = `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`;
  const mapsUrl = googleMapsUrl(report.latitude, report.longitude);

  const body = `
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Thank you for reporting! 🌿</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
      Your waste complaint has been received and a field officer has been notified.
      We will keep you updated as the situation is addressed.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;overflow:hidden;">
      <tr>
        <td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Your Complaint Details</p>
        </td>
      </tr>
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;width:120px;">Complaint ID</td>
            <td style="padding:5px 0;font-size:18px;color:#0d9488;font-weight:900;font-family:monospace;">#${report.id}</td>
          </tr>
          ${report.address ? `
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Location</td>
            <td style="padding:5px 0;font-size:14px;color:#334155;">${escapeHtml(report.address)}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">GPS</td>
            <td style="padding:5px 0;font-size:13px;color:#334155;font-family:monospace;">
              <a href="${mapsUrl}" style="color:#0d9488;text-decoration:none;">${coordsText} ↗</a>
            </td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Submitted At</td>
            <td style="padding:5px 0;font-size:14px;color:#334155;">${formatDate(report.createdAt)}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Status</td>
            <td style="padding:5px 0;">
              <span style="display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;font-size:12px;font-weight:700;padding:3px 12px;border-radius:999px;">Reported</span>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td>${ctaButton("📋 Track Your Complaint", trackUrl)}</td>
      </tr>
    </table>

    ${divider()}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      You provided this email address when submitting the complaint. You will receive updates when cleaning begins and when the waste has been removed.
      Save your complaint ID <strong>#${report.id}</strong> to track progress at any time.
    </p>`;

  logger.info({ reportId: report.id, to: reporterEmail }, "Sending reporter acknowledgement email");
  await sendEmail(reporterEmail, subject, emailShell("Complaint Received", body));
}

// ── 7. Reporter status update — cleaning / cleaned ────────────────────────────

export async function sendReporterStatusUpdate(
  report: Report,
  reporterEmail: string,
  newStatus: "cleaning" | "cleaned"
): Promise<void> {
  const trackUrl = CITIZEN_TRACK_URL;

  const isCleaned = newStatus === "cleaned";
  const subject = isCleaned
    ? `✅ Waste cleaned — Complaint #${report.id} resolved`
    : `🚛 Cleaning underway — Complaint #${report.id}`;

  const statusLabel = isCleaned ? "Cleaned & Resolved ✓" : "Cleaning In Progress";
  const statusBg = isCleaned ? "#f0fdf4" : "#fffbeb";
  const statusColor = isCleaned ? "#14532d" : "#92400e";
  const statusBorder = isCleaned ? "#bbf7d0" : "#fde68a";

  const headline = isCleaned
    ? "The waste has been cleaned up!"
    : "A sanitation team is on their way";
  const intro = isCleaned
    ? `Great news! The waste you reported at complaint <strong>#${report.id}</strong> has been successfully removed by the sanitation team. Thank you for helping keep Udupi's coastline clean.`
    : `Good news! A sanitation team has begun cleaning the waste you reported at complaint <strong>#${report.id}</strong>. We'll notify you once the area is fully cleared.`;

  const coordsText = `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`;
  const mapsUrl = googleMapsUrl(report.latitude, report.longitude);

  const body = `
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">${escapeHtml(headline)}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">${intro}</p>

    <div style="margin:0 0 24px;">
      <span style="display:inline-block;background:${statusBg};color:${statusColor};border:1.5px solid ${statusBorder};
        font-size:13px;font-weight:800;padding:8px 20px;border-radius:999px;letter-spacing:0.5px;">
        ${escapeHtml(statusLabel)}
      </span>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;overflow:hidden;">
      <tr>
        <td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Complaint Details</p>
        </td>
      </tr>
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;width:120px;">Complaint ID</td>
            <td style="padding:5px 0;font-size:18px;color:#0d9488;font-weight:900;font-family:monospace;">#${report.id}</td>
          </tr>
          ${report.address ? `
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Location</td>
            <td style="padding:5px 0;font-size:14px;color:#334155;">${escapeHtml(report.address)}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:5px 0;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">GPS</td>
            <td style="padding:5px 0;font-size:13px;color:#334155;font-family:monospace;">
              <a href="${mapsUrl}" style="color:#0d9488;text-decoration:none;">${coordsText} ↗</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td>${ctaButton("📋 View Complaint Status", trackUrl)}</td>
      </tr>
    </table>

    ${isCleaned ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#14532d;line-height:1.7;">
        🌊 <strong>Every report matters.</strong> By taking action, you've helped protect the Arabian Sea coastline and Udupi's beaches from pollution. Your civic responsibility makes a real difference.
      </p>
    </div>` : ""}

    ${divider()}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      You are receiving this because you provided your email when submitting complaint #${report.id}.
    </p>`;

  logger.info({ reportId: report.id, to: reporterEmail, status: newStatus }, "Sending reporter status update email");
  await sendEmail(reporterEmail, subject, emailShell(headline, body));
}

// ── 8. New report alert — panchayat admin(s) ─────────────────────────────────

export async function sendNewReportToPanchayatAdmins(
  officer: Officer,
  report: Report,
  panchayatAdmins: { email: string; name: string }[]
): Promise<void> {
  if (panchayatAdmins.length === 0) return;

  const mapsUrl = googleMapsUrl(report.latitude, report.longitude);
  const dashUrl = PANCHAYAT_ADMIN_URL;
  const panchayat = officer.panchayatName ?? "your panchayat";
  const ward = officer.areaName ?? "an assigned ward";
  const subject = `[Civic Watch] New waste report in ${panchayat} — #${report.id}`;

  const body = (recipientName: string) => `
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">
      A new waste report has been submitted in <strong>${escapeHtml(panchayat)}</strong> and assigned to
      field officer <strong>${escapeHtml(officer.name)}</strong> (${escapeHtml(ward)}).
    </p>

    <!-- Urgency badge -->
    <div style="margin:0 0 24px;">
      <span style="display:inline-block;background:#fff7ed;color:#c2410c;border:1.5px solid #fed7aa;
        font-size:13px;font-weight:800;padding:8px 20px;border-radius:999px;letter-spacing:0.5px;">
        🚨 New Report — Action Required
      </span>
    </div>

    ${reportDetailCard(report)}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding-right:12px;">${ctaButton("📍 View on Map", mapsUrl)}</td>
        <td>${ctaButton("Open Dashboard", dashUrl, "outline")}</td>
      </tr>
    </table>

    ${divider()}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      You will receive another notification when the officer updates the report status.
      You are receiving this as a panchayat admin for <strong>${escapeHtml(panchayat)}</strong>.
    </p>`;

  await Promise.all(
    panchayatAdmins
      .filter((a) => !!a.email)
      .map((a) =>
        sendEmail(a.email, subject, emailShell("New Report in Your Area", body(a.name))).catch((err) =>
          logger.warn({ err, to: a.email }, "New-report panchayat admin email failed")
        )
      )
  );
}

// ── 7. Weekly digest ──────────────────────────────────────────────────────────

export type WeeklyOfficerRow = {
  name: string;
  ward: string;
  pending: number;
  resolvedThisWeek: number;
};

export type WeeklyPanchayatRow = {
  panchayat: string;
  total: number;
  open: number;
  resolved: number;
};

function officerBreakdownTable(rows: WeeklyOfficerRow[]): string {
  if (rows.length === 0) return "";
  const rowsHtml = rows
    .map((r) => {
      const resolvePct = r.pending + r.resolvedThisWeek > 0
        ? Math.round((r.resolvedThisWeek / (r.pending + r.resolvedThisWeek)) * 100)
        : 0;
      return `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid #f1f5f9;">${escapeHtml(r.name)}</td>
          <td style="padding:8px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;">${escapeHtml(r.ward)}</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:700;color:#dc2626;text-align:center;border-bottom:1px solid #f1f5f9;">${r.pending}</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:700;color:#16a34a;text-align:center;border-bottom:1px solid #f1f5f9;">${r.resolvedThisWeek}</td>
          <td style="padding:8px 12px;font-size:12px;color:#64748b;text-align:center;border-bottom:1px solid #f1f5f9;">${resolvePct}%</td>
        </tr>`;
    })
    .join("");

  return `
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Officer Breakdown</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:28px;">
      <tr style="background:#f8fafc;">
        <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:left;">Officer</th>
        <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:left;">Ward</th>
        <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">Pending</th>
        <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">Resolved</th>
        <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">Rate</th>
      </tr>
      ${rowsHtml}
    </table>`;
}

function panchayatBreakdownTable(rows: WeeklyPanchayatRow[]): string {
  if (rows.length === 0) return "";
  const rowsHtml = rows
    .map((r) => `
      <tr>
        <td style="padding:8px 12px;font-size:13px;color:#0f172a;border-bottom:1px solid #f1f5f9;">${escapeHtml(r.panchayat)}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:700;color:#2563eb;text-align:center;border-bottom:1px solid #f1f5f9;">${r.total}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:700;color:#dc2626;text-align:center;border-bottom:1px solid #f1f5f9;">${r.open}</td>
        <td style="padding:8px 12px;font-size:13px;font-weight:700;color:#16a34a;text-align:center;border-bottom:1px solid #f1f5f9;">${r.resolved}</td>
      </tr>`)
    .join("");

  return `
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">District Overview by Panchayat</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:28px;">
      <tr style="background:#f8fafc;">
        <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:left;">Panchayat</th>
        <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">New This Week</th>
        <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">Open</th>
        <th style="padding:8px 12px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">Resolved</th>
      </tr>
      ${rowsHtml}
    </table>`;
}

export async function sendWeeklyDigest(opts: {
  to: string;
  recipientName: string;
  weekLabel: string;
  stats: { total: number; open: number; resolved: number; avgResponseHours: number };
  officerRows?: WeeklyOfficerRow[];
  panchayatRows?: WeeklyPanchayatRow[];
  isControlCenter: boolean;
  panchayatName?: string;
}): Promise<void> {
  const { to, recipientName, weekLabel, stats, officerRows, panchayatRows, isControlCenter, panchayatName } = opts;
  const dashUrl = isControlCenter ? CONTROL_CENTER_URL : PANCHAYAT_ADMIN_URL;
  const scope = isControlCenter ? "Udupi District" : (panchayatName ?? "Your Panchayat");
  const subject = `[Civic Watch] Weekly Report — ${scope} — ${weekLabel}`;

  const body = `
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
      Here is your weekly waste management summary for <strong>${escapeHtml(scope)}</strong>
      covering the period <strong>${escapeHtml(weekLabel)}</strong>.
    </p>

    <!-- Week label badge -->
    <div style="margin:0 0 24px;">
      <span style="display:inline-block;background:#eff6ff;color:#1d4ed8;border:1.5px solid #bfdbfe;
        font-size:13px;font-weight:800;padding:8px 20px;border-radius:999px;letter-spacing:0.5px;">
        📅 ${escapeHtml(weekLabel)}
      </span>
    </div>

    <!-- Stats grid -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="24%" style="text-align:center;background:#eff6ff;border-radius:10px;padding:16px 8px;border:1px solid #bfdbfe;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#2563eb;">${stats.total}</p>
          <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.5px;">New Reports</p>
        </td>
        <td width="2%" style="min-width:6px;"></td>
        <td width="24%" style="text-align:center;background:#fef2f2;border-radius:10px;padding:16px 8px;border:1px solid #fecaca;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#dc2626;">${stats.open}</p>
          <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px;">Still Open</p>
        </td>
        <td width="2%" style="min-width:6px;"></td>
        <td width="24%" style="text-align:center;background:#f0fdf4;border-radius:10px;padding:16px 8px;border:1px solid #bbf7d0;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#16a34a;">${stats.resolved}</p>
          <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;">Resolved</p>
        </td>
        <td width="2%" style="min-width:6px;"></td>
        <td width="24%" style="text-align:center;background:#fefce8;border-radius:10px;padding:16px 8px;border:1px solid #fef08a;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#ca8a04;">${stats.avgResponseHours}</p>
          <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Avg Hrs (30d)</p>
        </td>
      </tr>
    </table>

    ${officerRows && officerRows.length > 0 ? officerBreakdownTable(officerRows) : ""}
    ${panchayatRows && panchayatRows.length > 0 ? panchayatBreakdownTable(panchayatRows) : ""}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td>${ctaButton("📊 View Full Dashboard", dashUrl)}</td>
      </tr>
    </table>

    ${divider()}
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
      This digest is sent every Monday morning. You are receiving this as
      ${isControlCenter ? "a Control Center officer" : `a Panchayat Admin for ${escapeHtml(scope)}`}.
    </p>`;

  logger.info({ to, scope }, "Sending weekly digest");
  await sendEmail(to, subject, emailShell(`Weekly Report — ${scope}`, body));
}
