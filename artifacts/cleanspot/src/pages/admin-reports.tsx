import { useState, useEffect, useRef } from "react";
import { formatWardLabel } from "@/lib/ward-names";
import {
  useListOfficers,
  useReassignReport,
  useGetBulkArchivePreview,
  getGetBulkArchivePreviewQueryKey,
  useBulkArchiveReports,
  usePurgeAllArchivedReports,
  usePermanentDeleteReport,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DateRangePicker, dateRangeToParams, type DateRange } from "@/components/date-range-picker";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2, Search, FileWarning, CheckCircle2, HardHat, MapPin, Anchor, Map,
  Trash2, AlertTriangle, Camera, Globe2, Building2, TrendingUp, Archive,
  ArchiveX, Clock, Cpu, Tag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useImageLightbox } from "@/components/image-lightbox";
import { ReportDetailSheet, type ReportDetail } from "@/components/report-detail-sheet";
import { ReportNumberSearch } from "@/components/report-number-search";
import geofencesData from "@/data/geofences.json";
type AdminListReportsStatus = "reported" | "cleaning" | "cleaned";

const GEOFENCE_PANCHAYATS: string[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "district")
  .map((f) => (f.properties as any)?.name ?? "")
  .filter(Boolean);

/** Geographic ward names belonging to a panchayat, e.g. "Udupi Ward 5". */
function geofenceWardsFor(panchayat: string): string[] {
  return geofencesData.features
    .filter(
      (f) =>
        f.geometry.type === "Polygon" &&
        (f.properties as any)?.type === "ward" &&
        (f.properties as any)?.panchayat === panchayat
    )
    .map((f) => (f.properties as any)?.name ?? "")
    .filter(Boolean);
}

type Report = {
  id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  createdAt: string;
  deletedAt?: string | null;
  imageUrl?: string | null;
  imageUploadedAt?: string | null;
  imageUrls?: { url: string; uploadedAt: string }[] | null;
  cleanupImageUrl?: string | null;
  cleanupImageUrls?: { url: string; uploadedAt: string }[] | null;
  reporterEmail?: string | null;
  assignedOfficer?: { name: string; areaName?: string | null } | null;
  assignedOfficerId?: number | null;
  wasteTypes?: string[] | null;
  brandNames?: string[] | null;
  wasteSeverity?: string | null;
  photoAiAnalysedAt?: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; border: string; bg: string; badge: string; icon: typeof FileWarning }> = {
  reported: {
    label: "New Report",
    border: "border-l-red-500",
    bg: "bg-red-50/60",
    badge: "bg-red-100 text-red-700 border-red-200",
    icon: FileWarning,
  },
  cleaning: {
    label: "In Progress",
    border: "border-l-blue-500",
    bg: "bg-blue-50/60",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    icon: HardHat,
  },
  cleaned: {
    label: "Cleaned",
    border: "border-l-green-500",
    bg: "bg-green-50/60",
    badge: "bg-green-100 text-green-700 border-green-200",
    icon: CheckCircle2,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, badge: "bg-muted text-muted-foreground border-border", icon: FileWarning };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border ${cfg.badge}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function ArchivedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border bg-slate-100 text-slate-600 border-slate-200">
      <Archive className="w-3 h-3" />Archived
    </span>
  );
}

const BULK_ARCHIVE_DAY_OPTIONS = [7, 30, 60, 90, 180];

export default function AdminReports() {
  const initialParams = new URLSearchParams(window.location.search);
  const initialStatus = (initialParams.get("status") as AdminListReportsStatus | null) ?? "all";
  const [statusFilter, setStatusFilter] = useState<AdminListReportsStatus | "all">(initialStatus as AdminListReportsStatus | "all");
  // Command Center drill-downs arrive with geographic context; honour it on first load
  // so "local reports" opens scoped to that panchayat/ward instead of the whole district.
  const [panchayatFilter, setPanchayatFilter] = useState<string>(initialParams.get("panchayat") ?? "all");
  const [officerFilter, setOfficerFilter] = useState<string>(initialParams.get("officerId") ?? "all");
  const [zoneFilter, setZoneFilter] = useState<string>(initialParams.get("wardName") ?? "all");
  const [showArchived, setShowArchived] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [bulkArchiveDays, setBulkArchiveDays] = useState(30);
  const [purgeAllOpen, setPurgeAllOpen] = useState(false);
  const [permanentDeleteId, setPermanentDeleteId] = useState<number | null>(null);

  const { from: dateFrom, to: dateTo } = dateRangeToParams(dateRange);
  const { data: reportsData, isLoading: isLoadingReports } = useQuery<{ reports: Report[]; total: number }>({
    queryKey: ["admin-reports", showArchived, statusFilter, officerFilter, panchayatFilter, zoneFilter, dateFrom, dateTo],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: "200" });
      if (showArchived) { qs.set("archived", "true"); }
      else {
        if (statusFilter !== "all") qs.set("status", statusFilter);
        if (officerFilter !== "all") qs.set("officerId", officerFilter);
        if (panchayatFilter !== "all") qs.set("panchayat", panchayatFilter);
        if (zoneFilter !== "all") qs.set("wardName", zoneFilter);
        if (dateFrom) qs.set("from", dateFrom);
        if (dateTo) qs.set("to", dateTo);
      }
      return customFetch(`/api/admin/reports?${qs}`);
    },
    staleTime: 60_000,
    placeholderData: (prev: any) => prev,
  });

  const { data: officersData } = useListOfficers();

  const bulkPreviewParams = { olderThanDays: bulkArchiveDays };
  const { data: bulkPreviewData, isLoading: isPreviewLoading } = useGetBulkArchivePreview(
    bulkPreviewParams,
    { query: { enabled: bulkArchiveOpen, queryKey: getGetBulkArchivePreviewQueryKey(bulkPreviewParams) } }
  );

  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>("");

  const [mapReport, setMapReport] = useState<Report | null>(null);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);
  const [searchFoundReport, setSearchFoundReport] = useState<ReportDetail | null>(null);
  const { lightbox, open: openLightbox } = useImageLightbox();

  const [deepLinkedReportId] = useState<number | null>(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    return id ? parseInt(id, 10) : null;
  });
  const deepLinkedConsumedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedConsumedRef.current || !deepLinkedReportId || !reportsData) return;
    const found = (reportsData.reports as Report[]).find((r) => r.id === deepLinkedReportId);
    if (found) {
      setMapReport(found);
      deepLinkedConsumedRef.current = true;
    }
  }, [deepLinkedReportId, reportsData]);

  const reassignMutation = useReassignReport();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const archiveMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/reports/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Report archived", description: "The report was moved to the archive." });
      setDeleteReportId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
    },
    onError: (err: any) =>
      toast({ title: "Failed to archive", description: err.message, variant: "destructive" }),
  });

  const bulkArchiveMutation = useBulkArchiveReports({
    mutation: {
      onSuccess: (data: any) => {
        toast({ title: `${data.archivedCount} report${data.archivedCount !== 1 ? "s" : ""} archived successfully` });
        setBulkArchiveOpen(false);
        queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
        queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
      },
      onError: (err: any) =>
        toast({ title: "Bulk archive failed", description: err.message, variant: "destructive" }),
    },
  });

  const permanentDeleteMutation = usePermanentDeleteReport({
    mutation: {
      onSuccess: () => {
        toast({ title: "Report permanently deleted" });
        setPermanentDeleteId(null);
        queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      },
      onError: (err: any) =>
        toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
    },
  });

  const purgeAllMutation = usePurgeAllArchivedReports({
    mutation: {
      onSuccess: (data: any) => {
        toast({ title: `${data.deletedCount} archived report${data.deletedCount !== 1 ? "s" : ""} permanently deleted` });
        setPurgeAllOpen(false);
        queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      },
      onError: (err: any) =>
        toast({ title: "Purge failed", description: err.message, variant: "destructive" }),
    },
  });

  const handleReassign = () => {
    if (!selectedReportId || !selectedOfficerId) return;
    reassignMutation.mutate(
      { id: selectedReportId, data: { officerId: parseInt(selectedOfficerId, 10) } },
      {
        onSuccess: () => {
          toast({ title: "Report dispatched successfully" });
          setReassignModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
        },
        onError: (err) => toast({ title: "Failed to dispatch", description: err.message, variant: "destructive" }),
      }
    );
  };

  const osmEmbedUrl = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.012},${lat - 0.009},${lng + 0.012},${lat + 0.009}&layer=mapnik&marker=${lat},${lng}`;

  const osmNavUrl = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/directions?from=&to=${lat}%2C${lng}#map=15/${lat}/${lng}`;

  const allReports = (reportsData?.reports || []) as Report[];
  const officersRaw = officersData?.officers || [];
  const officers = officersRaw as Array<{
    id: number;
    name: string;
    areaName?: string | null;
    panchayatName?: string | null;
    reportCount: number;
    pendingCount: number;
  }>;

  // Panchayats and wards come from the geofence map as well as the legacy officers
  // table, so geographically-managed areas (Udupi) remain selectable even though no
  // field officer rows are attached to them.
  const panchayatOptions = Array.from(
    new Set([...GEOFENCE_PANCHAYATS, ...officers.map((o) => o.panchayatName).filter(Boolean)] as string[])
  ).sort();

  const scopedOfficers = panchayatFilter === "all"
    ? officers
    : officers.filter((o) => o.panchayatName === panchayatFilter);

  const zones = Array.from(
    new Set([
      ...(panchayatFilter === "all" ? [] : geofenceWardsFor(panchayatFilter)),
      ...scopedOfficers.map((o) => o.areaName).filter(Boolean),
    ] as string[])
  );

  const sortedWards = [...scopedOfficers].sort((a, b) => {
    const rA = a.reportCount > 0 ? (a.reportCount - a.pendingCount) / a.reportCount : 0;
    const rB = b.reportCount > 0 ? (b.reportCount - b.pendingCount) / b.reportCount : 0;
    return rB - rA;
  });

  const WARD_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

  const reports = (() => {
    if (showArchived) return allReports;
    // When a panchayat is selected the server has already scoped the result set
    // (geographically for Udupi, by assigned officer otherwise) — re-filtering here
    // by officer ward would wrongly discard geographically-assigned reports.
    if (panchayatFilter !== "all") return allReports;
    let r = allReports;
    if (zoneFilter !== "all") r = r.filter((x) => x.assignedOfficer?.areaName === zoneFilter);
    return r;
  })();

  const archivedTotal = reportsData?.total ?? 0;

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-5 sm:mb-8 bg-card rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 bg-primary/5 rounded-bl-[80px] sm:rounded-bl-[120px] pointer-events-none" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-foreground tracking-tight mb-1 sm:mb-2">All Reports</h1>
            <p className="text-muted-foreground font-medium text-sm sm:text-lg">Manage and dispatch civic waste reports across the coast.</p>
          </div>
          {!showArchived && (
            <Button
              variant="outline"
              className="shrink-0 rounded-xl font-bold h-10 px-4 border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 text-sm"
              onClick={() => setBulkArchiveOpen(true)}
            >
              <Archive className="w-4 h-4 mr-2" />
              Archive Old
            </Button>
          )}
        </div>
      </div>

      {/* Active / Archived toggle */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setShowArchived(false)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            !showArchived
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
              : "bg-card border border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileWarning className="w-4 h-4" /> Active Reports
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            showArchived
              ? "bg-slate-700 text-white shadow-sm"
              : "bg-card border border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Archive className="w-4 h-4" /> Archived
        </button>
      </div>

      {/* Archived view header actions */}
      {showArchived && reports.length > 0 && (
        <div className="mb-5 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
            <Archive className="w-4 h-4" />
            <span>{archivedTotal} archived report{archivedTotal !== 1 ? "s" : ""} — data is preserved</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl font-bold h-9 px-4 text-xs border-destructive/40 text-destructive hover:bg-destructive/5 hover:border-destructive"
            onClick={() => setPurgeAllOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Purge All
          </Button>
        </div>
      )}

      {/* Filters (only for active view) */}
      {!showArchived && (
        <div className="bg-card rounded-2xl sm:rounded-3xl shadow-sm border border-border/50 p-4 sm:p-6 mb-5 sm:mb-8 flex flex-col gap-4">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 flex-wrap">
            {panchayatOptions.length > 0 && (
              <div className="flex-1 min-w-[150px]">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Panchayat
                </label>
                <Select value={panchayatFilter} onValueChange={(v) => { setPanchayatFilter(v); setZoneFilter("all"); setOfficerFilter("all"); }}>
                  <SelectTrigger className={`h-11 rounded-xl focus:ring-primary font-medium ${panchayatFilter !== "all" ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/50 border-border/50 text-foreground"}`}>
                    <Building2 className="w-3.5 h-3.5 mr-1 shrink-0 opacity-70" />
                    <SelectValue placeholder="All Panchayats" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/50 shadow-lg">
                    <SelectItem value="all">All Panchayats</SelectItem>
                    {panchayatOptions.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AdminListReportsStatus | "all")}>
                <SelectTrigger className="bg-muted/50 border-border/50 h-11 rounded-xl focus:ring-primary font-medium text-foreground">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50 shadow-lg">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="reported">New / Reported</SelectItem>
                  <SelectItem value="cleaning">In Progress</SelectItem>
                  <SelectItem value="cleaned">Cleaned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">{panchayatFilter !== "all" ? "Ward" : "Zone / Region"}</label>
              <Select value={zoneFilter} onValueChange={(v) => { setZoneFilter(v); setOfficerFilter("all"); }}>
                <SelectTrigger className="bg-muted/50 border-border/50 h-11 rounded-xl focus:ring-primary font-medium text-foreground">
                  <Globe2 className="w-3.5 h-3.5 text-muted-foreground mr-1 shrink-0" />
                  <SelectValue placeholder={panchayatFilter !== "all" ? "All Wards" : "All Zones"} />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50 shadow-lg">
                  <SelectItem value="all">{panchayatFilter !== "all" ? "All Wards" : "All Zones"}</SelectItem>
                  {zones.map((zone) => (
                    <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Officer</label>
              <Select value={officerFilter} onValueChange={(v) => { setOfficerFilter(v); setZoneFilter("all"); }}>
                <SelectTrigger className="bg-muted/50 border-border/50 h-11 rounded-xl focus:ring-primary font-medium text-foreground">
                  <SelectValue placeholder="All Officers" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border/50 shadow-lg">
                  <SelectItem value="all">All Officers</SelectItem>
                  {scopedOfficers.map((off) => (
                    <SelectItem key={off.id} value={off.id.toString()}>{off.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:self-end bg-primary/5 px-5 py-2.5 rounded-2xl border border-primary/10 flex items-center gap-2">
              <span className="text-2xl sm:text-3xl font-black text-primary">{reports.length}</span>
              <span className="text-primary/70 font-bold uppercase text-xs tracking-wider">Found</span>
            </div>
            <div className="sm:self-end">
              <ReportNumberSearch onFound={setSearchFoundReport} />
            </div>
          </div>
        </div>
      )}

      {/* Ward Performance Summary (active view only) */}
      {!showArchived && panchayatFilter !== "all" && sortedWards.length > 0 && (
        <div className="bg-card rounded-2xl sm:rounded-3xl border border-border/50 shadow-sm p-4 sm:p-6 mb-5 sm:mb-8">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-base sm:text-xl font-black text-foreground">Ward Performance — {panchayatFilter}</h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium mb-5">
            Ranked by completion rate · all-time totals
          </p>
          <div className="space-y-4">
            {sortedWards.map((officer, idx) => {
              const resolved = officer.reportCount - officer.pendingCount;
              const rate = officer.reportCount > 0 ? Math.round((resolved / officer.reportCount) * 100) : 0;
              const color = WARD_COLORS[idx % WARD_COLORS.length];
              return (
                <div key={officer.id} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 text-white"
                    style={{ background: color }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-foreground truncate">
                        {formatWardLabel(officer.areaName) || officer.areaName || officer.name}
                      </span>
                      <span className="text-sm font-black ml-2 shrink-0" style={{ color }}>
                        {rate}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${rate}%`, background: color }}
                      />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] font-semibold text-muted-foreground">
                      <span className="text-red-500">● {officer.pendingCount} open</span>
                      <span className="text-green-600">● {resolved} done</span>
                      <span>/ {officer.reportCount} total</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Report list */}
      {isLoadingReports ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl sm:rounded-[2.5rem] border border-border/50 border-dashed shadow-sm">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="font-bold text-foreground">Loading reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl sm:rounded-[2.5rem] border border-border/50 border-dashed text-center px-4 shadow-sm">
          <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
            {showArchived ? <Archive className="w-8 h-8 text-muted-foreground" /> : <Search className="w-8 h-8 text-muted-foreground" />}
          </div>
          <h3 className="text-xl font-black text-foreground mb-2">
            {showArchived ? "No archived reports" : "No reports matched"}
          </h3>
          <p className="text-muted-foreground font-medium max-w-md text-sm">
            {showArchived ? "Reports archived from the active view will appear here." : "Try adjusting your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report, i) => {
            const isArchived = !!report.deletedAt;
            const cfg = STATUS_CONFIG[report.status] ?? STATUS_CONFIG["reported"];
            return (
              <div
                key={report.id}
                className={`bg-card rounded-2xl border border-border/50 border-l-4 ${isArchived ? "border-l-slate-400" : cfg.border} shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 ${!isArchived ? "cursor-pointer hover:shadow-md" : ""} transition-all`}
                style={{ animationDelay: `${i * 25}ms` }}
                onClick={() => !isArchived && setMapReport(report)}
              >
                <div className="flex gap-0">
                  {/* Photo thumbnail */}
                  <div className={`w-24 sm:w-32 shrink-0 relative bg-muted ${isArchived ? "opacity-60" : ""}`}>
                    {(report.imageUrls?.[0]?.url ?? report.imageUrl) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const urls = report.imageUrls?.length
                            ? report.imageUrls.map((p) => p.url)
                            : [report.imageUrl!];
                          openLightbox(urls, 0);
                        }}
                        className="absolute inset-0 w-full h-full cursor-zoom-in"
                        aria-label="View report photo full screen"
                      >
                        <img
                          src={report.imageUrls?.[0]?.url ?? report.imageUrl!}
                          alt="Report"
                          className="w-full h-full object-cover"
                          style={{ minHeight: "100px" }}
                        />
                      </button>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40 min-h-[100px]">
                        <Camera className="w-7 h-7" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-3 sm:p-4 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-foreground text-sm">#{report.id}</span>
                        {isArchived ? <ArchivedBadge /> : <StatusBadge status={report.status} />}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-medium shrink-0">
                        {format(new Date(report.createdAt), "MMM d, h:mm a")}
                      </span>
                    </div>

                    {isArchived && report.deletedAt && (
                      <div className="flex items-center gap-1 mb-1.5">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-[11px] text-slate-500 font-medium">
                          Archived {format(new Date(report.deletedAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    )}

                    <div className="flex items-start gap-1.5 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-foreground/80 leading-snug line-clamp-2">
                        {report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}
                      </p>
                    </div>

                    {/* Officer row */}
                    {!isArchived && (
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {report.assignedOfficer ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <div className="w-6 h-6 rounded-full bg-secondary/20 text-secondary-foreground flex items-center justify-center font-black text-[10px] shrink-0">
                              {report.assignedOfficer.name.charAt(0)}
                            </div>
                            <span className="text-xs font-bold text-foreground/80">{report.assignedOfficer.name}</span>
                            {report.assignedOfficer.areaName && (
                              <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                                Ward: {formatWardLabel(report.assignedOfficer.areaName)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-black uppercase tracking-wider text-destructive bg-destructive/10 px-2 py-0.5 rounded-md">
                            Unassigned
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {isArchived ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-bold rounded-lg px-3 border-destructive/40 text-destructive hover:bg-destructive/5 hover:border-destructive"
                          onClick={(e) => { e.stopPropagation(); setPermanentDeleteId(report.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Permanently Delete
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs font-bold rounded-lg text-primary hover:bg-primary/10 px-2.5"
                            onClick={(e) => { e.stopPropagation(); setMapReport(report); }}
                          >
                            <Map className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                          <Button
                            variant={report.assignedOfficer ? "outline" : "default"}
                            size="sm"
                            className={`h-8 text-xs font-bold rounded-lg px-2.5 ${!report.assignedOfficer ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20" : "border-border hover:border-primary hover:bg-primary/5 hover:text-primary"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReportId(report.id);
                              setSelectedOfficerId(report.assignedOfficerId?.toString() || "");
                              setReassignModalOpen(true);
                            }}
                          >
                            {report.assignedOfficer ? "Reassign" : "Dispatch"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs font-bold rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground px-2"
                            title="Archive report"
                            onClick={(e) => { e.stopPropagation(); setDeleteReportId(report.id); }}
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Map / Detail Modal */}
      <Dialog open={!!mapReport} onOpenChange={(open) => { if (!open) setMapReport(null); }}>
        <DialogContent className="sm:max-w-2xl rounded-2xl sm:rounded-[2rem] p-0 border-border/50 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-black font-display tracking-tight flex items-center gap-3">
                  Report #{mapReport?.id}
                  {mapReport && <StatusBadge status={mapReport.status} />}
                </DialogTitle>
                {mapReport?.address && (
                  <p className="text-muted-foreground font-medium text-sm mt-0.5">{mapReport.address}</p>
                )}
                {mapReport?.assignedOfficer && (
                  <p className="text-xs font-semibold text-muted-foreground mt-1 flex items-center gap-1.5">
                    <span>{mapReport.assignedOfficer.name}</span>
                    {mapReport.assignedOfficer.areaName && (
                      <span className="bg-muted px-1.5 py-0.5 rounded-md">Ward: {formatWardLabel(mapReport.assignedOfficer.areaName)}</span>
                    )}
                  </p>
                )}
                {mapReport?.createdAt && (
                  <p className="text-xs text-muted-foreground font-medium mt-1 flex items-center gap-1">
                    <Anchor className="w-3 h-3" />
                    Reported: {format(new Date(mapReport.createdAt), "MMM d, h:mm a")}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Photos — prefer imageUrls/cleanupImageUrls arrays, fall back to legacy single fields */}
          {mapReport && (() => {
            const reportPhotos: { url: string; uploadedAt?: string | null }[] =
              (mapReport.imageUrls && mapReport.imageUrls.length > 0)
                ? mapReport.imageUrls
                : mapReport.imageUrl ? [{ url: mapReport.imageUrl, uploadedAt: mapReport.imageUploadedAt }] : [];
            const cleanupPhotos: { url: string; uploadedAt?: string | null }[] =
              (mapReport.cleanupImageUrls && mapReport.cleanupImageUrls.length > 0)
                ? mapReport.cleanupImageUrls
                : mapReport.cleanupImageUrl ? [{ url: mapReport.cleanupImageUrl, uploadedAt: null }] : [];
            const hasPhotos = reportPhotos.length > 0 || cleanupPhotos.length > 0;
            if (!hasPhotos) return null;
            return (
              <div className="px-6 sm:px-8 pb-4 space-y-3">
                {reportPhotos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Report Photo{reportPhotos.length > 1 ? `s (${reportPhotos.length})` : ""}
                    </p>
                    <div className={`grid gap-2 ${reportPhotos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {reportPhotos.map((photo, idx) => (
                        <div key={idx} className="rounded-xl overflow-hidden border border-border/50 relative">
                          <button
                            type="button"
                            onClick={() => openLightbox(reportPhotos.map((p) => p.url), idx)}
                            className="absolute inset-0 w-full h-full cursor-zoom-in z-10"
                            aria-label={`View report photo ${idx + 1} full screen`}
                          />
                          <img src={photo.url} alt={`Report photo ${idx + 1}`} className="w-full h-36 object-cover" />
                          {photo.uploadedAt && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                              <p className="text-white text-[9px] font-medium text-center">
                                {format(new Date(photo.uploadedAt), "MMM d, h:mm a")}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {cleanupPhotos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      Cleanup Photo{cleanupPhotos.length > 1 ? `s (${cleanupPhotos.length})` : ""}
                    </p>
                    <div className={`grid gap-2 ${cleanupPhotos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {cleanupPhotos.map((photo, idx) => (
                        <div key={idx} className="rounded-xl overflow-hidden border border-green-200 relative">
                          <button
                            type="button"
                            onClick={() => openLightbox(cleanupPhotos.map((p) => p.url), idx)}
                            className="absolute inset-0 w-full h-full cursor-zoom-in z-10"
                            aria-label={`View cleanup photo ${idx + 1} full screen`}
                          />
                          <img src={photo.url} alt={`Cleanup photo ${idx + 1}`} className="w-full h-36 object-cover" />
                          {photo.uploadedAt && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                              <p className="text-white text-[9px] font-medium text-center">
                                {format(new Date(photo.uploadedAt), "MMM d, h:mm a")}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="h-[260px] sm:h-[300px] w-full relative">
            {mapReport && (
              <iframe
                key={mapReport.id}
                title="Report Location"
                src={osmEmbedUrl(mapReport.latitude, mapReport.longitude)}
                className="w-full h-full border-0"
                loading="lazy"
              />
            )}
            {mapReport && (
              <div className="absolute bottom-3 left-3 right-3 bg-background/95 backdrop-blur-md rounded-xl border border-border/50 px-3 py-2.5 flex items-center gap-3 shadow-lg">
                <div className="flex flex-col flex-1">
                  <span className="text-xs font-mono font-bold text-foreground">
                    {mapReport.latitude.toFixed(5)}, {mapReport.longitude.toFixed(5)}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">Udupi District, Karnataka</span>
                </div>
              </div>
            )}
          </div>

          {mapReport && (
            <div className="px-6 sm:px-8 py-4 border-t border-border/50 grid grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold uppercase tracking-wider text-muted-foreground">Reported At</span>
                <span className="font-medium text-foreground">{format(new Date(mapReport.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
              </div>
              {(mapReport.imageUrl || (mapReport.imageUrls && mapReport.imageUrls.length > 0)) && (
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold uppercase tracking-wider text-muted-foreground">First Photo At</span>
                  {(() => {
                    const ts = mapReport.imageUploadedAt ?? mapReport.imageUrls?.[0]?.uploadedAt ?? null;
                    return ts ? (
                      <span className="font-medium text-foreground">{format(new Date(ts), "MMM d, yyyy 'at' h:mm a")}</span>
                    ) : (
                      <span className="font-medium text-muted-foreground italic">Not recorded</span>
                    );
                  })()}
                </div>
              )}
              {mapReport.reporterEmail && (
                <div className="flex flex-col gap-0.5 col-span-2">
                  <span className="font-bold uppercase tracking-wider text-muted-foreground">Reporter Email</span>
                  <a
                    href={`mailto:${mapReport.reporterEmail}`}
                    className="font-medium text-primary hover:underline truncate"
                  >
                    {mapReport.reporterEmail}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* AI Waste Analysis */}
          {mapReport && (mapReport.imageUrl || mapReport.imageUrls?.length) && (
            <div className="px-6 sm:px-8 py-4 border-t border-border/50">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                <Cpu className="w-3 h-3" /> AI Photo Analysis
              </p>
              {!mapReport.photoAiAnalysedAt ? (
                <p className="text-xs text-muted-foreground font-medium">Analysis pending — will update shortly after photo is processed.</p>
              ) : (
                <div className="space-y-2">
                  {mapReport.wasteSeverity && (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full ${
                      mapReport.wasteSeverity === "high" ? "bg-destructive/10 text-destructive" :
                      mapReport.wasteSeverity === "medium" ? "bg-amber-50 text-amber-600" :
                      "bg-emerald-50 text-emerald-600"
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {mapReport.wasteSeverity.charAt(0).toUpperCase() + mapReport.wasteSeverity.slice(1)} Severity
                    </span>
                  )}
                  {mapReport.wasteTypes && mapReport.wasteTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {mapReport.wasteTypes.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Tag className="w-2.5 h-2.5" />{t}
                        </span>
                      ))}
                      {mapReport.brandNames?.map((b) => (
                        <span key={b} className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                  {!mapReport.wasteSeverity && !mapReport.wasteTypes?.length && (
                    <p className="text-xs text-muted-foreground font-medium">No waste detected or analysis returned no data.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="px-6 sm:px-8 py-4 sm:py-5 flex flex-col sm:flex-row gap-2 sm:gap-3 border-t border-border/50 bg-muted/20">
            <Button variant="ghost" className="rounded-xl font-bold h-11 order-last sm:order-first" onClick={() => setMapReport(null)}>
              Close
            </Button>
            {mapReport && (
              <a href={osmNavUrl(mapReport.latitude, mapReport.longitude)} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button className="w-full rounded-xl font-bold h-11 bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Map className="w-4 h-4 mr-2" /> Navigate
                </Button>
              </a>
            )}
            {mapReport && (
              <Button
                variant="outline"
                className="rounded-xl font-bold h-11 border-border hover:border-primary hover:bg-primary/5 hover:text-primary"
                onClick={() => {
                  setSelectedReportId(mapReport.id);
                  setSelectedOfficerId(mapReport.assignedOfficerId?.toString() || "");
                  setMapReport(null);
                  setReassignModalOpen(true);
                }}
              >
                <Anchor className="w-4 h-4 mr-2" /> Dispatch
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Modal (single report) */}
      <Dialog open={deleteReportId !== null} onOpenChange={(open) => { if (!open) setDeleteReportId(null); }}>
        <DialogContent className="sm:max-w-sm rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 border-border/50 shadow-2xl">
          <DialogHeader className="mb-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
              <Archive className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight">Archive Report #{deleteReportId}?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground font-medium py-2 text-sm sm:text-base">
            The report will be hidden from all active views but the data is preserved. You can permanently delete it later from the Archived view.
          </p>
          <DialogFooter className="mt-6 gap-3 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setDeleteReportId(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl font-bold h-12 px-6 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => deleteReportId && archiveMutation.mutate(deleteReportId)}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
              Archive Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Modal (archived reports) */}
      <Dialog open={permanentDeleteId !== null} onOpenChange={(open) => { if (!open) setPermanentDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 border-border/50 shadow-2xl">
          <DialogHeader className="mb-2">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight">Permanently Delete Report #{permanentDeleteId}?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground font-medium py-2 text-sm sm:text-base">
            This will erase all data including photos permanently. <strong className="text-foreground">This CANNOT be undone.</strong>
          </p>
          <DialogFooter className="mt-6 gap-3 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setPermanentDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl font-bold h-12 px-6"
              onClick={() => permanentDeleteId && permanentDeleteMutation.mutate({ id: permanentDeleteId })}
              disabled={permanentDeleteMutation.isPending}
            >
              {permanentDeleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge All Archived Modal */}
      <Dialog open={purgeAllOpen} onOpenChange={(open) => { if (!open) setPurgeAllOpen(false); }}>
        <DialogContent className="sm:max-w-sm rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 border-border/50 shadow-2xl">
          <DialogHeader className="mb-2">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight">Purge All {archivedTotal} Archived Reports?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground font-medium py-2 text-sm sm:text-base">
            This will permanently erase all {archivedTotal} archived report{archivedTotal !== 1 ? "s" : ""} including their photos.{" "}
            <strong className="text-foreground">This CANNOT be undone.</strong>
          </p>
          <DialogFooter className="mt-6 gap-3 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setPurgeAllOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl font-bold h-12 px-6"
              onClick={() => purgeAllMutation.mutate()}
              disabled={purgeAllMutation.isPending}
            >
              {purgeAllMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Purge All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Archive Dialog */}
      <Dialog open={bulkArchiveOpen} onOpenChange={(open) => { if (!open) setBulkArchiveOpen(false); }}>
        <DialogContent className="sm:max-w-sm rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 border-border/50 shadow-2xl">
          <DialogHeader className="mb-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
              <Archive className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight">Archive Old Reports</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground font-medium text-sm sm:text-base mb-4">
            Archive all active reports older than a certain age. Reports are preserved — officers won't see them, but you can view them in the Archived tab.
          </p>
          <div className="mb-4">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Older than</label>
            <Select value={bulkArchiveDays.toString()} onValueChange={(v) => setBulkArchiveDays(parseInt(v, 10))}>
              <SelectTrigger className="h-12 rounded-xl font-bold text-foreground bg-muted/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50">
                {BULK_ARCHIVE_DAY_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d.toString()}>{d} days</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2 min-h-[52px] flex items-center">
            {isPreviewLoading ? (
              <div className="flex items-center gap-2 text-amber-700">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">Calculating...</span>
              </div>
            ) : (
              <p className="text-sm font-bold text-amber-800">
                {bulkPreviewData?.count === 0
                  ? "No active reports match this age cutoff."
                  : `This will archive ${bulkPreviewData?.count ?? "?"} report${(bulkPreviewData?.count ?? 0) !== 1 ? "s" : ""} older than ${bulkArchiveDays} days.`}
              </p>
            )}
          </div>
          <DialogFooter className="mt-4 gap-3 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setBulkArchiveOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl font-bold h-12 px-6 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => bulkArchiveMutation.mutate({ data: { olderThanDays: bulkArchiveDays } })}
              disabled={bulkArchiveMutation.isPending || (bulkPreviewData?.count ?? 0) === 0}
            >
              {bulkArchiveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
              Archive {bulkPreviewData?.count ? `${bulkPreviewData.count} ` : ""}Reports
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Modal */}
      <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 border-border/50 shadow-2xl">
          <DialogHeader className="mb-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Anchor className="w-6 h-6" />
            </div>
            <DialogTitle className="text-2xl sm:text-3xl font-black font-display tracking-tight">Dispatch Officer</DialogTitle>
          </DialogHeader>
          <div className="py-5">
            <label className="text-sm font-bold text-foreground mb-3 block">Select Officer for Report #{selectedReportId}</label>
            <Select value={selectedOfficerId} onValueChange={setSelectedOfficerId}>
              <SelectTrigger className="w-full h-14 bg-muted/50 border-border/50 rounded-xl focus:ring-primary text-base font-medium">
                <SelectValue placeholder="Choose an officer..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] rounded-xl border-border/50 shadow-xl">
                {officers.map((off) => (
                  <SelectItem key={off.id} value={off.id.toString()} className="py-3 focus:bg-muted">
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">{off.name}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">{formatWardLabel(off.areaName) || off.areaName || "No specific area"} • {off.pendingCount} pending</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="mt-4 gap-3 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setReassignModalOpen(false)}>Cancel</Button>
            <Button
              className="rounded-xl font-bold h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
              onClick={handleReassign}
              disabled={!selectedOfficerId || reassignMutation.isPending}
            >
              {reassignMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {lightbox}

      {/* Report Number Search result sheet */}
      <ReportDetailSheet
        report={searchFoundReport}
        open={searchFoundReport !== null}
        onClose={() => setSearchFoundReport(null)}
      />
    </div>
  );
}
