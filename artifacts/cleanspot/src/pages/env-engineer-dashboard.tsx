import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { getGreeting } from "@/lib/greeting";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  Users,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Wrench,
} from "lucide-react";

type Supervisor = {
  id: number;
  name: string;
  phone: string;
  wardNames: string[];
  reportedCount: number;
  cleaningCount: number;
  cleanedCount: number;
};

type HealthInspector = {
  id: number;
  name: string;
  phone: string;
  supervisorCount: number;
  reportedCount: number;
  cleaningCount: number;
  cleanedCount: number;
  supervisors: Supervisor[];
};

type EeHierarchy = {
  healthInspectors: HealthInspector[];
};

function useHierarchy() {
  return useQuery<EeHierarchy>({
    queryKey: ["ee-hierarchy"],
    queryFn: () => customFetch("/api/env-engineer/full-hierarchy"),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

function useProfile() {
  return useQuery<{ id: number; name: string; phone: string; panchayat_name: string; healthInspectors: any[] }>({
    queryKey: ["ee-me"],
    queryFn: () => customFetch("/api/env-engineer/me"),
    staleTime: 5 * 60_000,
  });
}

function HiCard({ hi }: { hi: HealthInspector }) {
  const [expanded, setExpanded] = useState(false);
  const wardSet = useMemo(() => {
    const seen = new Set<string>();
    for (const sv of hi.supervisors) {
      const wards: string[] = Array.isArray(sv.wardNames) ? sv.wardNames : [];
      wards.forEach((w) => seen.add(w));
    }
    return [...seen];
  }, [hi.supervisors]);

  return (
    <Card className="rounded-3xl border-border/50 overflow-hidden">
      <button
        type="button"
        className="w-full text-left p-5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-black text-foreground text-base truncate">{hi.name}</span>
              {hi.phone && (
                <a href={`tel:${hi.phone}`} onClick={(e) => e.stopPropagation()} className="text-primary text-xs font-bold hover:underline shrink-0">
                  {hi.phone}
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-3">
              {hi.supervisorCount} supervisor{hi.supervisorCount !== 1 ? "s" : ""} · {wardSet.length} ward{wardSet.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2 flex-wrap">
              <span className="bg-destructive/10 text-destructive text-xs font-bold px-2.5 py-1 rounded-full border border-destructive/20">
                {hi.reportedCount} New
              </span>
              <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200">
                {hi.cleaningCount} In Progress
              </span>
              <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full border border-primary/20">
                {hi.cleanedCount} Cleaned
              </span>
            </div>
          </div>
          <div className="shrink-0 text-muted-foreground mt-1">
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </div>
        </div>
      </button>

      {/* Expanded: supervisor sub-cards */}
      {expanded && hi.supervisors.length > 0 && (
        <div className="border-t border-border/50 bg-muted/20 p-4 space-y-3">
          {hi.supervisors.map((sv) => {
            const svWards: string[] = Array.isArray(sv.wardNames) ? sv.wardNames : [];
            return (
              <div key={sv.id} className="bg-card border border-border/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-foreground text-sm">{sv.name}</span>
                  {sv.phone && (
                    <a href={`tel:${sv.phone}`} className="text-primary text-xs font-bold hover:underline">
                      {sv.phone}
                    </a>
                  )}
                </div>
                {svWards.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {svWards.map((w) => (
                      <span key={w} className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                        {w}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-0.5 rounded-full border border-destructive/20">{sv.reportedCount} New</span>
                  <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full border border-blue-200">{sv.cleaningCount} In Progress</span>
                  <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full border border-primary/20">{sv.cleanedCount} Cleaned</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {expanded && hi.supervisors.length === 0 && (
        <div className="border-t border-border/50 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          No supervisors assigned yet.
        </div>
      )}
    </Card>
  );
}

export default function EnvEngineerDashboard() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: hierarchy, isLoading: hierarchyLoading } = useHierarchy();

  const his = hierarchy?.healthInspectors ?? [];
  const totals = useMemo(() => ({
    reported: his.reduce((s, h) => s + h.reportedCount, 0),
    cleaning: his.reduce((s, h) => s + h.cleaningCount, 0),
    cleaned: his.reduce((s, h) => s + h.cleanedCount, 0),
    supervisors: his.reduce((s, h) => s + h.supervisorCount, 0),
  }), [his]);

  return (
    <div className="w-full pb-10 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-sky-500/5 rounded-bl-[100px] pointer-events-none" />
        <p className="text-sm font-medium text-muted-foreground mb-1">{getGreeting(user?.name)}</p>
        <div className="inline-flex items-center gap-2 bg-sky-50 text-sky-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-sky-200">
          <Users className="w-3.5 h-3.5" /> Environmental Engineer
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
          {profileLoading ? "Loading…" : (profile?.name ?? user?.name)}
        </h1>
        <p className="text-sm text-muted-foreground font-medium">
          {profile?.panchayat_name ?? "Udupi"} · {his.length} Health Inspector{his.length !== 1 ? "s" : ""} · {totals.supervisors} Supervisors
        </p>

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

      {/* HI cards */}
      {hierarchyLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="font-bold text-lg">Loading hierarchy…</p>
        </div>
      ) : his.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-20 px-4 text-center">
          <Users className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
          <h3 className="text-xl font-black text-foreground mb-1">No health inspectors assigned</h3>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-black text-foreground">Health Inspectors</h2>
          {his.map((hi) => (
            <HiCard key={hi.id} hi={hi} />
          ))}
        </div>
      )}
    </div>
  );
}
