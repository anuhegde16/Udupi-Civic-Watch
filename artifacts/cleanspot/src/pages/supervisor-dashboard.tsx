import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { formatWardLabel } from "@/lib/ward-names";
import { useAuth } from "@/hooks/use-auth";
import { getGreeting } from "@/lib/greeting";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useImageLightbox } from "@/components/image-lightbox";
import { UdupiSupervisorZoneMap } from "@/components/udupi-supervisor-zone-map";
import {
  MapPin,
  Clock,
  FileWarning,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wrench,
  LayoutList,
  ArrowUpDown,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker, dateRangeToParams, type DateRange } from "@/components/date-range-picker";

type StatusFilter = "all" | "reported" | "cleaning" | "cleaned";
type WardFilter = "all" | string;

type SupervisorProfile = {
  id: number;
  name: string;
  phone: string;
  panchayat_name: string;
  ward_names: string[];
  health_inspector_name: string | null;
  health_inspector_phone: string | null;
};

type Report = {
  id: number;
  status: string;
  address: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  imageUrls: { url: string; uploadedAt?: string }[] | null;
  cleanupImageUrl: string | null;
  cleanupImageUrls: { url: string; uploadedAt?: string }[] | null;
  wasteTypes: string[] | null;
  wasteSeverity: string | null;
  createdAt: string;
  wardName: string | null;
  officerName: string | null;
};

function useProfile() {
  return useQuery<SupervisorProfile>({
    queryKey: ["supervisor-me"],
    queryFn: () => customFetch("/api/supervisor/me"),
    staleTime: 5 * 60_000,
  });
}

function useReports(dateFrom?: string, dateTo?: string) {
  return useQuery<{ reports: Report[]; total: number }>({
    queryKey: ["supervisor-reports", dateFrom, dateTo],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("from", dateFrom);
      if (dateTo) qs.set("to", dateTo);
      const q = qs.toString();
      return customFetch(`/api/supervisor/reports${q ? `?${q}` : ""}`);
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

/** "Ward N/TownName" → "Udupi Ward N" to match geofences polygon names */
function svWardToGeoName(wn: string): string {
  const m = wn.match(/^Ward (\d+)/);
  return m ? `Udupi Ward ${m[1]}` : wn;
}

const STATUS_COLOR: Record<string, string> = {
  reported: "bg-destructive/10 text-destructive border-destructive/20",
  cleaning: "bg-blue-50 text-blue-700 border-blue-200",
  cleaned: "bg-primary/10 text-primary border-primary/20",
};
const STATUS_LABEL: Record<string, string> = {
  reported: "New",
  cleaning: "In Progress",
  cleaned: "Cleaned",
};

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [wardFilter, setWardFilter] = useState<WardFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "status">("newest");
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const relativeLastRefreshed = useRelativeTime(lastRefreshed);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const { lightbox, open: openLightbox } = useImageLightbox();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  useEffect(() => {
    const online = () => setIsOffline(false);
    const offline = () => setIsOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  const { data: profile, isLoading: profileLoading } = useProfile();
  const { from: dateFrom, to: dateTo } = dateRangeToParams(dateRange);
  const { data: reportsData, isLoading: reportsLoading } = useReports(dateFrom, dateTo);

  const allReports = reportsData?.reports ?? [];

  const stats = useMemo(() => ({
    total: allReports.length,
    reported: allReports.filter((r) => r.status === "reported").length,
    cleaning: allReports.filter((r) => r.status === "cleaning").length,
    cleaned: allReports.filter((r) => r.status === "cleaned").length,
  }), [allReports]);
  const filtered = useMemo(() => {
    let list = statusFilter === "all" ? allReports : allReports.filter((r) => r.status === statusFilter);
    if (wardFilter !== "all") list = list.filter((r) => r.wardName === wardFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.address?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || r.wardName?.toLowerCase().includes(q)
      );
    }
    if (sort === "newest") list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sort === "oldest") list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    else list = [...list].sort((a, b) => ({ reported: 0, cleaning: 1, cleaned: 2 }[a.status] ?? 9) - ({ reported: 0, cleaning: 1, cleaned: 2 }[b.status] ?? 9));
    return list;
  }, [allReports, statusFilter, wardFilter, search, sort]);

  const wardNames: string[] = profile?.ward_names ?? [];
  const isLoading = profileLoading || reportsLoading;

  const wardGeoNames = useMemo(() => wardNames.map(svWardToGeoName), [wardNames]);
  const openReportFromMap = useCallback((report: Report) => setLocation(`/supervisor/report/${report.id}`), [setLocation]);
  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["supervisor-me"] }),
        queryClient.invalidateQueries({ queryKey: ["supervisor-reports"] }),
      ]);
      setLastRefreshed(new Date());
    } finally { setIsRefreshing(false); }
  };
  const progress = stats.total ? Math.round((stats.cleaned / stats.total) * 100) : 0;

  return (
    <div className="w-full pb-10 animate-in fade-in duration-500 space-y-6">
      {lightbox}
      {isOffline && <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 text-sm font-medium"><WifiOff className="w-4 h-4 shrink-0 text-amber-500" />You're offline — showing data from {relativeLastRefreshed}. Move to a better signal area to receive new assignments.</div>}

      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-bl-[100px] pointer-events-none" />
          <div className="flex items-start justify-between gap-4">
            <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{getGreeting(user?.name)}</p>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
            My Zone
          </h1>
          <p className="text-muted-foreground font-medium">{wardNames.length ? `Wards: ${wardNames.map(formatWardLabel).join(", ")} — Udupi Municipality` : "Your assigned areas"}</p>
            </div>
            <button type="button" onClick={refresh} disabled={isRefreshing} title="Refresh data" className="relative z-10 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/60 hover:bg-muted disabled:opacity-50 px-3 py-2 rounded-xl shrink-0"><RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} /><span className="hidden sm:inline">Updated {relativeLastRefreshed}</span></button>
          </div>

        {/* Stats strip */}
        {isLoading ? <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-2xl animate-pulse" />)}</div> : <>
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">{[
            { label: "Total", value: stats.total, icon: <LayoutList className="w-5 h-5" />, color: "text-foreground", bg: "bg-muted/60", activeBg: "bg-muted ring-2 ring-foreground/30", filter: "all" as StatusFilter },
            { label: "New", value: stats.reported, icon: <AlertCircle className="w-5 h-5" />, color: "text-destructive", bg: "bg-destructive/8", activeBg: "bg-destructive/20 ring-2 ring-destructive/40", filter: "reported" as StatusFilter },
            { label: "In Progress", value: stats.cleaning, icon: <Wrench className="w-5 h-5" />, color: "text-blue-500", bg: "bg-blue-50", activeBg: "bg-blue-100 ring-2 ring-blue-400/40", filter: "cleaning" as StatusFilter },
            { label: "Cleaned", value: stats.cleaned, icon: <CheckCircle2 className="w-5 h-5" />, color: "text-primary", bg: "bg-primary/8", activeBg: "bg-primary/20 ring-2 ring-primary/40", filter: "cleaned" as StatusFilter },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setStatusFilter(statusFilter === s.filter ? "all" : s.filter)}
              className={`${statusFilter === s.filter ? s.activeBg : s.bg} rounded-2xl px-4 py-3 flex items-center gap-3 transition-all duration-150 hover:brightness-95 active:scale-95 cursor-pointer text-left w-full`}
            >
              <div className={s.color}>{s.icon}</div>
              <div>
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground font-semibold">{s.label}</div>
              </div>
            </button>
          ))}</div>
          {stats.total > 0 && <div className="mt-4"><div className="flex items-center justify-between mb-1.5"><span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Zone completion</span><span className="text-xs font-black text-primary">{progress}%</span></div><div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${progress}%` }} /></div></div>}
        </>}
      </div>
      {!isLoading && wardGeoNames.length > 0 && <UdupiSupervisorZoneMap reports={allReports} wardGeoNames={wardGeoNames} wardNames={wardNames} onReportClick={openReportFromMap} />}

      {/* Filters */}
      <div className="flex flex-col gap-3"><div className="flex gap-2"><div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by address or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl border-border/60 bg-card h-11 text-sm font-medium"
          /></div>
          <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}><SelectTrigger className="w-[148px] rounded-xl border-border/60 bg-card h-11 text-sm font-bold shrink-0 gap-1.5"><ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Newest first</SelectItem><SelectItem value="oldest">Oldest first</SelectItem><SelectItem value="status">By status</SelectItem></SelectContent></Select>
        </div>

        <DateRangePicker value={dateRange} onChange={setDateRange} />

        {/* Ward filter — only shown for multi-ward supervisors */}
        {wardGeoNames.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWardFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all duration-150 ${wardFilter === "all" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground"}`}
            >
              All wards
            </button>
            {wardGeoNames.map((geoName) => (
              <button
                key={geoName}
                type="button"
                onClick={() => setWardFilter(wardFilter === geoName ? "all" : geoName)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all duration-150 ${wardFilter === geoName ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground"}`}
              >
                {formatWardLabel(geoName)}
              </button>
            ))}
          </div>
        )}

        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList className="bg-background/50 backdrop-blur-sm border border-border shadow-sm rounded-2xl p-1.5 h-auto grid grid-cols-2 sm:flex sm:flex-nowrap gap-1.5 sm:gap-0 w-full">
            <TabsTrigger value="all" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-2 sm:px-5 font-bold text-xs sm:text-sm sm:flex-1">All ({stats.total})</TabsTrigger>
            <TabsTrigger value="reported" className="rounded-xl data-[state=active]:bg-destructive data-[state=active]:text-white py-2 px-2 sm:px-5 font-bold text-xs sm:text-sm sm:flex-1">New ({stats.reported})</TabsTrigger>
            <TabsTrigger value="cleaning" className="rounded-xl data-[state=active]:bg-blue-500 data-[state=active]:text-white py-2 px-2 sm:px-5 font-bold text-xs sm:text-sm sm:flex-1">Progress ({stats.cleaning})</TabsTrigger>
            <TabsTrigger value="cleaned" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2 px-2 sm:px-5 font-bold text-xs sm:text-sm sm:flex-1">Cleaned ({stats.cleaned})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Report cards */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="font-bold text-lg">Loading assigned reports…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-20 px-4 text-center shadow-sm">
          <Search className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
          <h3 className="text-xl font-black text-foreground mb-1">No reports found</h3>
          <p className="text-muted-foreground font-medium">
            {search ? `No results for "${search}"` : statusFilter === "all" ? "Your zone is clear — great work!" : `No ${STATUS_LABEL[statusFilter].toLowerCase()} reports.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((report, i) => {
            const thumb = report.imageUrls?.[0]?.url ?? report.imageUrl;
            return <Link key={report.id} href={`/supervisor/report/${report.id}`}><Card
                className="overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all border-border/50 cursor-pointer h-full flex flex-col group rounded-3xl animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="aspect-[4/3] w-full bg-muted relative overflow-hidden">
                  {thumb ? (
                    <button
                      type="button"
                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); openLightbox((report.imageUrls?.length ? report.imageUrls.map((photo) => photo.url) : [report.imageUrl!]), 0); }}
                      className="absolute inset-0 w-full h-full cursor-zoom-in"
                      aria-label="View report photo full screen"
                    >
                      <img src={thumb} alt="Waste report" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    </button>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <FileWarning className="w-12 h-12 opacity-50" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <Badge className={`${STATUS_COLOR[report.status] ?? ""} border shadow-sm px-2.5 py-1 text-xs font-black uppercase tracking-wider backdrop-blur-md`}>
                      {STATUS_LABEL[report.status] ?? report.status}
                    </Badge>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span className="bg-black/70 backdrop-blur-md text-white text-xs font-black font-mono px-2.5 py-1 rounded-lg shadow-sm">#{report.id}</span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col bg-card">
                  <p className="font-bold text-foreground text-base mb-2 line-clamp-2 leading-snug group-hover:text-primary transition-colors flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}</span>
                  </p>
                  <div className="mt-auto space-y-2">
                    {report.description && <p className="text-xs text-muted-foreground line-clamp-2 italic font-medium bg-muted/50 p-2.5 rounded-xl">"{report.description}"</p>}
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-bold pt-2.5 border-t border-border/50">
                    <div className="flex items-center text-xs text-muted-foreground font-bold">
                      <Clock className="w-3.5 h-3.5 mr-1.5" />
                      {format(new Date(report.createdAt), "MMM d, h:mm a")}
                    </div>
                    {wardGeoNames.length > 1 && report.wardName && (
                      <span className="bg-primary/8 text-primary border border-primary/20 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide shrink-0">
                        {formatWardLabel(report.wardName)}
                      </span>
                    )}
                  </div></div>
                </div></Card></Link>;
          })}
        </div>
      )}
    </div>
  );
}
