import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useUpdateReport } from "@workspace/api-client-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Search, FileWarning, CheckCircle2, HardHat, MapPin, Camera,
  Archive, ChevronLeft, Globe2, Users,
} from "lucide-react";
import { useImageLightbox } from "@/components/image-lightbox";
import { ReportDetailSheet, type ReportDetail } from "@/components/report-detail-sheet";

type PanchayatReportStatus = "reported" | "cleaning" | "cleaned";

type PanchayatReport = {
  id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  createdAt: string;
  imageUrl?: string | null;
  imageUrls?: { url: string; uploadedAt: string }[] | null;
  cleanupImageUrl?: string | null;
  cleanupImageUrls?: { url: string; uploadedAt: string }[] | null;
  reporterEmail?: string | null;
  assignedOfficerId?: number | null;
  assignedOfficer?: { id: number; name: string; email?: string; phone?: string | null; areaName?: string | null } | null;
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

function usePanchayatOfficersList() {
  return useQuery<{ officers: { id: number; name: string; areaName?: string | null }[]; total: number }>({
    queryKey: ["panchayat-officers"],
    queryFn: () => customFetch("/api/panchayat/officers"),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

function usePanchayatReportsFiltered(status: string) {
  return useQuery<{ reports: PanchayatReport[]; total: number }>({
    queryKey: ["panchayat-reports-list", status],
    queryFn: () =>
      customFetch(`/api/panchayat/reports${status !== "all" ? `?status=${status}` : ""}`),
    retry: false,
    staleTime: 30_000,
  });
}

export default function MasterReports() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lightbox, open: openLightbox } = useImageLightbox();

  const initialStatus = (new URLSearchParams(window.location.search).get("status") as PanchayatReportStatus | null) ?? "all";
  const [statusFilter, setStatusFilter] = useState<PanchayatReportStatus | "all">(initialStatus as PanchayatReportStatus | "all");
  const [wardFilter, setWardFilter] = useState<string>("all");
  const [officerFilter, setOfficerFilter] = useState<string>("all");
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);

  const { data: reportsData, isLoading: isLoadingReports } = usePanchayatReportsFiltered(statusFilter);
  const { data: officersData } = usePanchayatOfficersList();
  const updateReport = useUpdateReport();

  const [deepLinkedReportId] = useState<number | null>(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    return id ? parseInt(id, 10) : null;
  });
  const deepLinkedConsumedRef = useRef(false);

  const officers = officersData?.officers ?? [];
  const wardNames = Array.from(new Set(officers.map((o) => o.areaName).filter(Boolean))) as string[];

  const allReports = (reportsData?.reports ?? []) as PanchayatReport[];
  const reports = allReports.filter((r) => {
    if (wardFilter !== "all" && r.assignedOfficer?.areaName !== wardFilter) return false;
    if (officerFilter !== "all" && String(r.assignedOfficerId) !== officerFilter) return false;
    return true;
  });

  function openReport(r: PanchayatReport) {
    setSelectedReport({
      id: r.id,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      status: r.status,
      wardName: r.assignedOfficer?.areaName ?? null,
      officerName: r.assignedOfficer?.name ?? null,
      imageUrl: r.imageUrls?.[0]?.url ?? r.imageUrl ?? null,
      imageUrls: r.imageUrls ?? null,
      cleanupImageUrl: r.cleanupImageUrl ?? null,
      cleanupImageUrls: r.cleanupImageUrls ?? null,
      reporterEmail: r.reporterEmail ?? null,
      createdAt: r.createdAt ?? null,
    });
  }

  useEffect(() => {
    if (deepLinkedConsumedRef.current || !deepLinkedReportId || !reportsData) return;
    const found = allReports.find((r) => r.id === deepLinkedReportId);
    if (found) {
      openReport(found);
      deepLinkedConsumedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedReportId, reportsData]);

  const archiveReportMutation = useMutation({
    mutationFn: (id: number) => customFetch(`/api/panchayat/reports/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      toast({ title: "Report archived", description: "The report was moved to the archive." });
      setSelectedReport((prev) => (prev && prev.id === id ? null : prev));
      queryClient.invalidateQueries({ queryKey: ["panchayat-reports-list"] });
      queryClient.invalidateQueries({ queryKey: ["panchayat-reports-map"] });
      queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] });
      queryClient.invalidateQueries({ queryKey: ["panchayat-officers"] });
    },
    onError: (err: any) =>
      toast({ title: "Failed to archive", description: err.message, variant: "destructive" }),
  });

  async function handleReportStatusChange(reportId: number, newStatus: "cleaning" | "cleaned") {
    await new Promise<void>((resolve, reject) => {
      updateReport.mutate(
        { id: reportId, data: { status: newStatus } },
        {
          onSuccess: (updated) => {
            setSelectedReport((prev) =>
              prev && prev.id === reportId ? { ...prev, status: updated.status } : prev
            );
            queryClient.invalidateQueries({ queryKey: ["panchayat-reports-list"] });
            queryClient.invalidateQueries({ queryKey: ["panchayat-reports-map"] });
            queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] });
            toast({ title: newStatus === "cleaning" ? "Marked as In Progress" : "Marked as Cleaned" });
            resolve();
          },
          onError: (err) => {
            toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
            reject(err);
          },
        }
      );
    });
  }

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-5 sm:mb-8 bg-card rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 bg-indigo-500/5 rounded-bl-[80px] sm:rounded-bl-[120px] pointer-events-none" />
        <Link href="/master/dashboard" className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-muted-foreground hover:text-foreground mb-3 relative z-10">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <h1 className="text-2xl sm:text-4xl font-black text-foreground tracking-tight mb-1 sm:mb-2">All Reports</h1>
        <p className="text-muted-foreground font-medium text-sm sm:text-lg">
          Every report in {user?.panchayatName ?? "your panchayat"}, in one place.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl sm:rounded-3xl shadow-sm border border-border/50 p-4 sm:p-6 mb-5 sm:mb-8 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Status</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PanchayatReportStatus | "all")}>
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
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Ward</label>
            <Select value={wardFilter} onValueChange={(v) => { setWardFilter(v); setOfficerFilter("all"); }}>
              <SelectTrigger className="bg-muted/50 border-border/50 h-11 rounded-xl focus:ring-primary font-medium text-foreground">
                <Globe2 className="w-3.5 h-3.5 text-muted-foreground mr-1 shrink-0" />
                <SelectValue placeholder="All Wards" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50 shadow-lg">
                <SelectItem value="all">All Wards</SelectItem>
                {wardNames.map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Officer</label>
            <Select value={officerFilter} onValueChange={(v) => setOfficerFilter(v)}>
              <SelectTrigger className="bg-muted/50 border-border/50 h-11 rounded-xl focus:ring-primary font-medium text-foreground">
                <Users className="w-3.5 h-3.5 text-muted-foreground mr-1 shrink-0" />
                <SelectValue placeholder="All Officers" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50 shadow-lg">
                <SelectItem value="all">All Officers</SelectItem>
                {officers.map((off) => (
                  <SelectItem key={off.id} value={off.id.toString()}>{off.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:self-end bg-indigo-500/5 px-5 py-2.5 rounded-2xl border border-indigo-500/10 flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-black text-indigo-600">{reports.length}</span>
            <span className="text-indigo-600/70 font-bold uppercase text-xs tracking-wider">Found</span>
          </div>
        </div>
      </div>

      {/* Report list */}
      {isLoadingReports ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl sm:rounded-[2.5rem] border border-border/50 border-dashed shadow-sm">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
          <p className="font-bold text-foreground">Loading reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl sm:rounded-[2.5rem] border border-border/50 border-dashed text-center px-4 shadow-sm">
          <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-black text-foreground mb-2">No reports matched</h3>
          <p className="text-muted-foreground font-medium max-w-md text-sm">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report, i) => {
            const cfg = STATUS_CONFIG[report.status] ?? STATUS_CONFIG["reported"];
            const originalThumb = report.imageUrls?.[0]?.url ?? report.imageUrl ?? null;
            const cleanupThumb = report.cleanupImageUrls?.[0]?.url ?? report.cleanupImageUrl ?? null;
            return (
              <div
                key={report.id}
                className={`bg-card rounded-2xl border border-border/50 border-l-4 ${cfg.border} shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 cursor-pointer hover:shadow-md transition-all`}
                style={{ animationDelay: `${i * 25}ms` }}
                onClick={() => openReport(report)}
              >
                <div className="flex gap-0">
                  {/* Photo thumbnails */}
                  <div className="w-24 sm:w-32 shrink-0 flex flex-col">
                    <div className="relative bg-muted flex-1">
                      {originalThumb ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openLightbox([originalThumb], 0); }}
                          className="absolute inset-0 w-full h-full cursor-zoom-in"
                          aria-label="View report photo full screen"
                        >
                          <img src={originalThumb} alt="Report" className="w-full h-full object-cover" style={{ minHeight: "90px" }} />
                        </button>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40 min-h-[90px]">
                          <Camera className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    {cleanupThumb && (
                      <div className="relative bg-muted h-12 border-t border-border/50">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openLightbox([cleanupThumb], 0); }}
                          className="absolute inset-0 w-full h-full cursor-zoom-in"
                          aria-label="View cleanup photo full screen"
                        >
                          <img src={cleanupThumb} alt="Cleaned up" className="w-full h-full object-cover" />
                        </button>
                        <span className="absolute bottom-0.5 left-0.5 text-[8px] font-black uppercase tracking-wide bg-primary/90 text-primary-foreground px-1 py-0.5 rounded">
                          After
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-3 sm:p-4 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-foreground text-sm">#{report.id}</span>
                        <StatusBadge status={report.status} />
                      </div>
                      <span className="text-[11px] text-muted-foreground font-medium shrink-0">
                        {format(new Date(report.createdAt), "MMM d, h:mm a")}
                      </span>
                    </div>

                    <div className="flex items-start gap-1.5 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-foreground/80 leading-snug line-clamp-2">
                        {report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {report.assignedOfficer ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-700 flex items-center justify-center font-black text-[10px] shrink-0">
                            {report.assignedOfficer.name.charAt(0)}
                          </div>
                          <span className="text-xs font-bold text-foreground/80">{report.assignedOfficer.name}</span>
                          {report.assignedOfficer.areaName && (
                            <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                              Ward: {report.assignedOfficer.areaName}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] font-black uppercase tracking-wider text-destructive bg-destructive/10 px-2 py-0.5 rounded-md">
                          Unassigned
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mt-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-bold rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground px-2"
                        title="Archive report"
                        onClick={(e) => { e.stopPropagation(); archiveReportMutation.mutate(report.id); }}
                      >
                        <Archive className="w-3.5 h-3.5 mr-1.5" /> Archive
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReportDetailSheet
        report={selectedReport}
        open={selectedReport !== null}
        onClose={() => setSelectedReport(null)}
        onStatusChange={handleReportStatusChange}
        isUpdating={updateReport.isPending}
        onArchive={(id: number) => archiveReportMutation.mutate(id)}
        isArchiving={archiveReportMutation.isPending}
      />

      {lightbox}
    </div>
  );
}
