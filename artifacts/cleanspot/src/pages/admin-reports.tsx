import { useState } from "react";
import { useAdminListReports, useListOfficers, useReassignReport, getAdminListReportsQueryKey, customFetch } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Search, FileWarning, CheckCircle2, HardHat, MapPin, Anchor, Map, Trash2, AlertTriangle, Camera, Globe2, Building2, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
type AdminListReportsStatus = "reported" | "cleaning" | "cleaned";

type Report = {
  id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  createdAt: string;
  imageUrl?: string | null;
  imageUploadedAt?: string | null;
  cleanupImageUrl?: string | null;
  assignedOfficer?: { name: string; areaName?: string | null } | null;
  assignedOfficerId?: number | null;
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
    border: "border-l-amber-500",
    bg: "bg-amber-50/60",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
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

export default function AdminReports() {
  const initialStatus = (new URLSearchParams(window.location.search).get("status") as AdminListReportsStatus | null) ?? "all";
  const [statusFilter, setStatusFilter] = useState<AdminListReportsStatus | "all">(initialStatus as AdminListReportsStatus | "all");
  const [panchayatFilter, setPanchayatFilter] = useState<string>("all");
  const [officerFilter, setOfficerFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");

  const { data: reportsData, isLoading: isLoadingReports } = useAdminListReports({
    status: statusFilter === "all" ? undefined : statusFilter as AdminListReportsStatus,
    officerId: officerFilter === "all" ? undefined : parseInt(officerFilter, 10),
    limit: 100,
  });

  const { data: officersData } = useListOfficers();

  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>("");

  const [mapReport, setMapReport] = useState<Report | null>(null);
  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);

  const reassignMutation = useReassignReport();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/reports/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Report deleted successfully" });
      setDeleteReportId(null);
      queryClient.invalidateQueries({ queryKey: getAdminListReportsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
    },
    onError: (err: any) =>
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

  const handleReassign = () => {
    if (!selectedReportId || !selectedOfficerId) return;
    reassignMutation.mutate(
      { id: selectedReportId, data: { officerId: parseInt(selectedOfficerId, 10) } },
      {
        onSuccess: () => {
          toast({ title: "Report dispatched successfully" });
          setReassignModalOpen(false);
          queryClient.invalidateQueries({ queryKey: getAdminListReportsQueryKey() });
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

  const panchayatOptions = Array.from(
    new Set(officers.map((o) => o.panchayatName).filter(Boolean))
  ) as string[];

  const scopedOfficers = panchayatFilter === "all"
    ? officers
    : officers.filter((o) => o.panchayatName === panchayatFilter);

  const zones = Array.from(
    new Set(scopedOfficers.map((o) => o.areaName).filter(Boolean))
  ) as string[];

  const sortedWards = [...scopedOfficers].sort((a, b) => {
    const rA = a.reportCount > 0 ? (a.reportCount - a.pendingCount) / a.reportCount : 0;
    const rB = b.reportCount > 0 ? (b.reportCount - b.pendingCount) / b.reportCount : 0;
    return rB - rA;
  });

  const WARD_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

  const reports = (() => {
    let r = allReports;
    if (zoneFilter !== "all") r = r.filter((x) => x.assignedOfficer?.areaName === zoneFilter);
    else if (officerFilter === "all" && panchayatFilter !== "all") {
      const ids = new Set(scopedOfficers.map((o) => o.id));
      r = r.filter((x) => x.assignedOfficerId !== null && x.assignedOfficerId !== undefined && ids.has(x.assignedOfficerId));
    }
    return r;
  })();

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-5 sm:mb-8 bg-card rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 bg-primary/5 rounded-bl-[80px] sm:rounded-bl-[120px] pointer-events-none" />
        <h1 className="text-2xl sm:text-4xl font-black text-foreground tracking-tight mb-1 sm:mb-2">All Reports</h1>
        <p className="text-muted-foreground font-medium text-sm sm:text-lg">Manage and dispatch civic waste reports across the coast.</p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl sm:rounded-3xl shadow-sm border border-border/50 p-4 sm:p-6 mb-5 sm:mb-8 flex flex-col gap-4">
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
        </div>
      </div>

      {/* Ward Performance Summary (visible when panchayat is selected) */}
      {panchayatFilter !== "all" && sortedWards.length > 0 && (
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
                        {officer.areaName || officer.name}
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
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-black text-foreground mb-2">No reports matched</h3>
          <p className="text-muted-foreground font-medium max-w-md text-sm">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report, i) => {
            const cfg = STATUS_CONFIG[report.status] ?? STATUS_CONFIG["reported"];
            return (
              <div
                key={report.id}
                className={`bg-card rounded-2xl border border-border/50 border-l-4 ${cfg.border} shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 cursor-pointer hover:shadow-md transition-all`}
                style={{ animationDelay: `${i * 25}ms` }}
                onClick={() => setMapReport(report)}
              >
                <div className="flex gap-0">
                  {/* Photo thumbnail */}
                  <div className="w-24 sm:w-32 shrink-0 relative bg-muted">
                    {report.imageUrl ? (
                      <img src={report.imageUrl} alt="Report" className="w-full h-full object-cover" style={{ minHeight: "100px" }} />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40 min-h-[100px]">
                        <Camera className="w-7 h-7" />
                      </div>
                    )}
                    {/* Status color strip overlay at bottom of thumb */}
                    {report.imageUrl && (
                      <div className={`absolute inset-0 pointer-events-none`} />
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
                        {format(new Date(report.createdAt), "MMM d")}
                      </span>
                    </div>

                    <div className="flex items-start gap-1.5 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-foreground/80 leading-snug line-clamp-2">
                        {report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}
                      </p>
                    </div>

                    {/* Officer row */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      {report.assignedOfficer ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="w-6 h-6 rounded-full bg-secondary/20 text-secondary-foreground flex items-center justify-center font-black text-[10px] shrink-0">
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

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
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
                        className="h-8 text-xs font-bold rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive px-2"
                        onClick={(e) => { e.stopPropagation(); setDeleteReportId(report.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
                      <span className="bg-muted px-1.5 py-0.5 rounded-md">Ward: {mapReport.assignedOfficer.areaName}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Photos side by side if both exist, else full width */}
          {(mapReport?.imageUrl || mapReport?.cleanupImageUrl) && (
            <div className={`px-6 sm:px-8 pb-4 grid gap-3 ${mapReport.imageUrl && mapReport.cleanupImageUrl ? "grid-cols-2" : "grid-cols-1"}`}>
              {mapReport?.imageUrl && (
                <div className="rounded-xl overflow-hidden border border-border/50 relative">
                  <div className="absolute top-2 left-2 z-10">
                    <Badge className="bg-background/80 backdrop-blur-md text-foreground border-border/50 font-bold uppercase tracking-wider text-[10px] px-2 py-1">
                      Photo
                    </Badge>
                  </div>
                  <img src={mapReport.imageUrl} alt="Waste report photo" className="w-full h-40 object-cover" />
                </div>
              )}
              {mapReport?.cleanupImageUrl && (
                <div className="rounded-xl overflow-hidden border border-border/50 relative">
                  <div className="absolute top-2 left-2 z-10">
                    <Badge className="bg-green-500 text-white border-transparent font-bold uppercase tracking-wider text-[10px] px-2 py-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> After
                    </Badge>
                  </div>
                  <img src={mapReport.cleanupImageUrl} alt="Cleanup photo" className="w-full h-40 object-cover" />
                </div>
              )}
            </div>
          )}

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
              {mapReport.imageUrl && (
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold uppercase tracking-wider text-muted-foreground">Photo Uploaded At</span>
                  {mapReport.imageUploadedAt ? (
                    <span className="font-medium text-foreground">{format(new Date(mapReport.imageUploadedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                  ) : (
                    <span className="font-medium text-muted-foreground italic">Not recorded</span>
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

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteReportId !== null} onOpenChange={(open) => { if (!open) setDeleteReportId(null); }}>
        <DialogContent className="sm:max-w-sm rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 border-border/50 shadow-2xl">
          <DialogHeader className="mb-2">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight">Delete Report #{deleteReportId}?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground font-medium py-2 text-sm sm:text-base">
            This will permanently remove the report and all its data. This cannot be undone.
          </p>
          <DialogFooter className="mt-6 gap-3 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setDeleteReportId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl font-bold h-12 px-6"
              onClick={() => deleteReportId && deleteMutation.mutate(deleteReportId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Permanently
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
                      <span className="text-xs text-muted-foreground mt-0.5">{off.areaName || "No specific area"} • {off.pendingCount} pending</span>
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
    </div>
  );
}
