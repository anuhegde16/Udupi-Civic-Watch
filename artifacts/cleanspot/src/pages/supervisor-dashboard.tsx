import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { formatWardLabel } from "@/lib/ward-names";
import { useAuth } from "@/hooks/use-auth";
import { getGreeting } from "@/lib/greeting";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useImageLightbox } from "@/components/image-lightbox";
import { compressImage } from "@/lib/compress-image";
import { uploadImageWithProgress, UploadTimeoutError } from "@/lib/upload-with-progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RoleMap, type RoleMapReport } from "@/components/role-map";
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
  Users,
  ChevronRight,
  BarChart2,
  LayoutDashboard,
  TrendingUp,
  Camera,
  Images,
  X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type StatusFilter = "all" | "reported" | "cleaning" | "cleaned";

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

type CleanupPhoto = {
  id: string;
  preview: string;
  url: string;
  uploadedAt: string;
  progress: number;
  error: string | null;
};

const MAX_CLEANUP_PHOTOS = 5;

function useProfile() {
  return useQuery<SupervisorProfile>({
    queryKey: ["supervisor-me"],
    queryFn: () => customFetch("/api/supervisor/me"),
    staleTime: 5 * 60_000,
  });
}

function useReports() {
  return useQuery<{ reports: Report[]; total: number }>({
    queryKey: ["supervisor-reports"],
    queryFn: () => customFetch("/api/supervisor/reports"),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

function useMapReports() {
  return useQuery<{ reports: RoleMapReport[] }>({
    queryKey: ["sv-map-reports"],
    queryFn: () => customFetch("/api/supervisor/map-reports"),
    staleTime: 60_000,
    refetchInterval: 180_000,
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

function PhotoEvidenceSection({
  title,
  emptyLabel,
  photos,
  onOpen,
  complete = false,
}: {
  title: string;
  emptyLabel: string;
  photos: { url: string; uploadedAt?: string }[];
  onOpen: (index: number) => void;
  complete?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/70 bg-muted/30">
        {complete ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Camera className="w-4 h-4 text-muted-foreground" />}
        <h3 className="font-bold text-sm">{title}</h3>
        {photos.length > 0 && <Badge variant="secondary" className="ml-auto text-xs">{photos.length}</Badge>}
      </div>
      {photos.length > 0 ? (
        <div className={`grid gap-1 ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {photos.map((photo, index) => (
            <button
              key={`${photo.url}-${index}`}
              type="button"
              className="aspect-[4/3] bg-muted cursor-zoom-in group relative overflow-hidden"
              onClick={() => onOpen(index)}
              aria-label={`View ${title.toLowerCase()} ${index + 1} full screen`}
            >
              <img
                src={photo.url}
                alt={`${title} ${index + 1}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      )}
    </section>
  );
}

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<"overview" | "analytics">("overview");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [focusedWard, setFocusedWard] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);
  const [cleanupReport, setCleanupReport] = useState<Report | null>(null);
  const [cleanupPhotos, setCleanupPhotos] = useState<CleanupPhoto[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const cleanupFileInputRef = useRef<HTMLInputElement>(null);
  const { lightbox, open: openLightbox } = useImageLightbox();

  useEffect(() => {
    setView(new URLSearchParams(window.location.search).get("view") === "analytics" ? "analytics" : "overview");
  }, []);

  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: reportsData, isLoading: reportsLoading } = useReports();

  const updateStatus = useMutation({
    mutationFn: ({ id, status, cleanupImageUrls }: {
      id: number;
      status: string;
      cleanupImageUrls?: { url: string; uploadedAt?: string }[];
    }) =>
      customFetch(`/api/supervisor/reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(cleanupImageUrls?.length
            ? { cleanupImageUrl: cleanupImageUrls[0].url, cleanupImageUrls }
            : {}),
        }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (updated: Partial<Report> & { id: number; status: string }) => {
      queryClient.invalidateQueries({ queryKey: ["supervisor-reports"] });
      queryClient.invalidateQueries({ queryKey: ["sv-map-reports"] });
      setPreviewReport((current) =>
        current?.id === updated.id ? { ...current, ...updated } : current
      );
      setCleanupReport(null);
      setCleanupPhotos([]);
      toast({ title: "Status updated" });
    },
    onError: (err: any) =>
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" }),
  });

  const startCleanupUpload = (photoId: string, dataUrl: string) => {
    setCleanupPhotos((photos) => photos.map((photo) =>
      photo.id === photoId ? { ...photo, progress: 0, error: null } : photo
    ));
    uploadImageWithProgress(dataUrl, (progress) => {
      setCleanupPhotos((photos) => photos.map((photo) =>
        photo.id === photoId ? { ...photo, progress } : photo
      ));
    }).then((uploaded) => {
      setCleanupPhotos((photos) => photos.map((photo) =>
        photo.id === photoId
          ? { ...photo, url: uploaded.url, uploadedAt: uploaded.uploadedAt, progress: 100, error: null }
          : photo
      ));
    }).catch((error) => {
      const message = error instanceof UploadTimeoutError
        ? error.message
        : error instanceof Error ? error.message : "Upload failed. Please try again.";
      setCleanupPhotos((photos) => photos.map((photo) =>
        photo.id === photoId ? { ...photo, progress: 0, error: message } : photo
      ));
    });
  };

  const addCleanupPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || cleanupPhotos.length >= MAX_CLEANUP_PHOTOS) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      setIsProcessingImage(true);
      const preview = await compressImage(file);
      setCleanupPhotos((photos) => [...photos, {
        id, preview, url: "", uploadedAt: "", progress: 0, error: null,
      }]);
      setIsProcessingImage(false);
      startCleanupUpload(id, preview);
    } catch {
      setIsProcessingImage(false);
      toast({ title: "Could not process image", description: "Please choose another photo and try again.", variant: "destructive" });
    }
  };

  const openCleanupEvidence = (report: Report) => {
    setPreviewReport(null);
    setCleanupPhotos([]);
    setCleanupReport(report);
  };
  const closeCleanupEvidence = () => {
    if (!updateStatus.isPending) {
      setCleanupReport(null);
      setCleanupPhotos([]);
    }
  };
  const submitCleaned = () => {
    const completedPhotos = cleanupPhotos.filter((photo) => photo.url);
    if (completedPhotos.length === 0 || completedPhotos.length !== cleanupPhotos.length) return;
    if (cleanupReport) {
      updateStatus.mutate({
        id: cleanupReport.id,
        status: "cleaned",
        cleanupImageUrls: completedPhotos.map(({ url, uploadedAt }) => ({ url, uploadedAt })),
      });
    }
  };

  const allReports = reportsData?.reports ?? [];

  const stats = useMemo(() => ({
    total: allReports.length,
    reported: allReports.filter((r) => r.status === "reported").length,
    cleaning: allReports.filter((r) => r.status === "cleaning").length,
    cleaned: allReports.filter((r) => r.status === "cleaned").length,
  }), [allReports]);
  const resolutionRate = stats.total > 0 ? Math.round((stats.cleaned / stats.total) * 100) : 0;
  const wardBreakdown = useMemo(() => {
    const byWard = new Map<string, { total: number; open: number; cleaned: number }>();
    allReports.forEach((report) => {
      const ward = report.wardName ?? "Unassigned ward";
      const row = byWard.get(ward) ?? { total: 0, open: 0, cleaned: 0 };
      row.total += 1;
      if (report.status === "cleaned") row.cleaned += 1;
      else row.open += 1;
      byWard.set(ward, row);
    });
    return [...byWard.entries()]
      .map(([ward, values]) => ({ ward, ...values }))
      .sort((a, b) => b.open - a.open || b.total - a.total);
  }, [allReports]);

  const filtered = useMemo(() => {
    let list = statusFilter === "all" ? allReports : allReports.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.address?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || r.wardName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allReports, statusFilter, search]);

  const wardNames: string[] = profile?.ward_names ?? [];
  const isLoading = profileLoading || reportsLoading;

  const { data: mapData } = useMapReports();
  const mapReports = mapData?.reports ?? [];
  const wardGeoNames = useMemo(() => wardNames.map(svWardToGeoName), [wardNames]);
  const previewOriginalPhotos = previewReport
    ? (previewReport.imageUrls?.filter((photo) => photo?.url) ?? []).length
      ? previewReport.imageUrls!.filter((photo) => photo?.url)
      : previewReport.imageUrl ? [{ url: previewReport.imageUrl }] : []
    : [];
  const previewCleanupPhotos = previewReport
    ? (previewReport.cleanupImageUrls?.filter((photo) => photo?.url) ?? []).length
      ? previewReport.cleanupImageUrls!.filter((photo) => photo?.url)
      : previewReport.cleanupImageUrl ? [{ url: previewReport.cleanupImageUrl }] : []
    : [];
  const hasPendingCleanupUploads = isProcessingImage || cleanupPhotos.some((photo) => !photo.url && !photo.error);
  const hasUploadErrors = cleanupPhotos.some((photo) => !!photo.error);
  const openReportFromMap = useCallback((mapReport: RoleMapReport) => {
    const report = allReports.find((item) => item.id === mapReport.id);
    if (report) {
      setPreviewReport(report);
      return;
    }
    toast({
      title: "Report unavailable",
      description: "This report is no longer available in your assigned wards.",
      variant: "destructive",
    });
  }, [allReports, toast]);
  const openReport = useCallback((reportId: number) => {
    setLocation(`/supervisor/report/${reportId}`);
  }, [setLocation]);

  return (
    <div className="w-full pb-10 animate-in fade-in duration-500 space-y-6">
      {lightbox}
      <Dialog open={!!previewReport} onOpenChange={(open) => !open && setPreviewReport(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report #{previewReport?.id}</DialogTitle>
            <DialogDescription>Review the citizen’s complaint photos and update its status when work begins or is complete.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <PhotoEvidenceSection
              title="Complaint photos"
              emptyLabel="No complaint photo was provided."
              photos={previewOriginalPhotos}
              onOpen={(index) => openLightbox(previewOriginalPhotos.map((photo) => photo.url), index)}
            />
            <PhotoEvidenceSection
              title="Cleanup confirmation photos"
              emptyLabel="No cleanup photo has been submitted yet."
              photos={previewCleanupPhotos}
              onOpen={(index) => openLightbox(previewCleanupPhotos.map((photo) => photo.url), index)}
              complete
            />
          </div>
          {previewReport?.status !== "cleaned" && (
            <DialogFooter>
              {previewReport?.status === "reported" && (
                <Button
                  variant="outline"
                  onClick={() => updateStatus.mutate({ id: previewReport.id, status: "cleaning" })}
                  disabled={updateStatus.isPending}
                  className="rounded-xl"
                >
                  {updateStatus.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Wrench className="w-4 h-4 mr-2" /> Mark as In Progress
                </Button>
              )}
              <Button onClick={() => previewReport && openCleanupEvidence(previewReport)} className="rounded-xl">
                <Camera className="w-4 h-4 mr-2" /> Add cleanup evidence
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cleanupReport} onOpenChange={(open) => !open && closeCleanupEvidence()}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm cleanup with photos</DialogTitle>
            <DialogDescription>
              Add at least one photo of the cleaned location before marking report #{cleanupReport?.id} as Cleaned.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={cleanupFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={addCleanupPhoto}
          />
          <div className="space-y-3">
            {cleanupPhotos.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {cleanupPhotos.map((photo) => (
                  <div key={photo.id} className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted border border-border">
                    <img src={photo.preview} alt="Cleanup evidence preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setCleanupPhotos((photos) => photos.filter((item) => item.id !== photo.id))}
                      className="absolute top-2 right-2 rounded-full bg-black/70 text-white p-1"
                      aria-label="Remove cleanup photo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {!photo.url && !photo.error && <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs font-bold px-2 py-1.5">Uploading {photo.progress}%</div>}
                    {photo.error && <div className="absolute inset-x-0 bottom-0 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1.5">{photo.error}</div>}
                  </div>
                ))}
              </div>
            )}
            {cleanupPhotos.length < MAX_CLEANUP_PHOTOS && (
              <Button
                type="button"
                variant="outline"
                className="w-full h-20 border-dashed rounded-xl"
                disabled={isProcessingImage}
                onClick={() => cleanupFileInputRef.current?.click()}
              >
                {isProcessingImage ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Images className="w-5 h-5 mr-2" />}
                Add cleanup photo
              </Button>
            )}
            <p className="text-xs text-muted-foreground font-medium">At least one clear photo is required. You can add up to {MAX_CLEANUP_PHOTOS} photos.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCleanupEvidence} disabled={updateStatus.isPending}>Cancel</Button>
            <Button
              onClick={submitCleaned}
              disabled={cleanupPhotos.length === 0 || hasPendingCleanupUploads || hasUploadErrors || updateStatus.isPending}
            >
              {updateStatus.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Mark as Cleaned
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/5 rounded-bl-[100px] pointer-events-none" />
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{getGreeting(user?.name)}</p>
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-emerald-200">
            <Users className="w-3.5 h-3.5" /> Supervisor
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
            {profileLoading ? "Loading…" : (profile?.name ?? user?.name)}
          </h1>
          {profile?.health_inspector_name && (
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5" />
              Reports to: <span className="font-bold text-foreground">{profile.health_inspector_name}</span>
              {profile.health_inspector_phone && (
                <a href={`tel:${profile.health_inspector_phone}`} className="text-primary hover:underline text-xs ml-1">
                  {profile.health_inspector_phone}
                </a>
              )}
            </p>
          )}

          {/* Ward chips — tap to highlight that ward on the map */}
          {wardNames.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {wardNames.map((w) => {
                const geoName = svWardToGeoName(w);
                const isActive = focusedWard === geoName;
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => {
                      const next = isActive ? null : geoName;
                      setFocusedWard(next);
                      if (next !== null && mapWrapperRef.current) {
                        mapWrapperRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }
                    }}
                    className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${
                      isActive
                        ? "bg-emerald-700 text-white border-emerald-700 shadow-sm"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    {formatWardLabel(w)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Stats strip */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, icon: <LayoutList className="w-5 h-5" />, color: "text-foreground", bg: "bg-muted/60", filter: "all" as StatusFilter },
            { label: "New", value: stats.reported, icon: <AlertCircle className="w-5 h-5" />, color: "text-destructive", bg: "bg-destructive/8", filter: "reported" as StatusFilter },
            { label: "In Progress", value: stats.cleaning, icon: <Wrench className="w-5 h-5" />, color: "text-blue-500", bg: "bg-blue-50", filter: "cleaning" as StatusFilter },
            { label: "Cleaned", value: stats.cleaned, icon: <CheckCircle2 className="w-5 h-5" />, color: "text-primary", bg: "bg-primary/8", filter: "cleaned" as StatusFilter },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setStatusFilter(statusFilter === s.filter ? "all" : s.filter)}
              className={`${statusFilter === s.filter ? "ring-2 ring-offset-1 brightness-95" : ""} ${s.bg} rounded-2xl px-4 py-3 flex items-center gap-3 transition-all cursor-pointer text-left w-full hover:brightness-95`}
            >
              <div className={s.color}>{s.icon}</div>
              <div>
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground font-semibold">{s.label}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 bg-muted/50 p-1 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setView("overview")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === "overview" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <LayoutDashboard className="w-4 h-4" /> Overview
        </button>
        <button
          type="button"
          onClick={() => setView("analytics")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${view === "analytics" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <BarChart2 className="w-4 h-4" /> Analytics
        </button>
      </div>

      {view === "analytics" && (
        <section className="space-y-5" aria-label="Ward analytics">
          <div className="bg-card rounded-3xl border border-border/50 p-6 shadow-sm">
            <p className="text-sm font-bold text-muted-foreground">Your wards · read-only summary</p>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total reports", value: stats.total, icon: <LayoutList className="w-5 h-5" />, color: "text-foreground", bg: "bg-muted/60" },
                { label: "Open backlog", value: stats.reported + stats.cleaning, icon: <AlertCircle className="w-5 h-5" />, color: "text-destructive", bg: "bg-destructive/8" },
                { label: "In progress", value: stats.cleaning, icon: <Wrench className="w-5 h-5" />, color: "text-blue-500", bg: "bg-blue-50" },
                { label: "Resolution rate", value: `${resolutionRate}%`, icon: <TrendingUp className="w-5 h-5" />, color: "text-primary", bg: "bg-primary/8" },
              ].map((item) => (
                <div key={item.label} className={`${item.bg} rounded-2xl px-4 py-3 flex items-center gap-3`}>
                  <div className={item.color}>{item.icon}</div>
                  <div><p className={`text-2xl font-black ${item.color}`}>{item.value}</p><p className="text-xs font-semibold text-muted-foreground">{item.label}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card rounded-3xl border border-border/50 overflow-hidden shadow-sm">
            <div className="p-5 border-b border-border/50"><h2 className="font-black text-lg">Backlog by ward</h2><p className="text-sm text-muted-foreground">Only the wards assigned to you are shown.</p></div>
            {wardBreakdown.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No ward reports are available yet.</p> : (
              <div className="divide-y divide-border/50">
                {wardBreakdown.map((row) => (
                  <div key={row.ward} className="p-4 flex items-center gap-4">
                    <p className="font-bold text-sm min-w-0 flex-1">{formatWardLabel(row.ward)}</p>
                    <span className="text-xs font-bold text-destructive">{row.open} open</span>
                    <span className="text-xs font-bold text-primary">{row.cleaned} cleaned</span>
                    <span className="text-xs text-muted-foreground w-14 text-right">{row.total} total</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Ward coverage map */}
      {view === "overview" && wardGeoNames.length > 0 && (
        <div ref={mapWrapperRef}>
          <RoleMap
            reports={mapReports}
            wardGeoNames={wardGeoNames}
            title="Your Ward Coverage"
            subtitle={`${wardNames.length} ward${wardNames.length !== 1 ? "s" : ""} — tap any pin to see details`}
            height="320px"
            highlightBacklogWards
            focusedWardGeoName={focusedWard ?? undefined}
            onReportClick={openReportFromMap}
          />
        </div>
      )}

      {/* Filters */}
      {view === "overview" && <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by address, description or ward…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl border-border/60 bg-card h-11 text-sm font-medium"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList className="bg-background/50 backdrop-blur-sm border border-border shadow-sm rounded-2xl p-1.5 h-auto grid grid-cols-2 sm:flex sm:flex-nowrap gap-1.5 sm:gap-0 w-full">
            <TabsTrigger value="all" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-2 sm:px-5 font-bold text-xs sm:text-sm sm:flex-1">All ({stats.total})</TabsTrigger>
            <TabsTrigger value="reported" className="rounded-xl data-[state=active]:bg-destructive data-[state=active]:text-white py-2 px-2 sm:px-5 font-bold text-xs sm:text-sm sm:flex-1">New ({stats.reported})</TabsTrigger>
            <TabsTrigger value="cleaning" className="rounded-xl data-[state=active]:bg-blue-500 data-[state=active]:text-white py-2 px-2 sm:px-5 font-bold text-xs sm:text-sm sm:flex-1">Progress ({stats.cleaning})</TabsTrigger>
            <TabsTrigger value="cleaned" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2 px-2 sm:px-5 font-bold text-xs sm:text-sm sm:flex-1">Cleaned ({stats.cleaned})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>}

      {/* Report cards */}
      {view === "overview" && (isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="font-bold text-lg">Loading ward reports…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-20 px-4 text-center shadow-sm">
          <Search className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
          <h3 className="text-xl font-black text-foreground mb-1">No reports found</h3>
          <p className="text-muted-foreground font-medium">
            {search ? `No results for "${search}"` : "All clear in your wards!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((report, i) => {
            const thumb = report.imageUrls?.[0]?.url ?? report.imageUrl;
            return (
              <Card
                key={report.id}
                className="overflow-hidden border-border/50 h-full flex flex-col rounded-3xl animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="aspect-[4/3] w-full bg-muted relative overflow-hidden">
                  {thumb ? (
                    <button
                      type="button"
                      onClick={() => openReport(report.id)}
                      className="absolute inset-0 w-full h-full cursor-pointer"
                      aria-label={`Open report ${report.id}`}
                    >
                      <img src={thumb} alt="Waste report" className="w-full h-full object-cover" />
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
                  {report.wardName && (
                    <div className="absolute bottom-3 left-3">
                      <span className="bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-lg">{formatWardLabel(report.wardName)}</span>
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col bg-card gap-3">
                  <p className="font-bold text-foreground text-sm leading-snug flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}</span>
                  </p>

                  {report.description && (
                    <p className="text-xs text-muted-foreground italic font-medium bg-muted/50 p-2.5 rounded-xl line-clamp-2">"{report.description}"</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 rounded-xl text-xs font-bold"
                    onClick={() => openReport(report.id)}
                  >
                    View report
                  </Button>

                  {report.wasteTypes && report.wasteTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {report.wasteTypes.slice(0, 3).map((wt) => (
                        <span key={wt} className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">{wt}</span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto space-y-2 pt-2 border-t border-border/50">
                    <div className="flex items-center text-xs text-muted-foreground font-bold">
                      <Clock className="w-3.5 h-3.5 mr-1.5" />
                      {format(new Date(report.createdAt), "MMM d, h:mm a")}
                    </div>

                    {/* Status update dropdown */}
                    {report.status !== "cleaned" && (
                      <Select
                        value={report.status}
                        onValueChange={(v) => {
                          if (v === "cleaned") openCleanupEvidence(report);
                          else updateStatus.mutate({ id: report.id, status: v });
                        }}
                      >
                        <SelectTrigger className="h-9 rounded-xl text-xs font-bold border-border/60 bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reported">Mark as New</SelectItem>
                          <SelectItem value="cleaning">Mark as In Progress</SelectItem>
                          <SelectItem value="cleaned">Mark as Cleaned</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}
