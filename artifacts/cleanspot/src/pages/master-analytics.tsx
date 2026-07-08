import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  Loader2,
  Users,
  MapPin,
  CheckCircle2,
  Clock,
  AlertCircle,
  LayoutList,
  TrendingUp,
  Flame,
  FileText,
  BarChart2,
  Trophy,
  Navigation,
  X,
  ChevronRight,
  ImageIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

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
  total: number;
  cleaned: number;
  pending: number;
  resolutionRate: number;
};

type Hotspot = {
  lat: number;
  lng: number;
  count: number;
  address?: string | null;
};

type Report = {
  id: number;
  status: string;
  address?: string | null;
  description?: string | null;
  latitude: number;
  longitude: number;
  imageUrl?: string | null;
  imageUrls?: { url: string; uploadedAt: string }[] | null;
  createdAt: string;
  assignedOfficer?: { id: number; name: string; areaName?: string | null } | null;
};

type AnalyticsData = {
  dailyTrend: DayTrend[];
  officerLeaderboard: OfficerStat[];
  hotspots: Hotspot[];
  recentReports: Report[];
};

type PanchayatStats = {
  total: number;
  reported: number;
  cleaning: number;
  cleaned: number;
};

type FilterState = {
  open: boolean;
  status: string | undefined;
  label: string;
};

function useAnalytics() {
  return useQuery<AnalyticsData>({
    queryKey: ["panchayat-analytics"],
    queryFn: () => customFetch("/api/panchayat/analytics"),
    retry: false,
    refetchInterval: 60_000,
  });
}

function usePanchayatStats() {
  return useQuery<PanchayatStats>({
    queryKey: ["panchayat-stats"],
    queryFn: () => customFetch("/api/panchayat/stats"),
    retry: false,
  });
}

function usePanchayatReports(status: string | undefined, enabled: boolean) {
  const url = status
    ? `/api/panchayat/reports?status=${encodeURIComponent(status)}`
    : "/api/panchayat/reports";
  return useQuery<{ reports: Report[]; total: number }>({
    queryKey: ["panchayat-reports-filter", status ?? "all"],
    queryFn: () => customFetch(url),
    enabled,
    retry: false,
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string; border: string }> = {
  reported: {
    label: "Reported",
    color: "text-destructive",
    bg: "bg-destructive/10",
    dot: "bg-destructive",
    border: "border-destructive/30",
  },
  cleaning: {
    label: "Cleaning",
    color: "text-blue-600",
    bg: "bg-blue-50",
    dot: "bg-blue-500",
    border: "border-blue-200",
  },
  cleaned: {
    label: "Cleaned",
    color: "text-primary",
    bg: "bg-primary/10",
    dot: "bg-primary",
    border: "border-primary/20",
  },
};

const ZONE_COLORS = ["#6366f1", "#8b5cf6", "#f97316", "#3b82f6", "#10b981", "#ec4899", "#0ea5e9", "#eab308"];

function TrendChart({ data }: { data: DayTrend[] }) {
  const maxVal = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="flex items-end gap-1.5 h-28 w-full">
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
                  <div className="bg-indigo-500" style={{ height: `${cleanedPct}%` }} />
                </div>
              )}
              {day.total > 0 && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-card border border-border/50 px-1.5 py-0.5 rounded-md shadow-sm z-10">
                  {day.total}
                </div>
              )}
            </div>
            <span className="text-[9px] font-bold text-muted-foreground uppercase">
              {format(parseISO(day.date), "EEE")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ReportRow({ report }: { report: Report }) {
  const cfg = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.reported;
  return (
    <div className="py-4 flex items-start gap-3 border-b border-border/40 last:border-0">
      {(report.imageUrls?.[0]?.url ?? report.imageUrl) ? (
        <img
          src={report.imageUrls?.[0]?.url ?? report.imageUrl!}
          alt="Report"
          className="w-14 h-14 rounded-xl object-cover shrink-0 border border-border/40"
        />
      ) : (
        <div className="w-14 h-14 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 border border-border/40">
          <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-black text-foreground">#{report.id}</span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            {cfg.label}
          </span>
          {report.assignedOfficer && (
            <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" />{report.assignedOfficer.name}
              {report.assignedOfficer.areaName && (
                <span className="ml-0.5 text-muted-foreground/60">· {report.assignedOfficer.areaName}</span>
              )}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-medium truncate mb-0.5">
          <MapPin className="w-3 h-3 inline mr-0.5 shrink-0" />
          {report.address ?? `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`}
        </p>
        {report.description && (
          <p className="text-xs text-foreground/60 font-medium line-clamp-2">{report.description}</p>
        )}
      </div>
      <div className="shrink-0 text-right ml-1">
        <span className="text-[11px] font-bold text-muted-foreground block">
          {format(new Date(report.createdAt), "dd MMM")}
        </span>
        <span className="text-[10px] text-muted-foreground/60 font-medium">
          {format(new Date(report.createdAt), "HH:mm")}
        </span>
        <a
          href={`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}&zoom=17`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 flex items-center justify-end gap-0.5 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Navigation className="w-2.5 h-2.5" /> Map
        </a>
      </div>
    </div>
  );
}

export default function MasterAnalytics() {
  const { user } = useAuth();
  const { data: analytics, isLoading: isLoadingAnalytics } = useAnalytics();
  const { data: stats, isLoading: isLoadingStats } = usePanchayatStats();

  const [filter, setFilter] = useState<FilterState>({ open: false, status: undefined, label: "" });

  const { data: filteredReports, isLoading: isLoadingFiltered } = usePanchayatReports(
    filter.status,
    filter.open
  );

  const completionRate =
    (stats?.total ?? 0) > 0 ? Math.round(((stats?.cleaned ?? 0) / stats!.total) * 100) : 0;

  const totalThisWeek = analytics?.dailyTrend.reduce((s, d) => s + d.total, 0) ?? 0;
  const cleanedThisWeek = analytics?.dailyTrend.reduce((s, d) => s + d.cleaned, 0) ?? 0;

  const kpiCards = [
    {
      label: "All Time Total",
      value: stats?.total ?? 0,
      icon: <LayoutList className="w-5 h-5" />,
      color: "text-foreground",
      bg: "bg-muted/60",
      ring: "ring-foreground/20",
      status: undefined,
    },
    {
      label: "New Reports",
      value: stats?.reported ?? 0,
      icon: <AlertCircle className="w-5 h-5" />,
      color: "text-destructive",
      bg: "bg-destructive/8",
      ring: "ring-destructive/30",
      status: "reported",
    },
    {
      label: "In Progress",
      value: stats?.cleaning ?? 0,
      icon: <Clock className="w-5 h-5" />,
      color: "text-blue-500",
      bg: "bg-blue-50",
      ring: "ring-blue-300",
      status: "cleaning",
    },
    {
      label: "Cleaned",
      value: stats?.cleaned ?? 0,
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      ring: "ring-indigo-300",
      status: "cleaned",
    },
  ];

  return (
    <div className="pb-12 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-bl-[100px] pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-indigo-200">
              <BarChart2 className="w-3.5 h-3.5" /> Analytics
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
              {user?.panchayatName ?? "My Panchayat"}
            </h1>
            <p className="text-muted-foreground font-medium">
              Reporting insights, officer performance, and hotspot tracking
            </p>
          </div>

          {/* Nav tabs */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/master/dashboard">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted/60 transition-colors cursor-pointer">
                <Users className="w-4 h-4" /> Officers
              </span>
            </Link>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black bg-indigo-600 text-white cursor-default">
              <BarChart2 className="w-4 h-4" /> Analytics
            </span>
          </div>
        </div>

        {/* KPI cards — clickable */}
        {!isLoadingStats && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpiCards.map((s) => (
              <button
                key={s.label}
                onClick={() => setFilter({ open: true, status: s.status, label: s.label })}
                className={`${s.bg} rounded-2xl px-4 py-3 flex items-center gap-3 text-left cursor-pointer hover:ring-2 ${s.ring} transition-all hover:scale-[1.02] active:scale-[0.98] group w-full`}
              >
                <div className={`${s.color} shrink-0 group-hover:scale-110 transition-transform`}>{s.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground font-semibold">{s.label}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        )}
        {!isLoadingStats && (stats?.total ?? 0) > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Overall completion</span>
              <span className="text-xs font-black text-indigo-600">{completionRate}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${completionRate}%` }} />
            </div>
          </div>
        )}
        {isLoadingStats && (
          <div className="mt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm font-medium">Loading stats…</span>
          </div>
        )}
      </div>

      {/* 7-day trend */}
      <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-foreground flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" /> 7-Day Trend
            </h2>
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              Reports this week: <span className="font-black text-foreground">{totalThisWeek}</span>
              {totalThisWeek > 0 && (
                <span className="ml-2 text-indigo-600 font-bold">· {cleanedThisWeek} resolved</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-bold shrink-0">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Cleaned</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" /> Cleaning</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-destructive/70 inline-block" /> New</span>
          </div>
        </div>
        {isLoadingAnalytics ? (
          <div className="h-28 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <TrendChart data={analytics?.dailyTrend ?? []} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Officer leaderboard */}
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2 mb-5">
            <Trophy className="w-5 h-5 text-indigo-500" /> Officer Performance
          </h2>
          {isLoadingAnalytics ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !analytics?.officerLeaderboard.length ? (
            <p className="text-sm text-muted-foreground font-medium text-center py-10">No officers yet</p>
          ) : (
            <div className="space-y-3">
              {analytics.officerLeaderboard.map((officer, i) => {
                const color = ZONE_COLORS[i % ZONE_COLORS.length];
                return (
                  <div key={officer.id} className="flex items-center gap-3 p-3 rounded-2xl bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                      style={{ background: color }}
                    >
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : officer.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-black text-sm text-foreground truncate">{officer.name}</span>
                        {officer.areaName && (
                          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5" />{officer.areaName}
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${officer.resolutionRate}%`, background: color }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-black text-foreground">{officer.cleaned}</div>
                      <div className="text-[10px] font-bold text-muted-foreground">resolved</div>
                    </div>
                    <div className="text-right shrink-0 ml-1">
                      <div className="text-base font-black text-orange-500">{officer.pending}</div>
                      <div className="text-[10px] font-bold text-muted-foreground">pending</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hotspots */}
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2 mb-1">
            <Flame className="w-5 h-5 text-orange-500" /> Repeated Hotspots
          </h2>
          <p className="text-sm text-muted-foreground font-medium mb-5">
            Locations reported more than once
          </p>
          {isLoadingAnalytics ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !analytics?.hotspots.length ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <Flame className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-bold text-muted-foreground">No repeated hotspots</p>
              <p className="text-xs text-muted-foreground/70 font-medium mt-1">Great — no location has been reported twice yet</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {analytics.hotspots.map((spot, i) => (
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
                    <p className="text-[11px] text-muted-foreground font-medium">
                      {spot.lat.toFixed(4)}° N · {spot.lng.toFixed(4)}° E
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
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent complaints feed */}
      <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" /> Recent Complaints
          </h2>
          <span className="text-xs font-bold text-muted-foreground">Latest 10</span>
        </div>
        {isLoadingAnalytics ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !analytics?.recentReports.length ? (
          <p className="text-sm text-muted-foreground font-medium text-center py-10">No reports yet</p>
        ) : (
          <div className="divide-y divide-border/40">
            {analytics.recentReports.map((report) => {
              const cfg = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.reported;
              return (
                <div key={report.id} className="py-3.5 flex items-start gap-3 first:pt-0 last:pb-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-black text-foreground">#{report.id}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
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
                    {report.description && (
                      <p className="text-xs text-foreground/60 font-medium truncate mt-0.5">{report.description}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {format(new Date(report.createdAt), "dd MMM")}
                    </span>
                    <p className="text-[10px] text-muted-foreground/60 font-medium">
                      {format(new Date(report.createdAt), "HH:mm")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drill-down sheet */}
      <Sheet open={filter.open} onOpenChange={(open) => setFilter((f) => ({ ...f, open }))}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl font-black text-foreground flex items-center gap-2">
                {filter.status === "reported" && <AlertCircle className="w-5 h-5 text-destructive" />}
                {filter.status === "cleaning" && <Clock className="w-5 h-5 text-blue-500" />}
                {filter.status === "cleaned" && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                {!filter.status && <LayoutList className="w-5 h-5 text-foreground" />}
                {filter.label}
              </SheetTitle>
              {!isLoadingFiltered && filteredReports && (
                <span className="text-sm font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                  {filteredReports.total}
                </span>
              )}
            </div>
            {filter.status && (
              <p className="text-sm text-muted-foreground font-medium mt-1">
                All <span className="font-bold capitalize">{filter.status}</span> reports in your panchayat
              </p>
            )}
            {!filter.status && (
              <p className="text-sm text-muted-foreground font-medium mt-1">
                All reports across your panchayat
              </p>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-2">
            {isLoadingFiltered ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="text-sm font-medium">Loading reports…</span>
              </div>
            ) : !filteredReports?.reports.length ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                  <FileText className="w-7 h-7 text-muted-foreground/40" />
                </div>
                <p className="font-black text-foreground mb-1">No reports found</p>
                <p className="text-sm text-muted-foreground font-medium">
                  There are no {filter.status ?? ""} reports yet
                </p>
              </div>
            ) : (
              <div>
                {filteredReports.reports.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
