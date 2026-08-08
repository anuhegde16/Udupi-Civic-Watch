import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { useImageLightbox } from "@/components/image-lightbox";
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
  imageUrls: { url: string }[] | null;
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

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const { lightbox, open: openLightbox } = useImageLightbox();

  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: reportsData, isLoading: reportsLoading } = useReports();

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      customFetch(`/api/supervisor/reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supervisor-reports"] });
      toast({ title: "Status updated" });
    },
    onError: (err: any) =>
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" }),
  });

  const allReports = reportsData?.reports ?? [];

  const stats = useMemo(() => ({
    total: allReports.length,
    reported: allReports.filter((r) => r.status === "reported").length,
    cleaning: allReports.filter((r) => r.status === "cleaning").length,
    cleaned: allReports.filter((r) => r.status === "cleaned").length,
  }), [allReports]);

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

  return (
    <div className="w-full pb-10 animate-in fade-in duration-500 space-y-6">
      {lightbox}

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

          {/* Ward chips */}
          {wardNames.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {wardNames.map((w) => (
                <span key={w} className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">
                  {w}
                </span>
              ))}
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

      {/* Ward coverage map */}
      {wardGeoNames.length > 0 && (
        <RoleMap
          reports={mapReports}
          wardGeoNames={wardGeoNames}
          title="Your Ward Coverage"
          subtitle={`${wardNames.length} ward${wardNames.length !== 1 ? "s" : ""} — tap any pin to see details`}
          height="320px"
          highlightBacklogWards
        />
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3">
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
      </div>

      {/* Report cards */}
      {isLoading ? (
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
                      onClick={() => {
                        const urls = report.imageUrls?.length ? report.imageUrls.map((p) => p.url) : [thumb!];
                        openLightbox(urls, 0);
                      }}
                      className="absolute inset-0 w-full h-full cursor-zoom-in"
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
                      <span className="bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-lg">{report.wardName}</span>
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
                        onValueChange={(v) => updateStatus.mutate({ id: report.id, status: v })}
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
      )}
    </div>
  );
}
