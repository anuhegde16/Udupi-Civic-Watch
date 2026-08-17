import { useState, useMemo } from "react";
import { DateRangePicker, dateRangeToParams, type DateRange } from "@/components/date-range-picker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatWardLabel, formatWardChartLabel } from "@/lib/ward-names";
import { StatusDrilldownSheet, type DrilldownReport } from "@/components/status-drilldown-sheet";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { getGreeting } from "@/lib/greeting";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { RoleMap, type RoleMapReport, type WardGroup } from "@/components/role-map";
import {
  Loader2,
  Users,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Wrench,
  Building2,
  Pencil,
  TrendingUp,
  BarChart2,
  LayoutDashboard,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

type Supervisor = {
  id: number;
  name: string;
  phone: string;
  wardNames: string[];
  reportedCount: number;
  cleaningCount: number;
  cleanedCount: number;
  totalCount: number;
};

type HealthInspector = {
  id: number;
  name: string;
  phone: string;
  supervisorCount: number;
  reportedCount: number;
  cleaningCount: number;
  cleanedCount: number;
  totalCount: number;
  supervisors: Supervisor[];
};

type EnvironmentalEngineer = {
  id: number;
  name: string;
  phone: string;
  hiCount: number;
  healthInspectors: HealthInspector[];
};

type CommissionerHierarchy = {
  environmentalEngineer: EnvironmentalEngineer | null;
};

type CommissionerProfile = {
  id: number;
  name: string;
  role: string;
  panchayatName: string;
  environmentalEngineer: { id: number; name: string; phone: string; health_inspector_count: number } | null;
};

// ── Queries ──────────────────────────────────────────────────────────────────

function useProfile() {
  return useQuery<CommissionerProfile>({
    queryKey: ["commissioner-me"],
    queryFn: () => customFetch("/api/commissioner/me"),
    staleTime: 5 * 60_000,
  });
}

function useHierarchy(dateFrom?: string, dateTo?: string) {
  return useQuery<CommissionerHierarchy>({
    queryKey: ["commissioner-hierarchy", dateFrom, dateTo],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("from", dateFrom);
      if (dateTo) qs.set("to", dateTo);
      const q = qs.toString();
      return customFetch(`/api/commissioner/hierarchy${q ? `?${q}` : ""}`);
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

function useMapReports(dateFrom?: string, dateTo?: string) {
  return useQuery<{ reports: RoleMapReport[] }>({
    queryKey: ["commissioner-map-reports", dateFrom, dateTo],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("from", dateFrom);
      if (dateTo) qs.set("to", dateTo);
      const q = qs.toString();
      return customFetch(`/api/commissioner/map-reports${q ? `?${q}` : ""}`);
    },
    staleTime: 60_000,
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
  });
}

/** "Ward N/TownName" → "Udupi Ward N" */
function svWardToGeoName(wn: string): string {
  const m = wn.match(/^Ward (\d+)/);
  return m ? `Udupi Ward ${m[1]}` : wn;
}

// ── Edit credentials modal ────────────────────────────────────────────────────

type EditTarget = {
  id: number;
  name: string;
  phone: string;
  kind: "ee" | "hi" | "supervisor";
};

function EditCredentialsModal({
  target,
  onClose,
}: {
  target: EditTarget;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(target.name);
  const [phone, setPhone] = useState(target.phone);
  const [password, setPassword] = useState("");

  const endpointMap: Record<EditTarget["kind"], string> = {
    ee: `/api/commissioner/env-engineer/${target.id}/credentials`,
    hi: `/api/commissioner/health-inspector/${target.id}/credentials`,
    supervisor: `/api/commissioner/supervisor/${target.id}/credentials`,
  };
  const endpoint = endpointMap[target.kind];

  const mutation = useMutation({
    mutationFn: () =>
      customFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          password: password.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Credentials updated" });
      qc.invalidateQueries({ queryKey: ["commissioner-hierarchy"] });
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Failed to update credentials";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit credentials</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cm-ec-name">Name</Label>
            <Input
              id="cm-ec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-ec-phone">Phone</Label>
            <Input
              id="cm-ec-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-ec-password">
              New password{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="cm-ec-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              (!name.trim() && !phone.trim() && !password.trim())
            }
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Resolution rate pill ──────────────────────────────────────────────────────

function ResolutionPill({ cleaned, total, size = "md" }: { cleaned: number; total: number; size?: "sm" | "md" }) {
  const rate = total > 0 ? Math.round((cleaned / total) * 100) : 0;
  const base = size === "sm"
    ? "px-2 py-0.5 text-xs"
    : "px-2.5 py-1 text-xs";
  return (
    <span className={`bg-emerald-50 text-emerald-700 font-bold rounded-full border border-emerald-200 flex items-center gap-1 ${base}`}>
      <TrendingUp className="w-3 h-3" />
      {rate}%
    </span>
  );
}

// ── Edit icon button ──────────────────────────────────────────────────────────

function EditBtn({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
      aria-label="Edit credentials"
    >
      <Pencil className="w-3.5 h-3.5" />
    </button>
  );
}

// ── Supervisor sub-card ───────────────────────────────────────────────────────

function SupervisorRow({
  sv,
  onEdit,
}: {
  sv: Supervisor;
  onEdit: (t: EditTarget) => void;
}) {
  const wardNames: string[] = Array.isArray(sv.wardNames) ? sv.wardNames : [];
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="font-bold text-foreground text-sm">{sv.name}</span>
        {sv.phone && (
          <a href={`tel:${sv.phone}`} className="text-indigo-600 text-xs font-bold hover:underline">
            {sv.phone}
          </a>
        )}
        <EditBtn
          onClick={(e) => {
            e.stopPropagation();
            onEdit({ id: sv.id, name: sv.name, phone: sv.phone, kind: "supervisor" });
          }}
        />
      </div>
      {wardNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {wardNames.map((w) => (
            <span
              key={w}
              className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full"
            >
              {formatWardLabel(w)}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-0.5 rounded-full border border-destructive/20">
          {sv.reportedCount} New
        </span>
        <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full border border-blue-200">
          {sv.cleaningCount} In Progress
        </span>
        <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full border border-primary/20">
          {sv.cleanedCount} Cleaned
        </span>
        <ResolutionPill cleaned={sv.cleanedCount} total={sv.totalCount} size="sm" />
      </div>
    </div>
  );
}

// ── Health Inspector card (expandable to supervisors) ─────────────────────────

function HiCard({
  hi,
  onEdit,
  dateFrom,
  dateTo,
}: {
  hi: HealthInspector;
  onEdit: (t: EditTarget) => void;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // HI-level pill drill (badges on the HI card header)
  const [pillDrill, setPillDrill] = useState<string | null>(null);
  const { data: drillData, isLoading: drillLoading } = useQuery<{ reports: DrilldownReport[]; total: number }>({
    queryKey: ["comm-hi-pill-drill", hi.id, pillDrill, dateFrom, dateTo],
    queryFn: () => {
      const qs = new URLSearchParams({ hiId: String(hi.id) });
      if (pillDrill) qs.set("status", pillDrill);
      if (dateFrom) qs.set("from", dateFrom);
      if (dateTo) qs.set("to", dateTo);
      return customFetch(`/api/commissioner/reports?${qs}`);
    },
    enabled: pillDrill !== null,
    staleTime: 60_000,
  });
  const drillReports = drillData?.reports ?? [];
  const drillTitle =
    pillDrill === "reported" ? `${hi.name} · New` :
    pillDrill === "cleaning" ? `${hi.name} · In Progress` :
    pillDrill === "cleaned"  ? `${hi.name} · Cleaned` : "";

  const wardCount = useMemo(() => {
    const seen = new Set<string>();
    for (const sv of hi.supervisors) {
      const wards: string[] = Array.isArray(sv.wardNames) ? sv.wardNames : [];
      wards.forEach((w) => seen.add(w));
    }
    return seen.size;
  }, [hi.supervisors]);

  return (
    <>
    <StatusDrilldownSheet
      open={pillDrill !== null}
      onClose={() => setPillDrill(null)}
      title={drillTitle}
      reports={drillReports}
      isLoading={drillLoading}
    />
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
      <button
        type="button"
        className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-bold text-foreground text-sm truncate">{hi.name}</span>
              {hi.phone && (
                <a
                  href={`tel:${hi.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-indigo-600 text-xs font-bold hover:underline shrink-0"
                >
                  {hi.phone}
                </a>
              )}
              <EditBtn
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit({ id: hi.id, name: hi.name, phone: hi.phone, kind: "hi" });
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-2">
              {hi.supervisorCount} field officer{hi.supervisorCount !== 1 ? "s" : ""} · {wardCount} ward{wardCount !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2 flex-wrap">
              {[
                { status: "reported", label: `${hi.reportedCount} New`,        cls: "bg-destructive/10 text-destructive border-destructive/20" },
                { status: "cleaning", label: `${hi.cleaningCount} In Progress`, cls: "bg-blue-50 text-blue-700 border-blue-200" },
                { status: "cleaned",  label: `${hi.cleanedCount} Cleaned`,     cls: "bg-primary/10 text-primary border-primary/20" },
              ].map((p) => (
                <button
                  key={p.status}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPillDrill(pillDrill === p.status ? null : p.status); }}
                  className={`${p.cls} ${pillDrill === p.status ? "ring-2 ring-offset-1 brightness-95" : ""} text-xs font-bold px-2 py-0.5 rounded-full border transition-all hover:brightness-95`}
                >
                  {p.label}
                </button>
              ))}
              <ResolutionPill cleaned={hi.cleanedCount} total={hi.totalCount} size="sm" />
            </div>
          </div>
          <div className="shrink-0 text-muted-foreground mt-1">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 bg-muted/10 p-3 space-y-2">
          {hi.supervisors.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-3">No field officers assigned.</p>
          ) : (
            hi.supervisors.map((sv) => (
              <SupervisorRow key={sv.id} sv={sv} onEdit={onEdit} />
            ))
          )}
        </div>
      )}
    </div>
    </>
  );
}

// ── Environmental Engineer card (expandable to HI cards) ──────────────────────

function EeCard({ ee, dateFrom, dateTo }: { ee: EnvironmentalEngineer; dateFrom?: string; dateTo?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const totals = useMemo(() => {
    const reported = ee.healthInspectors.reduce((s, h) => s + h.reportedCount, 0);
    const cleaning = ee.healthInspectors.reduce((s, h) => s + h.cleaningCount, 0);
    const cleaned = ee.healthInspectors.reduce((s, h) => s + h.cleanedCount, 0);
    const total = ee.healthInspectors.reduce((s, h) => s + h.totalCount, 0);
    return { reported, cleaning, cleaned, total };
  }, [ee.healthInspectors]);

  return (
    <>
      {editing && (
        <EditCredentialsModal target={editing} onClose={() => setEditing(null)} />
      )}

      <Card className="rounded-3xl border-border/50 overflow-hidden">
        <button
          type="button"
          className="w-full text-left p-5 hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Name + phone + edit */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-black text-foreground text-base truncate">{ee.name}</span>
                {ee.phone && (
                  <a
                    href={`tel:${ee.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-indigo-600 text-xs font-bold hover:underline shrink-0"
                  >
                    {ee.phone}
                  </a>
                )}
                <EditBtn
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing({ id: ee.id, name: ee.name, phone: ee.phone, kind: "ee" });
                  }}
                />
              </div>

              <p className="text-xs text-muted-foreground font-medium mb-3">
                Environmental Engineer · {ee.hiCount} Health Inspector{ee.hiCount !== 1 ? "s" : ""}
              </p>

              <div className="flex gap-2 flex-wrap">
                <span className="bg-destructive/10 text-destructive text-xs font-bold px-2.5 py-1 rounded-full border border-destructive/20">
                  {totals.reported} New
                </span>
                <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200">
                  {totals.cleaning} In Progress
                </span>
                <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full border border-primary/20">
                  {totals.cleaned} Cleaned
                </span>
                <ResolutionPill cleaned={totals.cleaned} total={totals.total} />
              </div>
            </div>

            <div className="shrink-0 text-muted-foreground mt-1">
              {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </div>
          </div>
        </button>

        {expanded && ee.healthInspectors.length > 0 && (
          <div className="border-t border-border/50 bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-3">
              Health Inspectors
            </p>
            {ee.healthInspectors.map((hi) => (
              <HiCard key={hi.id} hi={hi} onEdit={(t) => setEditing(t)} dateFrom={dateFrom} dateTo={dateTo} />
            ))}
          </div>
        )}
        {expanded && ee.healthInspectors.length === 0 && (
          <div className="border-t border-border/50 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            No health inspectors assigned yet.
          </div>
        )}
      </Card>
    </>
  );
}

// ── Analytics ──────────────────────────────────────────────────────────────────

type PerfRow = {
  name: string; open: number; cleaning: number; cleaned: number;
  total: number; rate: number; avgCleanupHours: number; supervisorCount?: number;
};
type TrendRow = { date: string; reported: number; cleaning: number; cleaned: number };
type BacklogRow = { wardName: string; open: number };
type CommissionerAnalytics = {
  kpis: {
    open: number; cleaning: number; resolvedThisMonth: number; totalCleaned: number;
    total: number; avgCleanupHours: number; resolutionRate: number;
    openToday: number; cleanedToday: number;
  };
  sla: { reportedToCleaning: number; cleaningToCleaned: number };
  dailyTrend: TrendRow[];
  wardBacklog: BacklogRow[];
  hiLeaderboard: PerfRow[];
  supervisorPerformance: PerfRow[];
};

function useCommissionerAnalytics() {
  return useQuery<CommissionerAnalytics>({
    queryKey: ["commissioner-analytics"],
    queryFn: () => customFetch("/api/commissioner/analytics"),
    staleTime: 3 * 60_000,
  });
}

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtHours(h: number) {
  if (!h) return "–";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round(h / 24)}d`;
}

type SortCol = "name" | "open" | "cleaned" | "rate" | "avgCleanupHours";

function CommissionerAnalyticsPanel({ onWardClick }: { onWardClick?: (wardGeoName: string) => void }) {
  const { data, isLoading } = useCommissionerAnalytics();
  const [sortCol, setSortCol] = useState<SortCol>("rate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
      <p className="font-bold">Loading analytics…</p>
    </div>
  );
  if (!data) return null;

  const { kpis, sla, dailyTrend, wardBacklog, hiLeaderboard } = data;

  const sortedHIs = [...(hiLeaderboard ?? [])].sort((a, b) => {
    const av: string | number = a[sortCol] ?? 0;
    const bv: string | number = b[sortCol] ?? 0;
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const SortBtn = ({ col, label }: { col: SortCol; label: string }) => (
    <button type="button" onClick={() => toggleSort(col)}
      className="flex items-center gap-0.5 font-black text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
      {label}{sortCol === col && <span className="text-primary ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-destructive/8 rounded-2xl px-4 py-3">
          <div className="text-2xl font-black text-destructive">{kpis.open}</div>
          <div className="text-xs text-muted-foreground font-semibold mt-0.5">Open Reports</div>
          {(kpis.openToday ?? 0) > 0 && <div className="text-xs text-destructive font-bold mt-1">+{kpis.openToday} today</div>}
        </div>
        <div className="bg-primary/8 rounded-2xl px-4 py-3">
          <div className="text-2xl font-black text-primary">{kpis.totalCleaned}</div>
          <div className="text-xs text-muted-foreground font-semibold mt-0.5">Total Cleaned</div>
          {(kpis.cleanedToday ?? 0) > 0 && <div className="text-xs text-primary font-bold mt-1">+{kpis.cleanedToday} today</div>}
        </div>
        <div className="bg-emerald-50 rounded-2xl px-4 py-3">
          <div className="text-2xl font-black text-emerald-600">{kpis.resolutionRate}%</div>
          <div className="text-xs text-muted-foreground font-semibold mt-0.5">Resolution Rate</div>
        </div>
        <div className="bg-amber-50 rounded-2xl px-4 py-3">
          <div className="text-2xl font-black text-amber-600">{fmtHours(kpis.avgCleanupHours)}</div>
          <div className="text-xs text-muted-foreground font-semibold mt-0.5">Avg. Cleanup Time</div>
        </div>
      </div>

      {/* Avg. response time — two phases */}
      {((sla?.reportedToCleaning ?? 0) > 0 || (sla?.cleaningToCleaned ?? 0) > 0) && (
        <div className="bg-card border border-border/50 rounded-3xl p-5">
          <h3 className="text-sm font-black text-foreground mb-0.5">Avg. Response Time</h3>
          <p className="text-xs text-muted-foreground mb-4">How long each stage takes on average</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-orange-50 rounded-2xl px-4 py-3 border border-orange-100">
              <div className="text-xl font-black text-orange-600">{fmtHours(sla?.reportedToCleaning ?? 0)}</div>
              <div className="text-xs font-semibold text-muted-foreground mt-0.5">Reported → In Progress</div>
            </div>
            <div className="bg-sky-50 rounded-2xl px-4 py-3 border border-sky-100">
              <div className="text-xl font-black text-sky-600">{fmtHours(sla?.cleaningToCleaned ?? 0)}</div>
              <div className="text-xs font-semibold text-muted-foreground mt-0.5">In Progress → Cleaned</div>
            </div>
          </div>
        </div>
      )}

      {/* 30-day trend — 3 lines */}
      {dailyTrend.length > 0 && (
        <div className="bg-card border border-border/50 rounded-3xl p-5">
          <h3 className="text-sm font-black text-foreground mb-0.5">30-Day Activity</h3>
          <p className="text-xs text-muted-foreground mb-3">Daily report flow across all stages</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fontSize: 10 }} interval={6} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip labelFormatter={(l: string) => fmtDateShort(l)} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
              <Line type="monotone" dataKey="reported" stroke="#ef4444" strokeWidth={2} dot={false} name="New Reports" />
              <Line type="monotone" dataKey="cleaning" stroke="#3b82f6" strokeWidth={2} dot={false} name="Started Cleaning" />
              <Line type="monotone" dataKey="cleaned"  stroke="#22c55e" strokeWidth={2} dot={false} name="Cleaned" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ward backlog — clickable bars */}
      {wardBacklog.length > 0 && (
        <div className="bg-card border border-border/50 rounded-3xl p-5">
          <h3 className="text-sm font-black text-foreground mb-0.5">Ward Backlog</h3>
          <p className="text-xs text-muted-foreground mb-4">Open reports per ward · tap a bar to view them</p>
          <ResponsiveContainer width="100%" height={Math.max(140, wardBacklog.length * 26)}>
            <BarChart
              layout="vertical"
              data={wardBacklog}
              margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
              onClick={(chartData) => {
                const payload = chartData?.activePayload?.[0]?.payload as BacklogRow | undefined;
                if (payload?.wardName) onWardClick?.(payload.wardName.replace("W", "Udupi Ward "));
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="wardName" tick={{ fontSize: 10 }} width={110} tickFormatter={formatWardChartLabel} />
              <Tooltip formatter={(value) => [value, "Open Reports"]} labelFormatter={formatWardChartLabel} />
              <Bar dataKey="open" name="Open Reports" fill="#ef4444" radius={[0, 4, 4, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* HI leaderboard table — sortable */}
      {sortedHIs.length > 0 && (
        <div className="bg-card border border-border/50 rounded-3xl p-5">
          <h3 className="text-sm font-black text-foreground mb-0.5">Health Inspector Leaderboard</h3>
          <p className="text-xs text-muted-foreground mb-4">Tap column headers to sort · red row = rate below 50%</p>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[420px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left pb-2 pr-3"><SortBtn col="name" label="Inspector" /></th>
                  <th className="text-right pb-2 px-2"><SortBtn col="open" label="Open" /></th>
                  <th className="text-right pb-2 px-2 text-muted-foreground font-black whitespace-nowrap">Cleaning</th>
                  <th className="text-right pb-2 px-2"><SortBtn col="cleaned" label="Cleaned" /></th>
                  <th className="text-right pb-2 px-2"><SortBtn col="avgCleanupHours" label="Avg Time" /></th>
                  <th className="text-right pb-2 pl-2"><SortBtn col="rate" label="Rate" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedHIs.map(hi => (
                  <tr key={hi.name}
                    className={`border-b border-border/20 last:border-0 transition-colors ${hi.rate < 50 ? "bg-destructive/5" : "hover:bg-muted/30"}`}>
                    <td className="py-2 pr-3 font-bold text-foreground max-w-[130px]">
                      <span className="block truncate" title={hi.name}>{hi.name}</span>
                      {(hi.supervisorCount ?? 0) > 0 && (
                        <span className="text-muted-foreground font-normal">{hi.supervisorCount} officers</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right text-destructive font-semibold">{hi.open}</td>
                    <td className="py-2 px-2 text-right text-blue-500 font-semibold">{hi.cleaning}</td>
                    <td className="py-2 px-2 text-right text-primary font-semibold">{hi.cleaned}</td>
                    <td className="py-2 px-2 text-right text-amber-600 font-semibold">{fmtHours(hi.avgCleanupHours)}</td>
                    <td className="py-2 pl-2 text-right">
                      <span className={`font-black text-sm ${hi.rate >= 80 ? "text-primary" : hi.rate >= 50 ? "text-amber-600" : "text-destructive"}`}>
                        {hi.rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {kpis.total === 0 && (
        <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-16 px-4 text-center">
          <BarChart2 className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <h3 className="text-base font-black text-foreground mb-1">No data yet</h3>
          <p className="text-sm text-muted-foreground">Analytics will appear once reports are submitted.</p>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function CommissionerDashboard() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  const [tab, setTab] = useState<"overview" | "analytics">(() =>
    new URLSearchParams(window.location.search).get("view") === "analytics" ? "analytics" : "overview",
  );
  const [drillStatus, setDrillStatus] = useState<string | null>(null);
  const [drillWard, setDrillWard] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const drillOpen = drillStatus !== null || drillWard !== null;

  const { from: dateFrom, to: dateTo } = dateRangeToParams(dateRange);

  const { data: hierarchy, isLoading: hierarchyLoading } = useHierarchy(dateFrom, dateTo);

  const ee = hierarchy?.environmentalEngineer ?? null;

  const totals = useMemo(() => {
    if (!ee) return { reported: 0, cleaning: 0, cleaned: 0, total: 0, supervisors: 0, his: 0 };
    const his = ee.healthInspectors;
    const reported = his.reduce((s, h) => s + h.reportedCount, 0);
    const cleaning = his.reduce((s, h) => s + h.cleaningCount, 0);
    const cleaned = his.reduce((s, h) => s + h.cleanedCount, 0);
    const total = his.reduce((s, h) => s + h.totalCount, 0);
    const supervisors = his.reduce((s, h) => s + h.supervisorCount, 0);
    return { reported, cleaning, cleaned, total, supervisors, his: his.length };
  }, [ee]);

  const resolutionRate = totals.total > 0 ? Math.round((totals.cleaned / totals.total) * 100) : 0;
  const drillParams = new URLSearchParams();
  if (drillStatus) drillParams.set("status", drillStatus);
  if (drillWard)   drillParams.set("wardName", drillWard);
  if (dateFrom)    drillParams.set("from", dateFrom);
  if (dateTo)      drillParams.set("to", dateTo);
  const drillQs = drillParams.toString();

  const { data: drillData, isLoading: drillLoading } = useQuery<{ reports: DrilldownReport[]; total: number }>({
    queryKey: ["commissioner-drill", drillStatus, drillWard, dateFrom, dateTo],
    queryFn: () => customFetch(`/api/commissioner/reports${drillQs ? `?${drillQs}` : ""}`),
    enabled: drillOpen,
    staleTime: 60_000,
  });
  const drillReports = drillData?.reports ?? [];

  const statusLabel =
    drillStatus === "reported" ? "New Reports" :
    drillStatus === "cleaning" ? "In Progress" :
    drillStatus === "cleaned"  ? "Cleaned" : "All Reports";
  const drillTitle = `${statusLabel}${drillWard ? ` · ${drillWard}` : " · Commissioner"}`;

  const availableWards = useMemo(() => {
    const seen = new Set<string>();
    for (const hi of (ee?.healthInspectors ?? [])) {
      for (const sv of hi.supervisors) {
        for (const wn of (Array.isArray(sv.wardNames) ? sv.wardNames : [])) {
          seen.add(svWardToGeoName(wn));
        }
      }
    }
    return [...seen].sort();
  }, [ee]);

  const { data: mapData } = useMapReports(dateFrom, dateTo);
  const mapReports = mapData?.reports ?? [];
  const wardGroups = useMemo((): WardGroup[] =>
    (ee?.healthInspectors ?? []).map(hi => ({
      id: hi.id,
      name: hi.name,
      wardGeoNames: hi.supervisors.flatMap(sv =>
        (Array.isArray(sv.wardNames) ? sv.wardNames : []).map(svWardToGeoName)
      ),
      openCount: hi.reportedCount,
      cleaningCount: hi.cleaningCount,
      cleanedCount: hi.cleanedCount,
      totalCount: hi.totalCount,
    })), [ee]);
  const wardGeoNames = useMemo(() => wardGroups.flatMap(g => g.wardGeoNames), [wardGroups]);

  return (
    <div className="w-full pb-10 animate-in fade-in duration-500 space-y-6">
      <StatusDrilldownSheet
        open={drillOpen}
        onClose={() => { setDrillStatus(null); setDrillWard(null); }}
        title={drillTitle}
        reports={drillReports}
        isLoading={drillLoading}
        wardName={drillWard}
        availableWards={availableWards}
        onWardChange={setDrillWard}
      />

      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-bl-[100px] pointer-events-none" />
        <p className="text-sm font-medium text-muted-foreground mb-1">{getGreeting(user?.name)}</p>
        <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-indigo-200">
          <Building2 className="w-3.5 h-3.5" /> Commissioner
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
          {profileLoading ? "Loading…" : (profile?.name ?? user?.name)}
        </h1>
        <p className="text-sm text-muted-foreground font-medium">
          {profile?.panchayatName ?? "Udupi"} · {totals.his} Health Inspector{totals.his !== 1 ? "s" : ""} · {totals.supervisors} Field Officers
        </p>

        {/* Summary stats — first 3 are clickable drill-downs */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "New Reports", value: totals.reported, icon: <AlertCircle className="w-5 h-5" />, color: "text-destructive", bg: "bg-destructive/8", filter: "reported" },
            { label: "In Progress", value: totals.cleaning, icon: <Wrench className="w-5 h-5" />, color: "text-blue-500", bg: "bg-blue-50", filter: "cleaning" },
            { label: "Cleaned", value: totals.cleaned, icon: <CheckCircle2 className="w-5 h-5" />, color: "text-primary", bg: "bg-primary/8", filter: "cleaned" },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setDrillStatus(drillStatus === s.filter ? null : s.filter)}
              className={`${drillStatus === s.filter ? "ring-2 ring-offset-1 brightness-95" : ""} ${s.bg} rounded-2xl px-4 py-3 flex items-center gap-3 transition-all cursor-pointer text-left w-full hover:brightness-95`}
            >
              <div className={s.color}>{s.icon}</div>
              <div>
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground font-semibold">{s.label}</div>
              </div>
            </button>
          ))}
          {/* Resolution Rate — non-interactive */}
          <div className="bg-emerald-50 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="text-emerald-600"><TrendingUp className="w-5 h-5" /></div>
            <div>
              <div className="text-2xl font-black text-emerald-600">{resolutionRate}%</div>
              <div className="text-xs text-muted-foreground font-semibold">Resolution Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab switcher + date filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 bg-muted/50 p-1 rounded-2xl">
          <button type="button" onClick={() => setTab("overview")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === "overview" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <LayoutDashboard className="w-4 h-4" /> Overview
          </button>
          <button type="button" onClick={() => setTab("analytics")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === "analytics" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <BarChart2 className="w-4 h-4" /> Analytics
          </button>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {tab === "overview" && (
        <>
          {/* Panchayat coverage map */}
          {wardGeoNames.length > 0 && (
            <RoleMap
              reports={mapReports}
              wardGeoNames={wardGeoNames}
              wardGroups={wardGroups}
              showLayerToggle
              title="Panchayat Coverage"
              subtitle="Wards coloured by health inspector · tap a ward to filter complaints"
              height="380px"
              onWardTap={(geoName) => { setDrillWard(geoName); }}
            />
          )}

          {/* Hierarchy tree */}
          {hierarchyLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <p className="font-bold text-lg">Loading hierarchy…</p>
            </div>
          ) : !ee ? (
            <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-20 px-4 text-center">
              <Users className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-xl font-black text-foreground mb-1">No hierarchy data available</h3>
              <p className="text-sm text-muted-foreground">
                No environmental engineer is assigned to this panchayat yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-foreground">Field Hierarchy</h2>
              <EeCard ee={ee} dateFrom={dateFrom} dateTo={dateTo} />
            </div>
          )}
        </>
      )}

      {tab === "analytics" && (
        <CommissionerAnalyticsPanel
          onWardClick={(wardGeoName) => setDrillWard(wardGeoName)}
        />
      )}
    </div>
  );
}
