import { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { getGreeting } from "@/lib/greeting";
import {
  useGetReportsSummary,
  getGetReportsSummaryQueryKey,
  useListOfficers,
  getListOfficersQueryKey,
  useAdminListReports,
  getAdminListReportsQueryKey,
  useHealthCheck,
  getHealthCheckQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
  Shield,
  Plus,
  Trash2,
  Building2,
  Pencil,
  FlaskConical,
  RefreshCw,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import geofencesData from "@/data/geofences.json";
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
import { NotificationCTABanner } from "@/components/notification-cta-banner";
import type { MapReport, MapOfficer } from "@/components/admin-district-map";

const panchayatAreaNames: string[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "district")
  .map((f) => (f.properties as any)?.name ?? "")
  .filter(Boolean);

const STATUS_COLORS = {
  reported: "#ef4444",
  cleaning: "#3b82f6",
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
    staleTime: 5 * 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

type PanchayatAdminItem = {
  id: number;
  name: string;
  email: string;
  panchayatName?: string | null;
  officerCount: number;
  createdAt: string;
};

function usePanchayatAdmins() {
  return useQuery<{ admins: PanchayatAdminItem[]; total: number }>({
    queryKey: ["panchayat-admins"],
    queryFn: () => customFetch("/api/admin/panchayat-admins"),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

const createPanchayatAdminSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Min 6 characters"),
  panchayatName: z.string().min(2, "Panchayat name is required"),
});
type CreatePanchayatAdminValues = z.infer<typeof createPanchayatAdminSchema>;

const editPanchayatAdminSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  panchayatName: z.string().min(2, "Panchayat name is required"),
  password: z.string().max(100).optional().or(z.literal("")),
});
type EditPanchayatAdminValues = z.infer<typeof editPanchayatAdminSchema>;

type ReportItem = {
  id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  createdAt: string;
  assignedOfficerId?: number | null;
  imageUrl?: string | null;
  imageUrls?: { url: string; uploadedAt: string }[] | null;
  cleanupImageUrl?: string | null;
  cleanupImageUrls?: { url: string; uploadedAt: string }[] | null;
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [selectedOfficerId, setSelectedOfficerId] = useState<number | null>(null);
  const [selectedPanchayat, setSelectedPanchayat] = useState<string | null>(null);
  const [selectedWardName, setSelectedWardName] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 29);
    return { from, to: now };
  });
  const [calOpen, setCalOpen] = useState(false);
  // Tracks mid-range selection synchronously — state updates are async so a ref is needed
  const pickingEndRef = useRef(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const relativeLastRefreshed = useRelativeTime(lastRefreshed);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries();
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }

  const [paCreateOpen, setPaCreateOpen] = useState(false);
  const [paEditOpen, setPaEditOpen] = useState(false);
  const [editingPa, setEditingPa] = useState<PanchayatAdminItem | null>(null);

  const { data: summary, isLoading: isLoadingSummary, dataUpdatedAt: summaryUpdatedAt } = useGetReportsSummary({
    query: {
      queryKey: getGetReportsSummaryQueryKey(),
      staleTime: 2 * 60_000,
      refetchInterval: 120_000,
      refetchIntervalInBackground: false,
    },
  });
  const { data: officersData, isLoading: isLoadingOfficers, dataUpdatedAt: officersUpdatedAt } = useListOfficers({
    query: {
      queryKey: getListOfficersQueryKey(),
      staleTime: 5 * 60_000,
      refetchInterval: 120_000,
      refetchIntervalInBackground: false,
    },
  });
  const { data: analytics, isLoading: isLoadingAnalytics, dataUpdatedAt: analyticsUpdatedAt } = useAnalytics();
  const { data: allReportsData, isLoading: isLoadingReports, dataUpdatedAt: reportsUpdatedAt } = useAdminListReports(
    { limit: 200 },
    {
      query: {
        queryKey: getAdminListReportsQueryKey({ limit: 200 }),
        staleTime: 60_000,
        refetchInterval: 120_000,
        refetchIntervalInBackground: false,
      },
    },
  );
  const { data: panchayatAdminsData } = usePanchayatAdmins();

  useEffect(() => {
    const latest = Math.max(
      summaryUpdatedAt || 0,
      officersUpdatedAt || 0,
      analyticsUpdatedAt || 0,
      reportsUpdatedAt || 0,
    );
    if (latest > 0) setLastRefreshed(new Date(latest));
  }, [summaryUpdatedAt, officersUpdatedAt, analyticsUpdatedAt, reportsUpdatedAt]);

  const { data: testModeData } = useQuery<{ testMode: boolean }>({
    queryKey: ["test-mode"],
    queryFn: () => customFetch("/api/admin/test-mode"),
    staleTime: 60_000,
  });
  const testModeActive = testModeData?.testMode ?? false;

  const { data: healthData } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000 } });
  const smtpConfigured = healthData?.smtpConfigured ?? null;

  const setTestModeMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      customFetch("/api/admin/test-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testMode: enabled }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["test-mode"] }),
    onError: (err: any) => toast({ title: "Failed to update test mode", description: err.message, variant: "destructive" }),
  });

  const createPaForm = useForm<CreatePanchayatAdminValues>({
    resolver: zodResolver(createPanchayatAdminSchema),
    defaultValues: { name: "", email: "", password: "", panchayatName: "" },
  });

  const editPaForm = useForm<EditPanchayatAdminValues>({
    resolver: zodResolver(editPanchayatAdminSchema),
    defaultValues: { name: "", email: "", panchayatName: "", password: "" },
  });

  const createPaMutation = useMutation({
    mutationFn: (data: CreatePanchayatAdminValues) =>
      customFetch("/api/admin/panchayat-admins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panchayat-admins"] });
      toast({ title: "Panchayat Admin created" });
      setPaCreateOpen(false);
      createPaForm.reset();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const editPaMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditPanchayatAdminValues }) =>
      customFetch(`/api/admin/panchayat-admins/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panchayat-admins"] });
      toast({ title: "Panchayat Admin updated" });
      setPaEditOpen(false);
      setEditingPa(null);
    },
    onError: (err: any) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
  });

  const deletePaMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/panchayat-admins/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panchayat-admins"] });
      toast({ title: "Panchayat Admin removed" });
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  function openEditPa(pa: PanchayatAdminItem) {
    setEditingPa(pa);
    editPaForm.reset({ name: pa.name, email: pa.email, panchayatName: pa.panchayatName ?? "", password: "" });
    setPaEditOpen(true);
  }

  const isLoading = isLoadingSummary || isLoadingOfficers || isLoadingAnalytics || isLoadingReports;

  const panchayatAdmins = panchayatAdminsData?.admins ?? [];

  const officers = (officersData?.officers || []) as (MapOfficer & {
    id: number;
    name: string;
    email: string;
    reportCount: number;
    pendingCount: number;
  })[];

  const allReports = (allReportsData?.reports || []) as ReportItem[];

  const panchayatOptions = useMemo(() => {
    const fromOfficers = Array.from(
      new Set(officers.map((o) => o.panchayatName).filter(Boolean))
    ) as string[];
    return Array.from(new Set([...panchayatAreaNames, ...fromOfficers]));
  }, [officers]);

  const scopedOfficers = useMemo(() => {
    if (!selectedPanchayat) return officers;
    return officers.filter((o) => o.panchayatName === selectedPanchayat);
  }, [officers, selectedPanchayat]);

  const scopedOfficerIds = useMemo(
    () => new Set(scopedOfficers.map((o) => o.id)),
    [scopedOfficers]
  );

  const displayOfficers = useMemo(() => {
    if (!selectedPanchayat) return officers;
    return [...scopedOfficers].sort((a, b) => {
      const rateA = a.reportCount > 0 ? (a.reportCount - a.pendingCount) / a.reportCount : 0;
      const rateB = b.reportCount > 0 ? (b.reportCount - b.pendingCount) / b.reportCount : 0;
      return rateB - rateA;
    });
  }, [officers, scopedOfficers, selectedPanchayat]);

  const filteredReports = useMemo(() => {
    let reports: ReportItem[];
    if (selectedOfficerId) {
      reports = allReports.filter((r) => r.assignedOfficerId === selectedOfficerId);
    } else if (selectedWardName) {
      // Ward chip selected — filter by the officer assigned to that ward (empty if unassigned)
      const wardOfficer = officers.find((o) => o.areaName === selectedWardName);
      reports = wardOfficer
        ? allReports.filter((r) => r.assignedOfficerId === wardOfficer.id)
        : [];
    } else if (selectedPanchayat) {
      reports = allReports.filter(
        (r) =>
          r.assignedOfficerId !== null &&
          r.assignedOfficerId !== undefined &&
          scopedOfficerIds.has(r.assignedOfficerId)
      );
    } else {
      reports = allReports;
    }

    if (dateRange?.from) {
      const from = startOfDay(dateRange.from);
      const to = endOfDay(dateRange.to ?? dateRange.from);
      reports = reports.filter((r) => {
        const d = new Date(r.createdAt);
        return d >= from && d <= to;
      });
    }

    return reports;
  }, [allReports, selectedOfficerId, selectedWardName, selectedPanchayat, officers, scopedOfficerIds, dateRange]);

  const isDateFiltered = !!dateRange?.from;

  const stats = useMemo(() => {
    if (!selectedOfficerId && !selectedPanchayat && !isDateFiltered) {
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
    if (!selectedOfficerId && !selectedPanchayat && !isDateFiltered) return analytics?.dailyTrend || [];

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

  const mapReports: MapReport[] = (
    selectedPanchayat && !selectedOfficerId
      ? allReports.filter(
          (r) =>
            r.assignedOfficerId !== null &&
            r.assignedOfficerId !== undefined &&
            scopedOfficerIds.has(r.assignedOfficerId)
        )
      : allReports
  ).map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    status: r.status,
    assignedOfficerId: r.assignedOfficerId,
    imageUrl: r.imageUrl,
    imageUrls: r.imageUrls,
    cleanupImageUrl: r.cleanupImageUrl,
    cleanupImageUrls: r.cleanupImageUrls,
  }));

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      <NotificationCTABanner variant="officer" />
      {/* ── Header + zone filter ── */}
      <div className="mb-5 sm:mb-8 bg-card rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 bg-primary/5 rounded-bl-[80px] sm:rounded-bl-[120px] pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {getGreeting(user?.name)}
            </p>
            <h1 className="text-2xl sm:text-4xl font-black text-foreground tracking-tight mb-1 sm:mb-2">
              Command Center - DC Office Udupi
            </h1>
            <p className="text-muted-foreground font-medium text-sm sm:text-lg">
              {selectedOfficer
                ? `Viewing: ${selectedOfficer.areaName || selectedOfficer.name}`
                : "District Administration Overview — Udupi, Karnataka."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh data"
            className="relative z-10 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/60 hover:bg-muted disabled:opacity-50 px-3 py-2 rounded-xl shrink-0 self-start"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Updated {relativeLastRefreshed}</span>
          </button>
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
          colorClass="text-blue-600"
          iconBg="bg-blue-50"
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

      {/* ── Filters row ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Group A — Location filters */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:inline">
            Location
          </span>
          {/* Panchayat filter */}
          <div className="relative">
            <div className={`flex items-center gap-2 border rounded-xl px-3 py-2 cursor-pointer transition-colors ${selectedPanchayat ? "bg-primary/10 border-primary/30" : "bg-muted/60 border-border/60"}`}>
              <Building2 className={`w-3.5 h-3.5 shrink-0 ${selectedPanchayat ? "text-primary" : "text-muted-foreground"}`} />
              <select
                className={`bg-transparent text-sm font-semibold outline-none cursor-pointer pr-5 appearance-none ${selectedPanchayat ? "text-primary" : "text-foreground"}`}
                value={selectedPanchayat ?? "all"}
                onChange={(e) => {
                  const val = e.target.value === "all" ? null : e.target.value;
                  setSelectedPanchayat(val);
                  setSelectedOfficerId(null);
                  setSelectedWardName(null);
                }}
              >
                <option value="all">All Panchayats</option>
                {panchayatOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 pointer-events-none absolute right-3" />
            </div>
          </div>

          {/* Ward / Zone filter (scoped to selected panchayat) */}
          <div className="relative">
            <div className={`flex items-center gap-2 border rounded-xl px-3 py-2 cursor-pointer transition-colors ${selectedOfficerId ? "bg-primary/10 border-primary/30" : "bg-muted/60 border-border/60"}`}>
              <Filter className={`w-3.5 h-3.5 shrink-0 ${selectedOfficerId ? "text-primary" : "text-muted-foreground"}`} />
              <select
                className={`bg-transparent text-sm font-semibold outline-none cursor-pointer pr-5 appearance-none ${selectedOfficerId ? "text-primary" : "text-foreground"}`}
                value={selectedOfficerId ?? "all"}
                onChange={(e) => {
                  setSelectedOfficerId(e.target.value === "all" ? null : Number(e.target.value));
                  setSelectedWardName(null);
                }}
              >
                <option value="all">{selectedPanchayat ? "All Wards" : "All Zones"}</option>
                {scopedOfficers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.areaName || o.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 pointer-events-none absolute right-3" />
            </div>
          </div>
        </div>

        {/* Divider */}
        <span className="hidden sm:block w-px h-6 bg-border/60 self-center" />

        {/* Group B — Date range */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:inline">
            Period
          </span>
          <Popover
            open={calOpen}
            onOpenChange={(open) => {
              if (!open && pickingEndRef.current) return;
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
                    : "All dates"}
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
            <PopoverContent className="w-auto p-0" align="start">
              {/* Quick presets */}
              <div className="flex items-center gap-1.5 p-2.5 border-b border-border/50 flex-wrap">
                {[
                  { label: "Today", from: 0, to: 0 },
                  { label: "Yesterday", from: 1, to: 1 },
                  { label: "Last 7 days", from: 6, to: 0 },
                  { label: "Last 30 days", from: 29, to: 0 },
                  { label: "Last 60 days", from: 59, to: 0 },
                  { label: "Last 90 days", from: 89, to: 0 },
                  { label: "Last year", from: 364, to: 0 },
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
                  if (range?.from && !range?.to) {
                    pickingEndRef.current = true;
                  } else {
                    pickingEndRef.current = false;
                    if (range?.from && range?.to) setCalOpen(false);
                  }
                }}
                disabled={{ after: new Date() }}
                numberOfMonths={1}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

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
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Progress</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />Cleaned</span>
          </div>
        </div>
        <AdminDistrictMap
          reports={mapReports}
          officers={officers}
          selectedOfficerId={selectedOfficerId}
          onZoneSelect={setSelectedOfficerId}
          activePanchayat={selectedPanchayat}
          panchayatOptions={panchayatOptions}
          onWardSelect={(wardName) => setSelectedWardName(wardName)}
          onPanchayatChange={(p) => {
            setSelectedPanchayat(p);
            setSelectedOfficerId(null);
            setSelectedWardName(null);
          }}
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
            {selectedPanchayat ? `${selectedPanchayat} — Ward Performance` : "Officer Zones"}
          </h2>
          <Link
            href="/admin/officers"
            className="text-primary font-bold text-xs sm:text-sm hover:underline flex items-center bg-primary/5 px-3 sm:px-4 py-2 rounded-xl transition-colors hover:bg-primary/10"
          >
            Manage <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {displayOfficers.length === 0 ? (
            <div className="col-span-full text-center text-muted-foreground font-medium py-8 bg-card rounded-xl border border-border/50">
              {selectedPanchayat ? `No officers assigned to ${selectedPanchayat} yet.` : "No officers active in the system."}
            </div>
          ) : (
            displayOfficers.map((officer, idx) => {
              const zoneColor = ZONE_PALETTE[officers.indexOf(officer) % ZONE_PALETTE.length];
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
                      {selectedPanchayat ? `#${idx + 1}` : officer.name.charAt(0)}
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

      {/* ── Panchayat Admins ── */}
      <div className="bg-card rounded-2xl sm:rounded-3xl border border-border/50 shadow-sm p-5 sm:p-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">Panchayat Admins</h2>
              <p className="text-xs text-muted-foreground font-medium">{panchayatAdmins.length} admin{panchayatAdmins.length !== 1 ? "s" : ""} registered</p>
            </div>
          </div>
          <Dialog open={paCreateOpen} onOpenChange={setPaCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5">
                <Plus className="w-4 h-4" /> Add Admin
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-[2rem] p-8 border-border/50 shadow-2xl">
              <DialogHeader className="mb-5">
                <DialogTitle className="text-2xl font-black">New Panchayat Admin</DialogTitle>
              </DialogHeader>
              <Form {...createPaForm}>
                <form onSubmit={createPaForm.handleSubmit((data) => createPaMutation.mutate(data))} className="space-y-4">
                  <FormField control={createPaForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Full Name</FormLabel>
                      <FormControl><Input placeholder="Admin Name" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createPaForm.control} name="panchayatName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Panchayat Area</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger className="bg-muted/50 rounded-xl h-11 border-border/50">
                            <SelectValue placeholder="Select a panchayat…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {panchayatAreaNames.map((name) => (
                            <SelectItem key={name} value={name}>
                              <span className="flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                {name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField control={createPaForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Email</FormLabel>
                        <FormControl><Input type="email" placeholder="admin@panchayat.gov.in" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={createPaForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Password</FormLabel>
                        <FormControl><Input type="text" placeholder="min 6 chars" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                    <Button type="button" variant="ghost" onClick={() => setPaCreateOpen(false)} className="rounded-xl h-11">Cancel</Button>
                    <Button type="submit" className="rounded-xl h-11 font-black px-6 bg-indigo-600 hover:bg-indigo-700" disabled={createPaMutation.isPending}>
                      {createPaMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {panchayatAdmins.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
            <Shield className="w-10 h-10 mb-3 text-muted-foreground/40" />
            <p className="font-bold text-sm">No panchayat admins yet</p>
            <p className="text-xs mt-1">Add your first panchayat admin to delegate management</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {panchayatAdmins.map((pa) => (
              <div key={pa.id} className="flex items-start justify-between gap-3 p-4 bg-muted/30 rounded-2xl border border-border/50 hover:border-indigo-200 transition-colors group">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                      <Shield className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <span className="font-bold text-sm text-foreground truncate">{pa.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate ml-9">{pa.email}</p>
                  {pa.panchayatName && (
                    <p className="text-xs font-semibold text-indigo-600 mt-1 ml-9 truncate flex items-center gap-1">
                      <Building2 className="w-3 h-3 shrink-0" />{pa.panchayatName}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground ml-9 mt-0.5">{pa.officerCount} officer{pa.officerCount !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 -mt-0.5 -mr-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50"
                    onClick={() => openEditPa(pa)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-[2rem] p-8">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-black text-2xl">Remove Admin?</AlertDialogTitle>
                        <AlertDialogDescription className="text-base text-muted-foreground mt-3">
                          This will permanently delete <strong>{pa.name}</strong> ({pa.panchayatName}). Their field officers will remain.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="mt-6 gap-2">
                        <AlertDialogCancel className="rounded-xl font-bold h-11">Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive rounded-xl font-black h-11" onClick={() => deletePaMutation.mutate(pa.id)}>
                          Yes, remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Edit Panchayat Admin dialog ── */}
        <Dialog open={paEditOpen} onOpenChange={(o) => { setPaEditOpen(o); if (!o) setEditingPa(null); }}>
          <DialogContent className="sm:max-w-md rounded-[2rem] p-8 border-border/50 shadow-2xl">
            <DialogHeader className="mb-5">
              <DialogTitle className="text-2xl font-black">Edit Panchayat Admin</DialogTitle>
            </DialogHeader>
            {editingPa && (
              <Form {...editPaForm}>
                <form
                  onSubmit={editPaForm.handleSubmit((data) =>
                    editPaMutation.mutate({ id: editingPa.id, data })
                  )}
                  className="space-y-4"
                >
                  <FormField control={editPaForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Full Name</FormLabel>
                      <FormControl><Input placeholder="Admin Name" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={editPaForm.control} name="panchayatName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Panchayat Area</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger className="bg-muted/50 rounded-xl h-11 border-border/50">
                            <SelectValue placeholder="Select a panchayat…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {panchayatAreaNames.map((name) => (
                            <SelectItem key={name} value={name}>
                              <span className="flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                {name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField control={editPaForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Email</FormLabel>
                        <FormControl><Input type="email" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={editPaForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">New Password</FormLabel>
                        <FormControl><Input type="text" placeholder="leave blank to keep" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                    <Button type="button" variant="ghost" onClick={() => setPaEditOpen(false)} className="rounded-xl h-11">Cancel</Button>
                    <Button type="submit" className="rounded-xl h-11 font-black px-6 bg-indigo-600 hover:bg-indigo-700" disabled={editPaMutation.isPending}>
                      {editPaMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </div>

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

      {/* ── System Settings ── */}
      <div className="mt-5 sm:mt-8 bg-card rounded-2xl sm:rounded-3xl border border-border/50 shadow-sm p-5 sm:p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-black text-foreground">System Settings</h2>
            <p className="text-xs text-muted-foreground font-medium">Control center configuration</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 p-4 bg-muted/40 rounded-2xl border border-border/50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-black text-foreground">Test Mode</p>
                {testModeActive ? (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">ACTIVE</span>
                ) : (
                  <span className="text-[10px] font-bold bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-full">Off</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                When active, all pages show a TEST MODE banner and the report form allows manual map placement for testing outside the service area.
              </p>
            </div>
            <Switch
              checked={testModeActive}
              onCheckedChange={(checked) => setTestModeMutation.mutate(checked)}
              disabled={setTestModeMutation.isPending}
              className="shrink-0"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 bg-muted/40 rounded-2xl border border-border/50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-black text-foreground">Email (SMTP)</p>
                {smtpConfigured === null ? (
                  <span className="text-[10px] font-bold bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-full">Checking…</span>
                ) : smtpConfigured ? (
                  <span className="text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Configured</span>
                ) : (
                  <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">Not configured</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                {smtpConfigured === false
                  ? "SMTP credentials are missing — assignment and welcome emails will not be sent. Set SMTP_USER and SMTP_PASS in Replit Secrets."
                  : "Transactional emails: officer assignments, status updates, password resets."}
              </p>
            </div>
          </div>
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
