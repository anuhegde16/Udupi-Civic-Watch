import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { getGreeting } from "@/lib/greeting";
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
import {
  Loader2,
  Search,
  FileWarning,
  MapPin,
  Clock,
  BookOpen,
  Filter,
  X,
} from "lucide-react";

type Report = {
  id: number;
  status: string;
  address: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  imageUrls: { url: string }[] | null;
  cleanupImageUrl: string | null;
  wasteTypes: string[] | null;
  wasteSeverity: string | null;
  brandNames: string[] | null;
  createdAt: string;
  wardName: string | null;
  panchayatName: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  reported: "bg-destructive/10 text-destructive border-destructive/20",
  cleaning: "bg-blue-50 text-blue-700 border-blue-200",
  cleaned: "bg-primary/10 text-primary border-primary/20",
};
const STATUS_LABEL: Record<string, string> = { reported: "New", cleaning: "In Progress", cleaned: "Cleaned" };

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-green-50 text-green-700 border-green-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
  critical: "bg-red-100 text-red-800 border-red-300",
};

function useReports(ward?: string, status?: string, wasteType?: string) {
  const params = new URLSearchParams();
  if (ward && ward !== "all") params.set("ward", ward);
  if (status && status !== "all") params.set("status", status);
  if (wasteType && wasteType !== "all") params.set("wasteType", wasteType);
  const qs = params.toString();

  return useQuery<{ reports: Report[]; total: number }>({
    queryKey: ["cm-reports", ward, status, wasteType],
    queryFn: () => customFetch(`/api/community-mobiliser/reports${qs ? `?${qs}` : ""}`),
    staleTime: 60_000,
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
  });
}

export default function CommunityMobiliserDashboard() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [wardFilter, setWardFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [wasteTypeFilter, setWasteTypeFilter] = useState("all");
  const { lightbox, open: openLightbox } = useImageLightbox();

  const { data: reportsData, isLoading } = useReports(wardFilter, statusFilter, wasteTypeFilter);
  const allReports = reportsData?.reports ?? [];

  // Derive ward list and waste types dynamically from all loaded reports
  const { wards, wasteTypes } = useMemo(() => {
    // Always re-derive from unfiltered load (no ward/status/wasteType filter applied) or from current data
    const wardSet = new Set<string>();
    const wtSet = new Set<string>();
    allReports.forEach((r) => {
      if (r.wardName) wardSet.add(r.wardName);
      (r.wasteTypes ?? []).forEach((wt) => wtSet.add(wt));
    });
    return { wards: [...wardSet].sort(), wasteTypes: [...wtSet].sort() };
  }, [allReports]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allReports;
    const q = search.toLowerCase();
    return allReports.filter(
      (r) =>
        r.address?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.wardName?.toLowerCase().includes(q) ||
        (r.wasteTypes ?? []).some((wt) => wt.toLowerCase().includes(q))
    );
  }, [allReports, search]);

  const hasFilters = wardFilter !== "all" || statusFilter !== "all" || wasteTypeFilter !== "all" || search.trim();

  return (
    <div className="w-full pb-10 animate-in fade-in duration-500 space-y-6">
      {lightbox}

      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-teal-500/5 rounded-bl-[100px] pointer-events-none" />
        <p className="text-sm font-medium text-muted-foreground mb-1">{getGreeting(user?.name)}</p>
        <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-teal-200">
          <BookOpen className="w-3.5 h-3.5" /> Community Mobiliser — Read Only
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
          {user?.name ?? "Community Mobiliser"}
        </h1>
        <p className="text-sm text-muted-foreground font-medium">
          Browse all waste reports across Udupi — research view, no actions
        </p>
        {!isLoading && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-2xl font-black text-foreground">{filtered.length}</span>
            <span className="text-sm text-muted-foreground font-medium">
              {hasFilters ? "matching reports" : "total reports"}
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-3xl border border-border/50 p-4 space-y-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground mb-1">
          <Filter className="w-4 h-4 text-muted-foreground" />
          Filter reports
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by address, description, or waste type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl border-border/60 bg-muted/30 h-11 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Select value={wardFilter} onValueChange={setWardFilter}>
            <SelectTrigger className="rounded-xl border-border/60 bg-muted/30 h-10 text-sm font-medium">
              <SelectValue placeholder="All wards" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All wards</SelectItem>
              {wards.map((w) => (
                <SelectItem key={w} value={w}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="rounded-xl border-border/60 bg-muted/30 h-10 text-sm font-medium">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="reported">New</SelectItem>
              <SelectItem value="cleaning">In Progress</SelectItem>
              <SelectItem value="cleaned">Cleaned</SelectItem>
            </SelectContent>
          </Select>

          <Select value={wasteTypeFilter} onValueChange={setWasteTypeFilter}>
            <SelectTrigger className="rounded-xl border-border/60 bg-muted/30 h-10 text-sm font-medium">
              <SelectValue placeholder="All waste types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All waste types</SelectItem>
              {wasteTypes.map((wt) => (
                <SelectItem key={wt} value={wt}>{wt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setWardFilter("all");
              setStatusFilter("all");
              setWasteTypeFilter("all");
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-bold transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Clear all filters
          </button>
        )}
      </div>

      {/* Report cards */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="font-bold text-lg">Loading reports…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-20 px-4 text-center shadow-sm">
          <Search className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
          <h3 className="text-xl font-black text-foreground mb-1">No reports match</h3>
          <p className="text-muted-foreground font-medium">
            {hasFilters ? "Try adjusting the filters above." : "No active reports in Udupi right now."}
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
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <div className="aspect-[4/3] w-full bg-muted relative overflow-hidden">
                  {thumb ? (
                    <button
                      type="button"
                      onClick={() => {
                        const urls = report.imageUrls?.length ? report.imageUrls.map((p) => p.url) : [thumb!];
                        openLightbox(urls, 0);
                      }}
                      className="absolute inset-0 w-full h-full cursor-zoom-in"
                    >
                      <img src={thumb} alt="Waste" className="w-full h-full object-cover" />
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
                      <span className="bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-lg">{report.wardName}</span>
                    </div>
                  )}
                  {/* After-photo indicator */}
                  {report.cleanupImageUrl && (
                    <div className="absolute bottom-3 right-3">
                      <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-lg">+ After</span>
                    </div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col bg-card gap-2.5">
                  <p className="font-bold text-foreground text-sm leading-snug flex items-start gap-2 line-clamp-2">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}
                  </p>

                  {report.description && (
                    <p className="text-xs text-muted-foreground italic bg-muted/50 p-2.5 rounded-xl line-clamp-2">"{report.description}"</p>
                  )}

                  {/* AI-detected waste types */}
                  {report.wasteTypes && report.wasteTypes.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">AI detected</p>
                      <div className="flex flex-wrap gap-1">
                        {report.wasteTypes.map((wt) => (
                          <span key={wt} className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">{wt}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Severity */}
                  {report.wasteSeverity && (
                    <div>
                      <span className={`${SEVERITY_COLOR[report.wasteSeverity] ?? "bg-muted text-muted-foreground"} text-xs font-bold px-2 py-0.5 rounded-full border capitalize`}>
                        {report.wasteSeverity} severity
                      </span>
                    </div>
                  )}

                  <div className="mt-auto flex items-center text-xs text-muted-foreground font-bold pt-2 border-t border-border/50">
                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                    {format(new Date(report.createdAt), "MMM d, h:mm a")}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
