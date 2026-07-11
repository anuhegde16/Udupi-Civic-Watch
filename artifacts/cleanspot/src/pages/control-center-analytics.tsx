import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  Loader2,
  Users,
  MapPin,
  Trophy,
  Flame,
  BarChart2,
  TrendingUp,
  TrendingDown,
  Minus,
  Navigation,
  ClipboardList,
  LayoutList,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Timer,
  History,
  Download,
  FileText,
} from "lucide-react";

type DayTrend = {
  date: string;
  reported: number;
  cleaning: number;
  cleaned: number;
  total: number;
};

type OfficerStat = {
  id: number;
  name: string;
  areaName?: string | null;
  panchayatName?: string | null;
  total: number;
  cleaned: number;
  pending: number;
  resolutionRate: number;
  avgResolutionHours: number | null;
  avgReportedToCleaningHours: number | null;
  overdueCount: number;
  belowTarget: boolean;
  topPerformer: boolean;
};

type WardDelay = {
  ward: string;
  total: number;
  avgReportedToCleaningHours: number | null;
  avgReportedToCleanedHours: number | null;
};

type Hotspot = {
  lat: number;
  lng: number;
  count: number;
  address?: string | null;
  trend: "worsening" | "improving" | "steady";
};

type OldestOpenReport = {
  id: number;
  status: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  createdAt: string;
  hoursOpen: number;
  assignedOfficer?: { id: number; name: string; areaName?: string | null } | null;
};

type DistrictAnalytics = {
  kpis: {
    totalReports: number;
    completionRate: number;
    activeHotspots: number;
    officersBelowTarget: number;
    reported: number;
    cleaning: number;
    cleaned: number;
  };
  dailyTrend: DayTrend[];
  officerLeaderboard: OfficerStat[];
  hotspots: Hotspot[];
  delayMetrics: {
    avgReportedToCleaningHours: number | null;
    medianReportedToCleaningHours: number | null;
    avgReportedToCleanedHours: number | null;
    medianReportedToCleanedHours: number | null;
    avgResolutionHours: number | null;
    medianResolutionHours: number | null;
    avgOpenHours: number | null;
    byWard: WardDelay[];
  };
  oldestOpenReports: OldestOpenReport[];
};

function useDistrictAnalytics() {
  return useQuery<DistrictAnalytics>({
    queryKey: ["district-analytics"],
    queryFn: () => customFetch("/api/admin/analytics"),
    retry: false,
    refetchInterval: 60_000,
  });
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function safeCsvCell(value: string): string {
  // Neutralise CSV formula injection: cells starting with =, +, -, @, tab, CR, or LF
  // are prefixed with a single quote so spreadsheet apps treat them as plain text.
  if (/^[=+\-@\t\r\n]/.test(value)) return `'${value}`;
  return value;
}

function exportCSV(data: DistrictAnalytics) {
  const now = new Date().toLocaleDateString("en-IN");
  const rows: string[][] = [];

  rows.push(["DISTRICT ANALYTICS EXPORT", `Generated: ${now}`]);
  rows.push([]);
  rows.push(["KPIs"]);
  rows.push(["Total Reports", String(data.kpis.totalReports)]);
  rows.push(["Completion Rate", `${data.kpis.completionRate}%`]);
  rows.push(["Active Hotspots", String(data.kpis.activeHotspots)]);
  rows.push(["Officers Below Target", String(data.kpis.officersBelowTarget)]);
  rows.push(["Reported (active)", String(data.kpis.reported)]);
  rows.push(["Cleaning (active)", String(data.kpis.cleaning)]);
  rows.push(["Cleaned (active)", String(data.kpis.cleaned)]);
  rows.push([]);

  rows.push(["DELAY METRICS"]);
  rows.push(["Metric", "Value"]);
  const dm = data.delayMetrics;
  rows.push(["Avg Reported → Cleaning", formatHours(dm.avgReportedToCleaningHours)]);
  rows.push(["Median Reported → Cleaning", formatHours(dm.medianReportedToCleaningHours)]);
  rows.push(["Avg Reported → Cleaned", formatHours(dm.avgReportedToCleanedHours)]);
  rows.push(["Median Reported → Cleaned", formatHours(dm.medianReportedToCleanedHours)]);
  rows.push(["Avg Resolution Time", formatHours(dm.avgResolutionHours)]);
  rows.push(["Median Resolution Time", formatHours(dm.medianResolutionHours)]);
  rows.push(["Avg Age of Open Reports", formatHours(dm.avgOpenHours)]);
  rows.push([]);

  rows.push(["OFFICER LEADERBOARD"]);
  rows.push(["Officer", "Ward", "Panchayat", "Total", "Cleaned", "Pending", "Resolution Rate", "Avg → Cleaning", "Avg → Cleaned", "Overdue", "Status"]);
  data.officerLeaderboard.forEach((o) => {
    rows.push([
      safeCsvCell(o.name),
      safeCsvCell(o.areaName ?? ""),
      safeCsvCell(o.panchayatName ?? ""),
      String(o.total),
      String(o.cleaned),
      String(o.pending),
      `${o.resolutionRate}%`,
      formatHours(o.avgReportedToCleaningHours),
      formatHours(o.avgResolutionHours),
      String(o.overdueCount),
      o.topPerformer ? "Top Performer" : o.belowTarget ? "Below Target" : "",
    ]);
  });
  rows.push([]);

  rows.push(["HOTSPOTS"]);
  rows.push(["Location", "Latitude", "Longitude", "Report Count", "7-day Trend"]);
  data.hotspots.forEach((h) => {
    rows.push([safeCsvCell(h.address ?? ""), String(h.lat), String(h.lng), String(h.count), h.trend]);
  });
  rows.push([]);

  rows.push(["DELAY BY WARD"]);
  rows.push(["Ward", "Total Reports", "Avg → Cleaning", "Avg → Cleaned"]);
  data.delayMetrics.byWard.forEach((w) => {
    rows.push([safeCsvCell(w.ward), String(w.total), formatHours(w.avgReportedToCleaningHours), formatHours(w.avgReportedToCleanedHours)]);
  });
  rows.push([]);

  rows.push(["14-DAY TREND"]);
  rows.push(["Date", "Total", "Reported", "Cleaning", "Cleaned"]);
  data.dailyTrend.forEach((d) => {
    rows.push([safeCsvCell(d.date), String(d.total), String(d.reported), String(d.cleaning), String(d.cleaned)]);
  });

  const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `district-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escHtml(raw: string | null | undefined): string {
  if (raw == null) return "—";
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function exportPDF(data: DistrictAnalytics) {
  const now = new Date().toLocaleString("en-IN");
  const dm = data.delayMetrics;

  const officerRows = data.officerLeaderboard
    .map(
      (o) => `
      <tr>
        <td style="font-weight:700">${escHtml(o.name)}</td>
        <td>${escHtml(o.areaName)}</td>
        <td>${escHtml(o.panchayatName)}</td>
        <td style="font-weight:700;text-align:center">${o.total}</td>
        <td style="text-align:center">${o.cleaned}</td>
        <td style="text-align:center">${o.pending}</td>
        <td style="font-weight:700;text-align:center">${o.resolutionRate}%</td>
        <td style="text-align:center">${escHtml(formatHours(o.avgReportedToCleaningHours))}</td>
        <td style="text-align:center">${escHtml(formatHours(o.avgResolutionHours))}</td>
        <td style="text-align:center;color:${o.overdueCount > 0 ? "#dc2626" : "inherit"};font-weight:${o.overdueCount > 0 ? "700" : "400"}">${o.overdueCount}</td>
        <td style="text-align:center">${o.topPerformer ? '<span style="background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:99px;font-weight:700;font-size:9px">Top Performer</span>' : o.belowTarget ? '<span style="background:#fee2e2;color:#991b1b;padding:1px 6px;border-radius:99px;font-weight:700;font-size:9px">Below Target</span>' : ""}</td>
      </tr>`
    )
    .join("");

  const hotspotRows = data.hotspots
    .map(
      (h, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${escHtml(h.address)}</td>
        <td>${h.lat.toFixed(4)}° N, ${h.lng.toFixed(4)}° E</td>
        <td style="font-weight:700;text-align:center">${h.count}</td>
        <td style="font-weight:700;color:${h.trend === "worsening" ? "#dc2626" : h.trend === "improving" ? "#16a34a" : "#64748b"}">${h.trend === "worsening" ? "Worsening" : h.trend === "improving" ? "Improving" : "Steady"}</td>
      </tr>`
    )
    .join("");

  const wardRows = data.delayMetrics.byWard
    .map(
      (w) => `
      <tr>
        <td style="font-weight:700">${escHtml(w.ward)}</td>
        <td style="text-align:center">${w.total}</td>
        <td style="text-align:center">${escHtml(formatHours(w.avgReportedToCleaningHours))}</td>
        <td style="text-align:center">${escHtml(formatHours(w.avgReportedToCleanedHours))}</td>
      </tr>`
    )
    .join("");

  const trendRows = data.dailyTrend
    .map(
      (d) => `
      <tr>
        <td>${escHtml(d.date)}</td>
        <td style="font-weight:700;text-align:center">${d.total}</td>
        <td style="text-align:center">${d.reported}</td>
        <td style="text-align:center">${d.cleaning}</td>
        <td style="font-weight:700;text-align:center;color:#16a34a">${d.cleaned}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>District Analytics Report — Udupi</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif}
  body{padding:32px;color:#111;font-size:11px;line-height:1.5}
  h1{font-size:20px;font-weight:900;margin-bottom:2px}
  h2{font-size:12px;font-weight:800;margin:20px 0 8px;color:#3730a3;border-bottom:2px solid #e0e7ff;padding-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
  .gov-bar{font-size:9px;font-weight:700;color:#4338ca;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px}
  .meta{color:#64748b;font-size:10px;margin-bottom:20px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px}
  .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px}
  .kpi-val{font-size:20px;font-weight:900}
  .kpi-lbl{font-size:9px;color:#64748b;font-weight:600;margin-top:1px}
  .delay-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px}
  .delay-cell{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px}
  .delay-val{font-size:16px;font-weight:900;color:#3730a3}
  .delay-lbl{font-size:9px;color:#64748b;font-weight:600;margin-top:1px}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:4px}
  th{text-align:left;font-weight:700;padding:5px 8px;background:#f8fafc;border-bottom:2px solid #e2e8f0;font-size:9px;text-transform:uppercase;color:#475569;letter-spacing:.03em}
  td{padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  .footer{margin-top:32px;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;display:flex;justify-content:space-between}
  @media print{body{padding:16px}@page{margin:1cm}}
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e0e7ff">
  <div>
    <div class="gov-bar">Government of Karnataka · Udupi District Administration · Swachh Bharat Mission</div>
    <h1>District Analytics Report</h1>
    <div class="meta">Control Center · All Taluks · Live data snapshot as at ${now}</div>
  </div>
  <div style="font-size:9px;color:#64748b;text-align:right;white-space:nowrap">CleanSpot<br>Udupi District</div>
</div>

<h2>District KPIs</h2>
<div class="kpis">
  <div class="kpi"><div class="kpi-val">${data.kpis.totalReports}</div><div class="kpi-lbl">Total Reports</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#16a34a">${data.kpis.completionRate}%</div><div class="kpi-lbl">Completion Rate</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#ea580c">${data.kpis.activeHotspots}</div><div class="kpi-lbl">Active Hotspots</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#dc2626">${data.kpis.officersBelowTarget}</div><div class="kpi-lbl">Officers Below Target</div></div>
</div>
<div class="kpis">
  <div class="kpi"><div class="kpi-val">${data.kpis.reported}</div><div class="kpi-lbl">Reported (active)</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#2563eb">${data.kpis.cleaning}</div><div class="kpi-lbl">Cleaning (active)</div></div>
  <div class="kpi"><div class="kpi-val" style="color:#16a34a">${data.kpis.cleaned}</div><div class="kpi-lbl">Cleaned (active)</div></div>
  <div class="kpi"></div>
</div>

<h2>Delay Metrics</h2>
<div class="delay-grid">
  <div class="delay-cell"><div class="delay-val">${formatHours(dm.avgReportedToCleaningHours)}</div><div class="delay-lbl">Avg Reported → Cleaning</div></div>
  <div class="delay-cell"><div class="delay-val">${formatHours(dm.medianReportedToCleaningHours)}</div><div class="delay-lbl">Median Reported → Cleaning</div></div>
  <div class="delay-cell"><div class="delay-val">${formatHours(dm.avgReportedToCleanedHours)}</div><div class="delay-lbl">Avg Reported → Cleaned</div></div>
  <div class="delay-cell"><div class="delay-val">${formatHours(dm.medianReportedToCleanedHours)}</div><div class="delay-lbl">Median Reported → Cleaned</div></div>
  <div class="delay-cell"><div class="delay-val">${formatHours(dm.avgResolutionHours)}</div><div class="delay-lbl">Avg Resolution Time</div></div>
  <div class="delay-cell"><div class="delay-val">${formatHours(dm.avgOpenHours)}</div><div class="delay-lbl">Avg Age of Open Reports</div></div>
</div>

<h2>Officer Performance Leaderboard</h2>
<table>
  <thead>
    <tr>
      <th>Officer</th><th>Ward</th><th>Panchayat</th><th style="text-align:center">Total</th><th style="text-align:center">Cleaned</th>
      <th style="text-align:center">Pending</th><th style="text-align:center">Rate</th><th style="text-align:center">→ Cleaning</th>
      <th style="text-align:center">→ Cleaned</th><th style="text-align:center">Overdue</th><th style="text-align:center">Status</th>
    </tr>
  </thead>
  <tbody>${officerRows}</tbody>
</table>

<h2>District Hotspots</h2>
${data.hotspots.length ? `
<table>
  <thead><tr><th style="text-align:center">#</th><th>Location</th><th>Coordinates</th><th style="text-align:center">Reports</th><th>7-day Trend</th></tr></thead>
  <tbody>${hotspotRows}</tbody>
</table>` : "<p style='color:#64748b;font-size:10px;padding:8px 0'>No repeated hotspots recorded.</p>"}

${data.delayMetrics.byWard.length ? `
<h2>Delay by Ward</h2>
<table>
  <thead><tr><th>Ward</th><th style="text-align:center">Total Reports</th><th style="text-align:center">Avg → Cleaning</th><th style="text-align:center">Avg → Cleaned</th></tr></thead>
  <tbody>${wardRows}</tbody>
</table>` : ""}

<h2>14-Day Trend</h2>
<table>
  <thead><tr><th>Date</th><th style="text-align:center">Total</th><th style="text-align:center">Reported</th><th style="text-align:center">Cleaning</th><th style="text-align:center">Cleaned</th></tr></thead>
  <tbody>${trendRows}</tbody>
</table>

<div class="footer">
  <span>CleanSpot · Udupi District Administration · Swachh Bharat Mission</span>
  <span>Generated: ${now}</span>
</div>
<script>window.onload=function(){window.print()}<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups for this site to export as PDF.");
    return;
  }
  win.document.write(html);
  win.document.close();
}

const STATUS_COLORS = {
  reported: "#ef4444",
  cleaning: "#3b82f6",
  cleaned: "#22c55e",
};

const TREND_CONFIG = {
  worsening: { icon: TrendingUp, color: "text-destructive", label: "Worsening" },
  improving: { icon: TrendingDown, color: "text-primary", label: "Improving" },
  steady: { icon: Minus, color: "text-muted-foreground", label: "Steady" },
};

function TrendChart({ data }: { data: DayTrend[] }) {
  const maxVal = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="flex items-end gap-1 h-28 w-full">
      {data.map((day, i) => {
        const pct = (day.total / maxVal) * 100;
        const cleanedPct = day.total > 0 ? (day.cleaned / day.total) * 100 : 0;
        const cleaningPct = day.total > 0 ? (day.cleaning / day.total) * 100 : 0;
        const reportedPct = 100 - cleanedPct - cleaningPct;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="relative w-full flex flex-col justify-end" style={{ height: "88px" }}>
              {day.total === 0 ? (
                <div className="w-full h-1 bg-muted/40 rounded-full" />
              ) : (
                <div
                  className="w-full rounded-t-lg overflow-hidden flex flex-col-reverse transition-all duration-500"
                  style={{ height: `${Math.max(pct, 4)}%` }}
                >
                  <div className="bg-destructive/70" style={{ height: `${reportedPct}%` }} />
                  <div className="bg-blue-400" style={{ height: `${cleaningPct}%` }} />
                  <div className="bg-emerald-500" style={{ height: `${cleanedPct}%` }} />
                </div>
              )}
              {day.total > 0 && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-card border border-border/50 px-1.5 py-0.5 rounded-md shadow-sm z-10">
                  {day.total}
                </div>
              )}
            </div>
            <span className="text-[9px] font-bold text-muted-foreground uppercase">
              {format(parseISO(day.date), "d")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ControlCenterAnalytics() {
  const { user } = useAuth();
  const { data, isLoading } = useDistrictAnalytics();

  const kpiCards = [
    {
      label: "Total Reports",
      value: data?.kpis.totalReports ?? 0,
      icon: <LayoutList className="w-5 h-5" />,
      color: "text-foreground",
      bg: "bg-muted/60",
    },
    {
      label: "Completion Rate",
      value: `${data?.kpis.completionRate ?? 0}%`,
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Active Hotspots",
      value: data?.kpis.activeHotspots ?? 0,
      icon: <Flame className="w-5 h-5" />,
      color: "text-orange-500",
      bg: "bg-orange-50",
    },
    {
      label: "Officers Below Target",
      value: data?.kpis.officersBelowTarget ?? 0,
      icon: <ShieldAlert className="w-5 h-5" />,
      color: "text-destructive",
      bg: "bg-destructive/8",
    },
  ];

  const totalReports14d = data?.dailyTrend.reduce((s, d) => s + d.total, 0) ?? 0;
  const cleaned14d = data?.dailyTrend.reduce((s, d) => s + d.cleaned, 0) ?? 0;

  return (
    <div className="pb-12 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-bl-[100px] pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-indigo-200">
              <BarChart2 className="w-3.5 h-3.5" /> District Analytics
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
              Command Center Analytics
            </h1>
            <p className="text-muted-foreground font-medium">
              {`Welcome, ${user?.name ?? "Admin"} — district-wide officer performance, hotspots & delays.`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link href="/admin/dashboard">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted/60 transition-colors cursor-pointer">
                <Users className="w-4 h-4" /> Dashboard
              </span>
            </Link>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black bg-indigo-600 text-white cursor-default">
              <BarChart2 className="w-4 h-4" /> Analytics
            </span>
            <button
              onClick={() => data && exportCSV(data)}
              disabled={!data}
              title="Download as CSV"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <button
              onClick={() => data && exportPDF(data)}
              disabled={!data}
              title="Export as PDF (opens print dialog)"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4" /> PDF
            </button>
          </div>
        </div>

        {/* KPI cards */}
        {!isLoading && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpiCards.map((s) => (
              <div
                key={s.label}
                className={`${s.bg} rounded-2xl px-4 py-3 flex items-center gap-3`}
              >
                <div className={`${s.color} shrink-0`}>{s.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground font-semibold">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {isLoading && (
          <div className="mt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Loading district analytics…</span>
          </div>
        )}
      </div>

      {/* Delay metrics strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <Timer className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-foreground">
              {formatHours(data?.delayMetrics.avgReportedToCleaningHours ?? null)}
            </div>
            <div className="text-xs font-bold text-muted-foreground">Avg reported → cleaning</div>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Timer className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-foreground">
              {formatHours(data?.delayMetrics.avgReportedToCleanedHours ?? null)}
            </div>
            <div className="text-xs font-bold text-muted-foreground">Avg reported → cleaned</div>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-foreground">
              {formatHours(data?.delayMetrics.medianReportedToCleanedHours ?? null)}
            </div>
            <div className="text-xs font-bold text-muted-foreground">Median reported → cleaned</div>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-foreground">
              {formatHours(data?.delayMetrics.medianResolutionHours ?? null)}
            </div>
            <div className="text-xs font-bold text-muted-foreground">Median time to clean (overall)</div>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-foreground">
              {formatHours(data?.delayMetrics.avgOpenHours ?? null)}
            </div>
            <div className="text-xs font-bold text-muted-foreground">Avg age of open reports</div>
          </div>
        </div>
      </div>

      {/* Ward-level delay breakdown */}
      {!isLoading && !!data?.delayMetrics.byWard.length && (
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2 mb-1">
            <MapPin className="w-5 h-5 text-indigo-500" /> Delay by Ward
          </h2>
          <p className="text-sm text-muted-foreground font-medium mb-5">
            Average time spent reported → cleaning and reported → cleaned, grouped by ward
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-black text-muted-foreground uppercase border-b border-border/40">
                  <th className="py-2 pr-3">Ward</th>
                  <th className="py-2 pr-3">Reports</th>
                  <th className="py-2 pr-3">Avg → Cleaning</th>
                  <th className="py-2 pr-3">Avg → Cleaned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.delayMetrics.byWard.map((w) => (
                  <tr key={w.ward}>
                    <td className="py-2.5 pr-3 font-bold text-foreground">{w.ward}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground font-semibold">{w.total}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground font-semibold">{formatHours(w.avgReportedToCleaningHours)}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground font-semibold">{formatHours(w.avgReportedToCleanedHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 14-day trend */}
      <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-black text-foreground flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" /> 14-Day District Trend
            </h2>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              Reports: <span className="font-black text-foreground">{totalReports14d}</span>
              {totalReports14d > 0 && (
                <span className="ml-2 text-emerald-600 font-bold">· {cleaned14d} resolved</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-bold shrink-0">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Cleaned</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" /> Cleaning</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-destructive/70 inline-block" /> New</span>
          </div>
        </div>
        {isLoading ? (
          <div className="h-28 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <TrendChart data={data?.dailyTrend ?? []} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Officer leaderboard */}
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-indigo-500" /> Officer Performance
          </h2>
          <p className="text-sm text-muted-foreground font-medium mb-5">
            District-wide, sorted by total reports handled
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !data?.officerLeaderboard.length ? (
            <p className="text-sm text-muted-foreground font-medium text-center py-10">No officers yet</p>
          ) : (
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {data.officerLeaderboard.map((officer) => (
                <div
                  key={officer.id}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
                    officer.belowTarget
                      ? "bg-destructive/5 border-destructive/20"
                      : officer.topPerformer
                      ? "bg-emerald-50/60 border-emerald-300/60"
                      : "bg-muted/30 border-border/40 hover:bg-muted/50"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 ${
                      officer.belowTarget ? "bg-destructive" : officer.topPerformer ? "bg-emerald-500" : "bg-indigo-500"
                    }`}
                  >
                    {officer.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-black text-sm text-foreground truncate">{officer.name}</span>
                      {officer.areaName && (
                        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5" />{officer.areaName}
                        </span>
                      )}
                      {officer.topPerformer && (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                          <Trophy className="w-2.5 h-2.5" /> Top Performer
                        </span>
                      )}
                      {officer.belowTarget && (
                        <span className="text-[10px] font-black text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full shrink-0">
                          Below Target
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          officer.belowTarget ? "bg-destructive" : officer.topPerformer ? "bg-emerald-500" : "bg-indigo-500"
                        }`}
                        style={{ width: `${officer.resolutionRate}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground font-semibold mt-1">
                      {officer.resolutionRate}% resolved · avg {formatHours(officer.avgReportedToCleaningHours)} to start · {formatHours(officer.avgResolutionHours)} to clean
                      {officer.overdueCount > 0 && (
                        <span className="text-destructive font-bold"> · {officer.overdueCount} overdue</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-black text-foreground">{officer.total}</div>
                    <div className="text-[10px] font-bold text-muted-foreground">total</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hotspots */}
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2 mb-1">
            <Flame className="w-5 h-5 text-orange-500" /> District Hotspots
          </h2>
          <p className="text-sm text-muted-foreground font-medium mb-5">
            Locations reported more than once, with a 7-day trend
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !data?.hotspots.length ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <Flame className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-bold text-muted-foreground">No repeated hotspots</p>
              <p className="text-xs text-muted-foreground/70 font-medium mt-1">No location has been reported twice yet</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
              {data.hotspots.map((spot, i) => {
                const trendCfg = TREND_CONFIG[spot.trend];
                const TrendIcon = trendCfg.icon;
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-muted/30 border border-border/40">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                      spot.count >= 5 ? "bg-destructive/15 text-destructive" :
                      spot.count >= 3 ? "bg-orange-50 text-orange-600" :
                      "bg-amber-50 text-amber-600"
                    }`}>
                      {spot.count}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate leading-tight">
                        {spot.address ?? `${spot.lat.toFixed(3)}, ${spot.lng.toFixed(3)}`}
                      </p>
                      <p className={`text-[11px] font-bold flex items-center gap-1 ${trendCfg.color}`}>
                        <TrendIcon className="w-3 h-3" /> {trendCfg.label}
                      </p>
                    </div>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${spot.lat}&mlon=${spot.lng}&zoom=17`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-muted-foreground"
                      title="View on map"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Longest outstanding reports */}
      <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-destructive" /> Longest Outstanding Reports
          </h2>
          <span className="text-xs font-bold text-muted-foreground">Oldest 10 open</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !data?.oldestOpenReports.length ? (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-muted-foreground">No open reports</p>
            <p className="text-xs text-muted-foreground/70 font-medium mt-1">Everything has been cleaned</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {data.oldestOpenReports.map((report) => {
              const dotColor = STATUS_COLORS[report.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.reported;
              return (
                <div key={report.id} className="py-3.5 flex items-start gap-3 first:pt-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: dotColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-black text-foreground">#{report.id}</span>
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded-full capitalize"
                        style={{ background: `${dotColor}1a`, color: dotColor }}
                      >
                        {report.status}
                      </span>
                      {report.assignedOfficer && (
                        <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-0.5">
                          <Users className="w-2.5 h-2.5" />{report.assignedOfficer.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium truncate">
                      {report.address ?? `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-black text-destructive">{formatHours(report.hoursOpen)}</span>
                    <span className="block text-[10px] text-muted-foreground/70 font-medium">open</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
