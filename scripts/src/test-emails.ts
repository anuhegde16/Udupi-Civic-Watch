import nodemailer from "nodemailer";

const TEST_TO = "diwakarhegde16@gmail.com";

const SMTP_HOST = process.env["SMTP_HOST"];
const SMTP_PORT = parseInt(process.env["SMTP_PORT"] ?? "465", 10);
const SMTP_USER = process.env["SMTP_USER"];
const SMTP_PASS = process.env["SMTP_PASS"];
const FROM_ADDRESS = process.env["SMTP_FROM"] ?? "Udupi Civic Watch <info@udupicivicwatch.in>";

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error("❌  SMTP not configured — missing:", [
    !SMTP_HOST && "SMTP_HOST",
    !SMTP_USER && "SMTP_USER",
    !SMTP_PASS && "SMTP_PASS",
  ].filter(Boolean).join(", "));
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

async function send(subject: string, html: string) {
  await transporter.sendMail({ from: FROM_ADDRESS, to: TEST_TO, subject: `[TEST] ${subject}`, html });
  console.log(`✅  Sent: ${subject}`);
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:36px 16px;">
  <tr><td align="center">
  <table role="presentation" width="100%" style="max-width:580px;">
    <tr><td style="background:#1a3a6b;padding:10px 24px;border-radius:8px 8px 0 0;">
      <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:1.5px;color:#a8c4e8;text-transform:uppercase;text-align:center;">
        Government of Karnataka &nbsp;·&nbsp; Udupi District Administration &nbsp;·&nbsp; Swachh Bharat Mission
      </p>
    </td></tr>
    <tr><td style="background:#ffffff;padding:14px 24px 10px;text-align:center;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
      <img src="https://udupicivicwatch.in/ucw-logo.png"
        width="180" height="auto"
        alt="Udupi Civic Watch"
        style="display:block;margin:0 auto;max-width:180px;width:100%;height:auto;border:0;" />
    </td></tr>
    <tr><td style="background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%);padding:28px 32px 24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;color:#99f6e4;text-transform:uppercase;">Udupi Civic Watch</p>
      <p style="margin:0;font-size:24px;font-weight:800;color:#fff;line-height:1.2;">${title}</p>
    </td></tr>
    <tr><td style="background:#fff;padding:32px;">
      <p style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 14px;font-size:12px;font-weight:700;color:#713f12;margin:0 0 24px;">
        🔔 This is a <strong>TEST EMAIL</strong> sent from <strong>Udupi Civic Watch</strong> to verify SMTP delivery. No action required.
      </p>
      ${body}
    </td></tr>
    <tr><td style="background:#f1f5f9;border-top:3px solid #0d9488;padding:20px 32px;border-radius:0 0 8px 8px;">
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
    </td></tr>
  </table>
  </td></tr>
</table>
</body></html>`;
}

const mockReport = {
  id: 9001,
  latitude: 13.3409,
  longitude: 74.7421,
  address: "Beach Road, Malpe, Udupi, Karnataka 576108",
  description: "Large pile of plastic waste near the fishing harbour entrance",
  status: "reported",
  createdAt: new Date(),
};

const mockOfficer = {
  id: 1,
  name: "Rajshekhar M",
  email: "rajshekharmattam1968@gmail.com",
  areaName: "Ward 1 – Saligrama",
  panchayatName: "Saligrama Grama Panchayat",
};

async function main() {
  console.log(`\n📧  Sending all test emails → ${TEST_TO}\n`);

  await send(
    "New Report Assigned (Field Officer)",
    shell("New Report Assigned", `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Dear ${mockOfficer.name},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">
        A new waste report <strong>#${mockReport.id}</strong> has been assigned to your ward
        <strong>${mockOfficer.areaName}</strong>. Your prompt action helps keep our community clean.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;overflow:hidden;">
        <tr><td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Report Details</p>
        </td></tr>
        <tr><td style="padding:20px;">
          <p style="margin:0;font-size:14px;color:#0f172a;"><strong>Report ID:</strong> #${mockReport.id}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#334155;"><strong>Location:</strong> ${mockReport.address}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#334155;"><strong>Description:</strong> ${mockReport.description}</p>
          <p style="margin:8px 0 0;font-size:13px;color:#334155;font-family:monospace;"><strong>GPS:</strong> ${mockReport.latitude}, ${mockReport.longitude}</p>
        </td></tr>
      </table>
      <a href="https://www.google.com/maps?q=${mockReport.latitude},${mockReport.longitude}"
        style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        📍 Open in Maps
      </a>
    `)
  );

  await send(
    "Welcome — Field Officer Account Created",
    shell("Welcome to Civic Watch", `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Welcome, ${mockOfficer.name}! 🌿</p>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">
        Your field officer account on <strong>Udupi Civic Watch</strong> has been created.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;overflow:hidden;">
        <tr><td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Account Details</p>
        </td></tr>
        <tr><td style="padding:20px;">
          <p style="margin:0;font-size:14px;color:#0f172a;"><strong>Ward:</strong> ${mockOfficer.areaName}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#0f172a;"><strong>Panchayat:</strong> ${mockOfficer.panchayatName}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#0d9488;font-family:monospace;"><strong>Login Email:</strong> ${mockOfficer.email}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#334155;"><strong>Password:</strong> Same as your email (change after first login)</p>
        </td></tr>
      </table>
      <a href="https://udupicivicwatch.in/staff/login"
        style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        🔐 Log In to Dashboard
      </a>
    `)
  );

  await send(
    "Password Reset OTP",
    shell("Password Reset Code", `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Password Reset Request</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
        We received a request to reset your Udupi Civic Watch password.
        Use the one-time code below — it expires in <strong>10 minutes</strong>.
      </p>
      <div style="text-align:center;margin:0 0 32px;">
        <div style="display:inline-block;background:#f0fdfa;border:2px dashed #0d9488;border-radius:14px;padding:20px 40px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#0d9488;letter-spacing:2px;text-transform:uppercase;">One-Time Code</p>
          <p style="margin:0;font-size:42px;font-weight:900;letter-spacing:16px;color:#0d9488;font-family:monospace;">847291</p>
        </div>
      </div>
      <p style="margin:0;font-size:13px;color:#94a3b8;">If you did not request this, ignore this email.</p>
    `)
  );

  await send(
    "Report Status Update — Cleaning In Progress (Panchayat Admin)",
    shell(`Report #${mockReport.id} Update`, `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Dear Panchayat Admin,</p>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">
        Field officer <strong>${mockOfficer.name}</strong> has <strong>started cleaning</strong> waste report
        <strong>#${mockReport.id}</strong>.
      </p>
      <div style="margin:0 0 24px;">
        <span style="display:inline-block;background:#fffbeb;color:#92400e;border:1.5px solid #fde68a;
          font-size:13px;font-weight:800;padding:8px 20px;border-radius:999px;">
          Cleaning In Progress
        </span>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;overflow:hidden;">
        <tr><td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Report Details</p>
        </td></tr>
        <tr><td style="padding:20px;">
          <p style="margin:0;font-size:14px;color:#0f172a;"><strong>Report ID:</strong> #${mockReport.id}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#334155;"><strong>Location:</strong> ${mockReport.address}</p>
        </td></tr>
      </table>
      <a href="https://udupicivicwatch.in/master/login"
        style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        View Dashboard
      </a>
    `)
  );

  await send(
    "Report Status Update — Cleaned & Resolved (Panchayat Admin)",
    shell(`Report #${mockReport.id} Update`, `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Dear Panchayat Admin,</p>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">
        Field officer <strong>${mockOfficer.name}</strong> has <strong>marked as cleaned</strong> waste report
        <strong>#${mockReport.id}</strong>.
      </p>
      <div style="margin:0 0 24px;">
        <span style="display:inline-block;background:#f0fdf4;color:#14532d;border:1.5px solid #bbf7d033;
          font-size:13px;font-weight:800;padding:8px 20px;border-radius:999px;">
          ✓ Cleaned &amp; Resolved
        </span>
      </div>
      <a href="https://udupicivicwatch.in/master/login"
        style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        All Reports
      </a>
    `)
  );

  await send(
    "Welcome — Panchayat Admin Account Created",
    shell("Panchayat Admin Account Created", `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Welcome, Saligrama Admin! 🌿</p>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">
        Your <strong>Panchayat Admin</strong> account on <strong>Udupi Civic Watch</strong> has been created.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;overflow:hidden;">
        <tr><td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Account Details</p>
        </td></tr>
        <tr><td style="padding:20px;">
          <p style="margin:0;font-size:14px;color:#0f172a;"><strong>Role:</strong> Panchayat Admin</p>
          <p style="margin:8px 0 0;font-size:14px;color:#0f172a;"><strong>Panchayat:</strong> Saligrama Grama Panchayat</p>
          <p style="margin:8px 0 0;font-size:14px;color:#0d9488;font-family:monospace;"><strong>Login Email:</strong> saligrama@udupicivicspot.com</p>
          <p style="margin:8px 0 0;font-size:14px;color:#334155;"><strong>Password:</strong> Same as your email</p>
        </td></tr>
      </table>
      <a href="https://udupicivicwatch.in/master/login"
        style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        🔐 Log In to Dashboard
      </a>
    `)
  );

  await send(
    "Citizen — Complaint Received",
    shell("Complaint Received", `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Thank you for reporting! 🌿</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
        Your waste complaint has been received and a field officer has been notified.
        We will keep you updated as the situation is addressed.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;overflow:hidden;">
        <tr><td style="background:#0d9488;padding:10px 20px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#ccfbf1;letter-spacing:1px;text-transform:uppercase;">Your Complaint Details</p>
        </td></tr>
        <tr><td style="padding:20px;">
          <p style="margin:0;font-size:18px;font-weight:900;color:#0d9488;font-family:monospace;"><strong>Complaint ID: #${mockReport.id}</strong></p>
          <p style="margin:8px 0 0;font-size:14px;color:#334155;"><strong>Location:</strong> ${mockReport.address}</p>
          <p style="margin:8px 0 0;"><span style="display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;font-size:12px;font-weight:700;padding:3px 12px;border-radius:999px;">Reported</span></p>
        </td></tr>
      </table>
      <a href="https://udupicivicwatch.in/track"
        style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        📋 Track Your Complaint
      </a>
    `)
  );

  await send(
    "Citizen — Cleaning Underway",
    shell("A sanitation team is on their way", `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">A sanitation team is on their way</p>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">
        Good news! A sanitation team has begun cleaning the waste you reported at complaint <strong>#${mockReport.id}</strong>.
        We'll notify you once the area is fully cleared.
      </p>
      <div style="margin:0 0 24px;">
        <span style="display:inline-block;background:#fffbeb;color:#92400e;border:1.5px solid #fde68a;
          font-size:13px;font-weight:800;padding:8px 20px;border-radius:999px;">
          🚛 Cleaning In Progress
        </span>
      </div>
      <a href="https://udupicivicwatch.in/track"
        style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        📋 View Complaint Status
      </a>
    `)
  );

  await send(
    "Citizen — Waste Cleaned & Resolved",
    shell("The waste has been cleaned up!", `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">The waste has been cleaned up!</p>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7;">
        Great news! The waste you reported at complaint <strong>#${mockReport.id}</strong> has been successfully
        removed by the sanitation team. Thank you for helping keep Udupi's coastline clean.
      </p>
      <div style="margin:0 0 24px;">
        <span style="display:inline-block;background:#f0fdf4;color:#14532d;border:1.5px solid #bbf7d0;
          font-size:13px;font-weight:800;padding:8px 20px;border-radius:999px;">
          ✅ Cleaned &amp; Resolved
        </span>
      </div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#14532d;line-height:1.7;">
          🌊 <strong>Every report matters.</strong> By taking action, you've helped protect the Arabian Sea coastline and Udupi's beaches from pollution.
        </p>
      </div>
      <a href="https://udupicivicwatch.in/track"
        style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        📋 View Complaint Status
      </a>
    `)
  );

  await send(
    "Weekly Digest — Panchayat Admin",
    shell("Weekly Report — Saligrama Grama Panchayat", `
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">Dear Saligrama Admin,</p>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.7;">
        Here is your weekly waste management summary for <strong>Saligrama Grama Panchayat</strong>
        covering the period <strong>16 Jun – 22 Jun 2025</strong>.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="text-align:center;background:#eff6ff;border-radius:10px;padding:16px 8px;border:1px solid #bfdbfe;">
            <p style="margin:0;font-size:28px;font-weight:800;color:#2563eb;">12</p>
            <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#1d4ed8;text-transform:uppercase;">New Reports</p>
          </td>
          <td style="min-width:6px;"></td>
          <td style="text-align:center;background:#fef2f2;border-radius:10px;padding:16px 8px;border:1px solid #fecaca;">
            <p style="margin:0;font-size:28px;font-weight:800;color:#dc2626;">4</p>
            <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#991b1b;text-transform:uppercase;">Still Open</p>
          </td>
          <td style="min-width:6px;"></td>
          <td style="text-align:center;background:#f0fdf4;border-radius:10px;padding:16px 8px;border:1px solid #bbf7d0;">
            <p style="margin:0;font-size:28px;font-weight:800;color:#16a34a;">8</p>
            <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#15803d;text-transform:uppercase;">Resolved</p>
          </td>
          <td style="min-width:6px;"></td>
          <td style="text-align:center;background:#fefce8;border-radius:10px;padding:16px 8px;border:1px solid #fef08a;">
            <p style="margin:0;font-size:28px;font-weight:800;color:#ca8a04;">6</p>
            <p style="margin:4px 0 0;font-size:10px;font-weight:600;color:#92400e;text-transform:uppercase;">Avg Hrs</p>
          </td>
        </tr>
      </table>
      <a href="https://udupicivicwatch.in/master/login"
        style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;">
        📊 View Full Dashboard
      </a>
    `)
  );

  console.log(`\n🎉  All 10 test emails sent to ${TEST_TO}\n`);
}

main().catch((err) => {
  console.error("❌  Failed:", err.message ?? err);
  process.exit(1);
});
