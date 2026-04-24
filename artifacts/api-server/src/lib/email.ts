import { Resend } from "resend";
import type { Officer, Report } from "@workspace/db";
import { logger } from "./logger";

const apiKey = process.env["RESEND_API_KEY"];
const resend = apiKey ? new Resend(apiKey) : null;

const FROM_ADDRESS = process.env["EMAIL_FROM"] ?? "CleanSpot <noreply@cleanspot.gov.in>";

function appBaseUrl(): string {
  const domain = process.env["REPLIT_DEV_DOMAIN"];
  if (domain) return `https://${domain}`;
  return process.env["APP_URL"] ?? "https://cleanspot.replit.app";
}

function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function buildAssignmentEmail(officer: Officer, report: Report): { subject: string; html: string } {
  const base = appBaseUrl();
  const mapsUrl = googleMapsUrl(report.latitude, report.longitude);
  const dashboardUrl = `${base}/officer/dashboard`;
  const coordsText = `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`;

  const subject = `[CleanSpot] New waste report assigned — #${report.id}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#0d9488;padding:24px 32px;">
              <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1px;color:#ccfbf1;text-transform:uppercase;">Udupi District Administration</p>
              <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">CleanSpot</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">

              <p style="margin:0 0 8px;font-size:16px;color:#111827;">Dear ${officer.name},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                A new waste report has been assigned to you. Please review the details below and take appropriate action.
              </p>

              <!-- Report details card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                      <tr>
                        <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;width:100px;">Report ID</td>
                        <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">#${report.id}</td>
                      </tr>

                      <tr>
                        <td colspan="2" style="padding:4px 0 12px;border-bottom:1px solid #e5e7eb;"></td>
                      </tr>

                      ${report.description ? `
                      <tr>
                        <td style="padding:12px 0 6px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Description</td>
                        <td style="padding:12px 0 6px;font-size:14px;color:#374151;line-height:1.5;">${escapeHtml(report.description)}</td>
                      </tr>
                      ` : ""}

                      ${report.address ? `
                      <tr>
                        <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Address</td>
                        <td style="padding:6px 0;font-size:14px;color:#374151;">${escapeHtml(report.address)}</td>
                      </tr>
                      ` : ""}

                      <tr>
                        <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;">Coordinates</td>
                        <td style="padding:6px 0;font-size:14px;color:#374151;font-family:monospace;">${coordsText}</td>
                      </tr>

                      <tr>
                        <td style="padding:6px 0;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Reported</td>
                        <td style="padding:6px 0;font-size:14px;color:#374151;">${formatDate(report.createdAt)}</td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTAs -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding-right:12px;">
                    <a href="${mapsUrl}"
                      style="display:inline-block;background-color:#0d9488;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;">
                      Open in Maps
                    </a>
                  </td>
                  <td>
                    <a href="${dashboardUrl}"
                      style="display:inline-block;background-color:#ffffff;color:#0d9488;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:6px;border:1px solid #0d9488;">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                If you have questions, please contact the admin team. Do not reply to this automated message.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                Udupi District Administration &bull; CleanSpot Waste Reporting System<br>
                This is an automated notification. Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
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

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    logger.warn("RESEND_API_KEY is not set — skipping email notification");
    return;
  }

  try {
    const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
    if (error) {
      logger.warn({ error, to }, "Failed to send email");
    } else {
      logger.info({ to, subject }, "Email sent successfully");
    }
  } catch (err) {
    logger.warn({ err, to }, "Unexpected error sending email");
  }
}

export async function sendAssignmentEmail(officer: Officer, report: Report): Promise<void> {
  if (!officer.email) {
    logger.warn({ officerId: officer.id }, "Officer has no email address — skipping notification");
    return;
  }

  const { subject, html } = buildAssignmentEmail(officer, report);
  logger.info({ officerId: officer.id, reportId: report.id }, "Sending assignment email");
  await sendEmail(officer.email, subject, html);
}
