import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { getGreeting } from "@/lib/greeting";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useImageLightbox } from "@/components/image-lightbox";
import {
  Loader2,
  Users,
  MapPin,
  FileWarning,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Wrench,
  CheckCircle2,
} from "lucide-react";

type HiProfile = {
  id: number;
  name: string;
  phone: string;
  panchayat_name: string;
  supervisors: {
    id: number;
    name: string;
    phone: string;
    ward_names: string[];
  }[];
};

type SupervisorStat = {
  id: number;
  name: string;
  phone: string;
  wardNames: string[];
  reportedCount: number;
  cleaningCount: number;
  cleanedCount: number;
  totalCount: number;
};

type SupervisorReport = {
  id: number;
  status: string;
  address: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  imageUrls: { url: string }[] | null;
  wasteTypes: string[] | null;
  createdAt: string;
  wardName: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  reported: "bg-destructive/10 text-destructive border-destructive/20",
  cleaning: "bg-blue-50 text-blue-700 border-blue-200",
  cleaned: "bg-primary/10 text-primary border-primary/20",
};
const STATUS_LABEL: Record<string, string> = { reported: "New", cleaning: "In Progress", cleaned: "Cleaned" };

function useProfile() {
  return useQuery<HiProfile>({
    queryKey: ["hi-me"],
    queryFn: () => customFetch("/api/health-inspector/me"),
    staleTime: 5 * 60_000,
  });
}

function useSupervisorStats() {
  return useQuery<{ supervisors: SupervisorStat[] }>({
    queryKey: ["hi-supervisor-stats"],
    queryFn: () => customFetch("/api/health-inspector/supervisor-stats"),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

function useSupervisorReports(supervisorId: number | null) {
  return useQuery<{ reports: SupervisorReport[] }>({
    queryKey: ["hi-sv-reports", supervisorId],
    queryFn: () => customFetch(`/api/health-inspector/supervisor/${supervisorId}/reports`),
    enabled: supervisorId !== null,
    staleTime: 60_000,
  });
}

function SupervisorCard({ sv }: { sv: SupervisorStat }) {
  const [expanded, setExpanded] = useState(false);
  const { lightbox, open: openLightbox } = useImageLightbox();
  const { data: reportsData, isLoading } = useSupervisorReports(expanded ? sv.id : null);

  const wardNames: string[] = Array.isArray(sv.wardNames) ? sv.wardNames : [];

  return (
    <Card className="rounded-3xl border-border/50 overflow-hidden">
      {lightbox}
      <button
        type="button"
        className="w-full text-left p-5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-black text-foreground text-base truncate">{sv.name}</span>
              {sv.phone && (
                <a
                  href={`tel:${sv.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary text-xs font-bold hover:underline shrink-0"
                >
                  {sv.phone}
                </a>
              )}
            </div>
            {wardNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {wardNames.map((w) => (
                  <span key={w} className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    {w}
                  </span>
                ))}
              </div>
            )}
            {/* Count pills */}
            <div className="flex gap-2 flex-wrap">
              <span className="bg-destructive/10 text-destructive text-xs font-bold px-2.5 py-1 rounded-full border border-destructive/20">
                {sv.reportedCount} New
              </span>
              <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200">
                {sv.cleaningCount} In Progress
              </span>
              <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full border border-primary/20">
                {sv.cleanedCount} Cleaned
              </span>
            </div>
          </div>
          <div className="shrink-0 text-muted-foreground mt-1">
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </div>
        </div>
      </button>

      {/* Expanded reports */}
      {expanded && (
        <div className="border-t border-border/50 bg-muted/20 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Loading reports…</span>
            </div>
          ) : !reportsData?.reports.length ? (
            <p className="text-center text-sm text-muted-foreground py-6 font-medium">No active reports in these wards.</p>
          ) : (
            <div className="space-y-3">
              {reportsData.reports.map((r) => {
                const thumb = r.imageUrls?.[0]?.url ?? r.imageUrl;
                return (
                  <div key={r.id} className="bg-card border border-border/50 rounded-2xl p-4 flex gap-3">
                    {thumb ? (
                      <button
                        type="button"
                        onClick={() => {
                          const urls = r.imageUrls?.length ? r.imageUrls.map((p) => p.url) : [thumb!];
                          openLightbox(urls, 0);
                        }}
                        className="w-20 h-20 shrink-0 rounded-xl overflow-hidden cursor-zoom-in"
                      >
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="w-20 h-20 shrink-0 rounded-xl bg-muted flex items-center justify-center">
                        <FileWarning className="w-8 h-8 text-muted-foreground opacity-50" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${STATUS_COLOR[r.status] ?? ""} border text-xs font-black uppercase tracking-wider`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">#{r.id}</span>
                        {r.wardName && (
                          <span className="text-xs text-muted-foreground font-bold">{r.wardName}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground flex items-start gap-1.5 line-clamp-1">
                        <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        {r.address || `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`}
                      </p>
                      {r.wasteTypes && r.wasteTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {r.wasteTypes.slice(0, 3).map((wt) => (
                            <span key={wt} className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">{wt}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {format(new Date(r.createdAt), "MMM d, h:mm a")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function HealthInspectorDashboard() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: statsData, isLoading: statsLoading } = useSupervisorStats();

  const supervisors = statsData?.supervisors ?? [];
  const totals = useMemo(() => ({
    reported: supervisors.reduce((s, sv) => s + sv.reportedCount, 0),
    cleaning: supervisors.reduce((s, sv) => s + sv.cleaningCount, 0),
    cleaned: supervisors.reduce((s, sv) => s + sv.cleanedCount, 0),
  }), [supervisors]);

  return (
    <div className="w-full pb-10 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-violet-500/5 rounded-bl-[100px] pointer-events-none" />
        <p className="text-sm font-medium text-muted-foreground mb-1">{getGreeting(user?.name)}</p>
        <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-violet-200">
          <Users className="w-3.5 h-3.5" /> Health Inspector
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
          {profileLoading ? "Loading…" : (profile?.name ?? user?.name)}
        </h1>
        <p className="text-sm text-muted-foreground font-medium">{profile?.panchayat_name ?? "Udupi"} · {supervisors.length} Supervisor{supervisors.length !== 1 ? "s" : ""}</p>

        {/* Summary stats */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { label: "New Reports", value: totals.reported, icon: <AlertCircle className="w-5 h-5" />, color: "text-destructive", bg: "bg-destructive/8" },
            { label: "In Progress", value: totals.cleaning, icon: <Wrench className="w-5 h-5" />, color: "text-blue-500", bg: "bg-blue-50" },
            { label: "Cleaned", value: totals.cleaned, icon: <CheckCircle2 className="w-5 h-5" />, color: "text-primary", bg: "bg-primary/8" },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-2xl px-4 py-3 flex items-center gap-3`}>
              <div className={s.color}>{s.icon}</div>
              <div>
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground font-semibold">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Supervisor cards */}
      {statsLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="font-bold text-lg">Loading supervisors…</p>
        </div>
      ) : supervisors.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-20 px-4 text-center">
          <Users className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
          <h3 className="text-xl font-black text-foreground mb-1">No supervisors assigned</h3>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-black text-foreground">Your Supervisors</h2>
          {supervisors.map((sv) => (
            <SupervisorCard key={sv.id} sv={sv} />
          ))}
        </div>
      )}
    </div>
  );
}
