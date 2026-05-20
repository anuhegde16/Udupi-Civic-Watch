import { useState, useMemo } from "react";
import {
  useGetReportsSummary,
  useListOfficers,
  useAdminListReports,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Users,
  FileWarning,
  CheckCircle2,
  Clock,
  Activity,
  ArrowRight,
  Anchor,
  TrendingUp,
  AlertTriangle,
  MapPin,
  Filter,
  ChevronDown,
  CalendarIcon,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { format, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { AdminDistrictMap } from "@/components/admin-district-map";
import type { MapReport, MapOfficer } from "@/components/admin-district-map";

const STATUS_COLORS = {
  reported: "#ef4444",
  cleaning: "#f59e0b",
  cleaned: "#22c55e",
};

const ZONE_PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#f97316",
  "#10b981",
  "#ec4899",
  "#0ea5e9",
];

function useAnalytics() {
  return useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () =>
      customFetch<{
        dailyTrend: { day: string; count: number }[];
        byStatus: { total: number; reported: number; cleaning: number; cleaned: number };
        officers: { name: string; pending: number; resolved: number }[];
      }>("/api/admin/reports/analytics"),
    retry: false,
  });
}

type ReportItem = {
  id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  createdAt: string;
  assignedOfficerId?: number | null;
};

export default function AdminDashboard() {
  const [selectedOfficerId, setSelectedOfficerId] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);

  const { data: summary, isLoading: isLoadingSummary } = useGetReportsSummary();
  const { data: officersData, isLoading: isLoadingOfficers } = useListOfficers();
  const { data: analytics, isLoading: isLoadingAnalytics } = useAnalytics();
  const { data: allReportsData, isLoading: isLoadingReports } = useAdminListReports({ limit: 500 });

  const isLoading = isLoadingSummary || isLoadingOfficers || isLoadingAnalytics || isLoadingReports;

  const officers = (officersData?.officers || []) as (MapOfficer & {
    id: number;
    name: string;
    email: string;
    reportCount: number;
    pendingCount: number;
  })[];

  const allReports = (allReportsData?.reports || []) as ReportItem[];

  const filteredReports = useMemo(() => {
    let reports = selectedOfficerId
      ? allReports.filter((r) => r.assignedOfficerId === selectedOfficerId)
      : allReports;

    if (dateRange?.from) {
      const from = startOfDay(dateRange.from);
      const to = endOfDay(dateRange.to ?? dateRange.from);
      reports = reports.filter((r) => {
        const d = new Date(r.createdAt);
        return d >= from && d <= to;
      });
    }

    return reports;
  }, [allReports, selectedOfficerId, dateRange]);

  const isDateFiltered = !!dateRange?.from;

  const stats = useMemo(() => {
    if (!selectedOfficerId && !isDateFiltered) {
      return {
        total: summary?.total || 0,
        reported: summary?.reported || 0,
        cleaning: summary?.cleaning || 0,
        cleaned: summary?.cleaned || 0,
      };
    }
    return {
      total: filteredReports.length,
      reported: filteredReports.filter((r) => r.status === "reported").length,
      cleaning: filteredReports.filter((r) => r.status === "cleaning").length,
      cleaned: filteredReports.filter((r) => r.status === "cleaned").length,
    };
  }, [filteredReports, selectedOfficerId, isDateFiltered, summary]);

  const backlog = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return filteredReports.filter(
      (r) => r.status === "reported" && new Date(r.createdAt).getTime() < cutoff
    );
  }, [filteredReports]);

  const trendData = useMemo(() => {
    if (!selectedOfficerId && !isDateFiltered) return analytics?.dailyTrend || [];

    // Build date buckets — use the selected range, or last 14 days as fallback
    const rangeFrom = dateRange?.from
      ? startOfDay(dateRange.from)
      : new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    const rangeTo = dateRange?.to
      ? endOfDay(dateRange.to)
      : dateRange?.from
      ? endOfDay(dateRange.from)
      : endOfDay(new Date());

    const buckets: { day: string }[] = [];
    const cur = new Date(rangeFrom);
    while (cur <= rangeTo && buckets.length < 60) {
      buckets.push({
        day: cur.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
      cur.setDate(cur.getDate() + 1);
    }

    const counts: Record<string, number> = {};
    buckets.forEach((b) => (counts[b.day] = 0));
    filteredReports.forEach((r) => {
      const key = new Date(r.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (key in counts) counts[key]++;
    });
    return buckets.map((b) => ({ day: b.day, count: counts[b.day] }));
  }, [selectedOfficerId, isDateFiltered, dateRange, filteredReports, analytics]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="font-bold text-lg text-foreground">Loading command center...</p>
      </div>
    );
  }

  const pieData = [
    { name: "New", value: stats.reported, color: STATUS_COLORS.reported },
    { name: "In Progress", value: stats.cleaning, color: STATUS_COLORS.cleaning },
    { name: "Cleaned", value: stats.cleaned, color: STATUS_COLORS.cleaned },
  ].filter((d) => d.value > 0);

  const completionRate = stats.total > 0 ? Math.round((stats.cleaned / stats.total) * 100) : 0;

  const selectedOfficer = selectedOfficerId
    ? officers.find((o) => o.id === selectedOfficerId)
    : null;

  const mapReports: MapReport[] = allReports.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    status: r.status,
    assignedOfficerId: r.assignedOfficerId,
  }));

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      {/* ── Header + zone filter ── */}
      <div className="mb-5 sm:mb-8 bg-card rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 bg-primary/5 rounded-bl-[80px] sm:rounded-bl-[120px] pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-foreground tracking-tight mb-1 sm:mb-2">
              Command Center
            </h1>
            <p className="text-muted-foreground font-medium text-sm sm:text-lg">
              {selectedOfficer
                ? `Viewing: ${selectedOfficer.areaName || selectedOfficer.name}`
                : "District-wide overview — Udupi, Karnataka."}
            </p>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 self-start">
            {/* Zone filter */}
            <div className="relative">
              <div className="flex items-center gap-2 bg-muted/60 border border-border/60 rounded-xl px-3 py-2 cursor-pointer">
                <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <select
                  className="bg-transparent text-sm font-semibold text-foreground outline-none cursor-pointer pr-5 appearance-none"
                  value={selectedOfficerId ?? "all"}
                  onChange={(e) =>
                    setSelectedOfficerId(e.target.value === "all" ? null : Number(e.target.value))
                  }
                >
                  <option value="all">All Zones</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.areaName || o.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 pointer-events-none absolute right-3" />
              </div>
            </div>

            {/* Date range picker */}
            <Popover
              open={calOpen}
              onOpenChange={(open) => {
                // Block auto-close while only the start date has been picked
                if (!open && dateRange?.from && !dateRange?.to) return;
                setCalOpen(open);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    isDateFiltered
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-muted/60 border-border/60 text-foreground"
                  }`}
                >
                  <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isDateFiltered
                      ? dateRange!.to && format(dateRange!.to, "d MMM") !== format(dateRange!.from!, "d MMM")
                        ? `${format(dateRange!.from!, "d MMM")} – ${format(dateRange!.to, "d MMM")}`
                        : format(dateRange!.from!, "d MMM yyyy")
                      : "Date range"}
                  </span>
                  {isDateFiltered && (
                    <span
                      role="button"
                      aria-label="Clear date filter"
                      onClick={(e) => { e.stopPropagation(); setDateRange(undefined); }}
                      className="ml-0.5 hover:text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                {/* Quick presets */}
                <div className="flex items-center gap-1.5 p-2.5 border-b border-border/50 flex-wrap">
                  {[
                    { label: "Today", from: 0, to: 0 },
                    { label: "Yesterday", from: 1, to: 1 },
                    { label: "Last 7 days", from: 6, to: 0 },
                    { label: "Last 30 days", from: 29, to: 0 },
                    { label: "This month", from: -1, to: 0 },
                  ].map(({ label, from, to }) => (
                    <button
                      key={label}
                      className="text-xs font-bold px-2.5 py-1 rounded-lg bg-muted hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap"
                      onClick={() => {
                        const now = new Date();
                        let f: Date, t: Date;
                        if (label === "This month") {
                          f = new Date(now.getFullYear(), now.getMonth(), 1);
                          t = now;
                        } else {
                          f = new Date(now); f.setDate(now.getDate() - from);
                          t = new Date(now); t.setDate(now.getDate() - to);
                        }
                        setDateRange({ from: f, to: t });
                        if (t <= f || label === "Today" || label === "Yesterday") setCalOpen(false);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  {isDateFiltered && (
                    <button
                      className="text-xs font-bold px-2.5 py-1 rounded-lg text-destructive bg-destructive/5 hover:bg-destructive/10 transition-colors"
                      onClick={() => { setDateRange(undefined); setCalOpen(false); }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => {
                    setDateRange(range);
                    if (range?.from && range?.to) setCalOpen(false);
                  }}
                  disabled={{ after: new Date() }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-5 sm:mb-8">
        <StatCard
          title="Total Reports"
          value={stats.total}
          icon={Activity}
          colorClass="text-blue-600"
          iconBg="bg-blue-50"
          desc={selectedOfficerId ? undefined : `${summary?.last7d || 0} this week`}
          href={selectedOfficerId ? `/admin/reports?officerId=${selectedOfficerId}` : "/admin/reports"}
        />
        <StatCard
          title="Needs Attention"
          value={stats.reported}
          icon={FileWarning}
          colorClass="text-red-600"
          iconBg="bg-red-50"
          href="/admin/reports?status=reported"
        />
        <StatCard
          title="In Progress"
          value={stats.cleaning}
          icon={Clock}
          colorClass="text-amber-600"
          iconBg="bg-amber-50"
          href="/admin/reports?status=cleaning"
        />
        <StatCard
          title="Cleaned"
          value={stats.cleaned}
          icon={CheckCircle2}
          colorClass="text-green-600"
          iconBg="bg-green-50"
          href="/admin/reports?status=cleaned"
        />
      </div>

      {/* ── Completion bar ── */}
      <div className="mb-5 sm:mb-8 bg-card rounded-2xl border border-border/50 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs sm:text-sm font-bold text-foreground">
            District Completion Rate
            {selectedOfficer && (
              <span className="text-muted-foreground font-medium ml-1.5">
                · {selectedOfficer.areaName || selectedOfficer.name}
              </span>
            )}
          </span>
          <span className="text-lg sm:text-2xl font-black text-foreground">{completionRate}%</span>
        </div>
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${completionRate}%`,
              background:
                completionRate >= 70
                  ? STATUS_COLORS.cleaned
                  : completionRate >= 40
                  ? STATUS_COLORS.cleaning
                  : STATUS_COLORS.reported,
            }}
          />
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px] font-semibold text-muted-foreground">
          <span style={{ color: STATUS_COLORS.reported }}>● {stats.reported} New</span>
          <span style={{ color: STATUS_COLORS.cleaning }}>● {stats.cleaning} In Progress</span>
          <span style={{ color: STATUS_COLORS.cleaned }}>● {stats.cleaned} Cleaned</span>
        </div>
      </div>

      {/* ── Backlog alert ── */}
      {backlog.length > 0 && (
        <div className="mb-5 sm:mb-8 bg-red-50 border border-red-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-red-700 mb-0.5">
              {backlog.length} report{backlog.length !== 1 ? "s" : ""} unattended for over 24 hours
            </p>
            <p className="text-xs text-red-600 font-medium">
              These waste reports have been sitting in "New" status without being picked up.
            </p>
          </div>
          <Link href="/admin/reports?status=reported">
            <div className="shrink-0 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 border border-red-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer whitespace-nowrap">
              Review now →
            </div>
          </Link>
        </div>
      )}

      {/* ── District map ── */}
      <div className="mb-5 sm:mb-8 bg-card rounded-2xl sm:rounded-3xl border border-border/50 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-xl font-black text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> District Map
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5">
              Click a zone circle to filter · colour = status
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] sm:text-xs font-bold">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />New</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Progress</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />Cleaned</span>
          </div>
        </div>
        <AdminDistrictMap
          reports={mapReports}
          officers={officers}
          selectedOfficerId={selectedOfficerId}
          onZoneSelect={setSelectedOfficerId}
        />
        {selectedOfficerId && (
          <div className="px-4 sm:px-6 py-2 bg-primary/5 border-t border-primary/10 flex items-center justify-between">
            <p className="text-xs font-bold text-primary">
              Showing: {selectedOfficer?.areaName || selectedOfficer?.name} zone only
            </p>
            <button
              className="text-xs font-bold text-primary/70 hover:text-primary transition-colors"
              onClick={() => setSelectedOfficerId(null)}
            >
              Clear filter ×
            </button>
          </div>
        )}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-5 sm:mb-8">
        <div className="lg:col-span-2 bg-card rounded-2xl sm:rounded-3xl border border-border/50 shadow-sm p-4 sm:p-6">
          <h2 className="text-base sm:text-xl font-black text-foreground mb-0.5 sm:mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> Reports — Last 14 Days
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium mb-4 sm:mb-6">
            Daily submission volume{selectedOfficerId ? " (zone filtered)" : ""}
          </p>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={trendData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 9, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))", fontSize: 12 }}
                  labelStyle={{ fontWeight: 700 }}
                  cursor={{ fill: "hsl(var(--muted))" }}
                />
                <Bar dataKey="count" name="Reports" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-muted-foreground font-medium text-sm">
              No reports in the last 14 days
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl sm:rounded-3xl border border-border/50 shadow-sm p-4 sm:p-6 flex flex-col">
          <h2 className="text-base sm:text-xl font-black text-foreground mb-0.5 sm:mb-1">
            Status Breakdown
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium mb-2 sm:mb-4">
            Current distribution{selectedOfficerId ? " (zone)" : ""}
          </p>
          {pieData.length > 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                {pieData.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                    <span>{entry.name}</span>
                    <span className="font-black text-foreground">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground font-medium text-sm">
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* ── Zone performance cards ── */}
      <div className="mb-5 sm:mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-2xl font-black text-foreground flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            Officer Zones
          </h2>
          <Link
            href="/admin/officers"
            className="text-primary font-bold text-xs sm:text-sm hover:underline flex items-center bg-primary/5 px-3 sm:px-4 py-2 rounded-xl transition-colors hover:bg-primary/10"
          >
            Manage <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {officers.length === 0 ? (
            <div className="col-span-full text-center text-muted-foreground font-medium py-8 bg-card rounded-xl border border-border/50">
              No officers active in the system.
            </div>
          ) : (
            officers.map((officer, idx) => {
              const zoneColor = ZONE_PALETTE[idx % ZONE_PALETTE.length];
              const resolved = officer.reportCount - officer.pendingCount;
              const rate =
                officer.reportCount > 0
                  ? Math.round((resolved / officer.reportCount) * 100)
                  : 0;
              const isActive = selectedOfficerId === officer.id;

              return (
                <button
                  key={officer.id}
                  onClick={() =>
                    setSelectedOfficerId(isActive ? null : officer.id)
                  }
                  className={`text-left w-full bg-card rounded-xl border shadow-sm p-3 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-95 ${
                    isActive ? "border-2 shadow-md" : "border-border/50"
                  }`}
                  style={isActive ? { borderColor: zoneColor } : {}}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0"
                      style={{ background: zoneColor }}
                    >
                      {officer.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-foreground truncate leading-tight">
                        {officer.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-medium truncate">
                        {officer.areaName || "Unassigned"}
                      </p>
                    </div>
                    <span
                      className="text-xs font-black shrink-0"
                      style={{ color: zoneColor }}
                    >
                      {rate}%
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${rate}%`, background: zoneColor }}
                    />
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        officer.pendingCount > 5
                          ? "bg-red-50 text-red-600"
                          : officer.pendingCount > 0
                          ? "bg-amber-50 text-amber-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {officer.pendingCount} open
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                      {resolved} done
                    </span>
                    <span className="ml-auto text-muted-foreground font-medium">
                      {officer.reportCount}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Officer performance bar chart ── */}
      {analytics?.officers && analytics.officers.length > 0 && (
        <div className="bg-card rounded-2xl sm:rounded-3xl border border-border/50 shadow-sm p-4 sm:p-6 mb-5 sm:mb-8">
          <h2 className="text-base sm:text-xl font-black text-foreground mb-0.5 sm:mb-1 flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> Officer Performance
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium mb-4 sm:mb-6">
            Pending vs resolved per officer
          </p>
          <ResponsiveContainer width="100%" height={Math.max(140, analytics.officers.length * 44)}>
            <BarChart
              data={analytics.officers}
              layout="vertical"
              margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))", fontSize: 12 }}
                cursor={{ fill: "hsl(var(--muted))" }}
              />
              <Bar dataKey="pending" name="Pending" fill={STATUS_COLORS.reported} radius={[0, 4, 4, 0]} />
              <Bar dataKey="resolved" name="Resolved" fill={STATUS_COLORS.cleaned} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-3 justify-center">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="w-3 h-3 rounded-sm" style={{ background: STATUS_COLORS.reported }} />
              Pending
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="w-3 h-3 rounded-sm" style={{ background: STATUS_COLORS.cleaned }} />
              Resolved
            </div>
          </div>
        </div>
      )}

      {/* ── Quick actions + coast status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 content-start">
          <QuickAction
            href="/admin/reports"
            title="Review All Reports"
            desc="Filter, assign, and manage reports"
          />
          <QuickAction
            href="/admin/officers"
            title="Add New Officer"
            desc="Expand your sanitation team roster"
          />
        </div>

        <div className="bg-primary text-primary-foreground rounded-2xl sm:rounded-3xl p-5 sm:p-8 relative overflow-hidden shadow-xl shadow-primary/20">
          <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-bl-[80px] sm:rounded-bl-[100px]" />
          <h3 className="font-black text-base sm:text-xl mb-2 sm:mb-3 flex items-center gap-2">
            <Anchor className="w-5 h-5" /> Coast Status
          </h3>
          <p className="text-primary-foreground/90 leading-relaxed font-medium text-sm sm:text-lg">
            Last 24 hours —{" "}
            <span className="font-black text-white bg-white/20 px-2 py-0.5 rounded-md">
              {summary?.last24h || 0}
            </span>{" "}
            new reports. Completion rate{" "}
            <span className="font-black text-white bg-white/20 px-2 py-0.5 rounded-md ml-1">
              {completionRate}%
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  colorClass,
  iconBg,
  desc,
  href,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  colorClass: string;
  iconBg: string;
  desc?: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <div className="group flex items-center gap-3 p-3 sm:p-4 bg-card border border-border/50 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-200 cursor-pointer">
        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${colorClass}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xl sm:text-2xl font-black text-foreground leading-none mb-0.5">{value}</p>
          <p className="text-xs font-bold text-muted-foreground truncate leading-tight">{title}</p>
          {desc && (
            <p className="text-[10px] text-muted-foreground/70 font-medium mt-0.5 truncate">{desc}</p>
          )}
        </div>
        <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors" />
      </div>
    </Link>
  );
}

function QuickAction({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href}>
      <div className="bg-card border border-border/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group flex items-center justify-between h-full">
        <div>
          <h3 className="font-bold text-foreground sm:text-lg group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 font-medium">{desc}</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0 ml-3">
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
        </div>
      </div>
    </Link>
  );
}
