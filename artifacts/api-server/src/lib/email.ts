import nodemailer from "nodemailer";
import type { Officer, Report } from "@workspace/db";
import { logger } from "./logger";

const SMTP_HOST = process.env["SMTP_HOST"];
const SMTP_PORT = parseInt(process.env["SMTP_PORT"] ?? "465", 10);
const SMTP_USER = process.env["SMTP_USER"];
const SMTP_PASS = process.env["SMTP_PASS"];
const FROM_ADDRESS = process.env["SMTP_FROM"] ?? "Udupi Civic Watch <noreply@udupicivicwatch.com>";

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

function appBaseUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0].trim()}`;
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  return process.env["APP_URL"] ?? "https://cleanspot.replit.app";
}

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

function emailHeader(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <tr>
      <td style="background-color:#0d9488;padding:24px 32px;">
        <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1px;color:#ccfbf1;text-transform:uppercase;">Udupi District Administration</p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Udupi Civic Watch</p>
      </td>
    </tr>
    <tr><td style="padding:32px;">`;
}

function emailFooter(): string {
  return `</td></tr>
    <tr>
      <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
          Udupi District Administration &bull; Swachh Bharat Mission<br>
          This is an automated notification. Please do not reply to this email.
        </p>
      </td>
    </tr>
  </table>
  </td></tr>
</table>
</body>
</html>`;
}

function reportDetailCard(report: Report): string {
  const coordsText = `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;width:110px;">Report ID</td>
            <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">#${report.id}</td>
          </tr>
          <tr><td colspan="2" style="padding:4px 0 12px;border-bottom:1px solid #e5e7eb;"></td></tr>
          ${report.description ? `
          <tr>
            <td style="padding:12px 0 6px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Description</td>
            <td style="padding:12px 0 6px;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(report.description)}</td>
          </tr>` : ""}
          ${report.address ? `
          <tr>
            <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Address</td>
            <td style="padding:6px 0;font-size:14px;color:#374151;">${escapeHtml(report.address)}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Coordinates</td>
            <td style="padding:6px 0;font-size:14px;color:#374151;font-family:monospace;">${coordsText}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Reported</td>
            <td style="padding:6px 0;font-size:14px;color:#374151;">${formatDate(report.createdAt)}</td>
          </tr>
        </table>
      </td></tr>
    </table>`;
}

// ── Core send ──────────────────────────────────────────────────────────────────

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    logger.warn("SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — skipping email");
    return;
  }
  try {
    await transporter.sendMail({ from: FROM_ADDRESS, to, subject, html });
    logger.info({ to, subject }, "Email sent");
  } catch (err) {
    logger.warn({ err, to }, "Failed to send email");
  }
}

// ── Assignment email (field officer) ──────────────────────────────────────────

function buildAssignmentEmail(officer: Officer, report: Report): { subject: string; html: string } {
  const base = appBaseUrl();
  const mapsUrl = googleMapsUrl(report.latitude, report.longitude);
  const dashboardUrl = `${base}/officer/dashboard`;
  const subject = `[Civic Watch] New waste report assigned — #${report.id}`;

  const html = emailHeader(subject) + `
    <p style="margin:0 0 8px;font-size:16px;color:#111827;">Dear ${escapeHtml(officer.name)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
      A new waste report has been assigned to you. Please review the details and take action.
    </p>
    ${reportDetailCard(report)}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding-right:12px;">
          <a href="${mapsUrl}" style="display:inline-block;background-color:#0d9488;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">Open in Maps</a>
        </td>
        <td>
          <a href="${dashboardUrl}" style="display:inline-block;background-color:#ffffff;color:#0d9488;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;border:1px solid #0d9488;">View Dashboard</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      If you have questions, contact your panchayat admin. Do not reply to this automated message.
    </p>` + emailFooter();

  return { subject, html };
}

export async function sendAssignmentEmail(officer: Officer, report: Report): Promise<void> {
  if (!officer.email) {
    logger.warn({ officerId: officer.id }, "Officer has no email — skipping");
    return;
  }
  const { subject, html } = buildAssignmentEmail(officer, report);
  logger.info({ officerId: officer.id, reportId: report.id }, "Sending assignment email");
  await sendEmail(officer.email, subject, html);
}

// ── Welcome email (new field officer) ─────────────────────────────────────────

export async function sendWelcomeEmail(officer: Officer): Promise<void> {
  if (!officer.email) return;

  const base = appBaseUrl();
  const loginUrl = `${base}/officer/login`;
  const subject = `Welcome to Udupi Civic Watch — your account is ready`;

  const html = emailHeader(subject) + `
    <p style="margin:0 0 8px;font-size:16px;color:#111827;">Dear ${escapeHtml(officer.name)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
      Your field officer account on the Udupi Civic Watch system has been created.
      You will receive waste reports for your assigned area and can update their status from your dashboard.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${officer.areaName ? `
          <tr>
            <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;width:110px;">Assigned Ward</td>
            <td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(officer.areaName)}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Login Email</td>
            <td style="padding:6px 0;font-size:14px;color:#111827;font-family:monospace;">${escapeHtml(officer.email)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Password</td>
            <td style="padding:6px 0;font-size:14px;color:#374151;">Set by your admin (same as your email unless changed)</td>
          </tr>
        </table>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <a href="${loginUrl}" style="display:inline-block;background-color:#0d9488;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 24px;border-radius:6px;">Log In to Dashboard</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      If you did not expect this email, please contact your panchayat administrator.
    </p>` + emailFooter();

  logger.info({ officerId: officer.id }, "Sending welcome email");
  await sendEmail(officer.email, subject, html);
}

// ── Status update email (panchayat admin / control center) ────────────────────

const STATUS_LABELS: Record<string, string> = {
  cleaning: "Cleaning in progress",
  cleaned: "Cleaned ✓",
};

const STATUS_COLORS: Record<string, string> = {
  cleaning: "#d97706",
  cleaned: "#16a34a",
};

export async function sendStatusUpdateEmail(
  to: string,
  recipientName: string,
  report: Report,
  officerName: string,
  newStatus: "cleaning" | "cleaned"
): Promise<void> {
  const base = appBaseUrl();
  const mapsUrl = googleMapsUrl(report.latitude, report.longitude);
  const dashboardUrl = `${base}/admin/reports`;
  const label = STATUS_LABELS[newStatus] ?? newStatus;
  const color = STATUS_COLORS[newStatus] ?? "#0d9488";
  const subject = `[Civic Watch] Report #${report.id} — ${label}`;

  const html = emailHeader(subject) + `
    <p style="margin:0 0 8px;font-size:16px;color:#111827;">Dear ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
      The status of waste report <strong>#${report.id}</strong> has been updated by field officer
      <strong>${escapeHtml(officerName)}</strong>.
    </p>
    <p style="margin:0 0 24px;">
      <span style="display:inline-block;background-color:${color};color:#fff;font-size:13px;font-weight:700;padding:6px 16px;border-radius:999px;letter-spacing:0.5px;">
        ${escapeHtml(label)}
      </span>
    </p>
    ${reportDetailCard(report)}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding-right:12px;">
          <a href="${mapsUrl}" style="display:inline-block;background-color:#0d9488;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">Open in Maps</a>
        </td>
        <td>
          <a href="${dashboardUrl}" style="display:inline-block;background-color:#ffffff;color:#0d9488;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;border:1px solid #0d9488;">View All Reports</a>
        </td>
      </tr>
    </table>` + emailFooter();

  await sendEmail(to, subject, html);
}
