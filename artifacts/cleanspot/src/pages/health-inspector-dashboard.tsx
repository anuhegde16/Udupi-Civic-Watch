import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StatusDrilldownSheet, type DrilldownReport } from "@/components/status-drilldown-sheet";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { getGreeting } from "@/lib/greeting";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useImageLightbox } from "@/components/image-lightbox";
import { RoleMap, type RoleMapReport, type WardGroup } from "@/components/role-map";
import { useToast } from "@/hooks/use-toast";
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
  Pencil,
  ArrowRightLeft,
  TrendingUp,
  BarChart2,
  LayoutDashboard,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

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

function useMapReports() {
  return useQuery<{ reports: RoleMapReport[] }>({
    queryKey: ["hi-map-reports"],
    queryFn: () => customFetch("/api/health-inspector/map-reports"),
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

// ── Edit Credentials Modal ────────────────────────────────────────────────────
function EditCredentialsModal({
  sv,
  open,
  onOpenChange,
}: {
  sv: SupervisorStat;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState(sv.name);
  const [phone, setPhone] = useState(sv.phone);
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: { name?: string; phone?: string; password?: string }) =>
      customFetch(`/api/health-inspector/supervisor/${sv.id}/credentials`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({ title: "Field officer updated" });
      queryClient.invalidateQueries({ queryKey: ["hi-supervisor-stats"] });
      queryClient.invalidateQueries({ queryKey: ["hi-me"] });
      setPassword("");
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const data: Record<string, string> = {};
    if (name.trim() && name.trim() !== sv.name) data.name = name.trim();
    if (phone.trim() && phone.trim() !== sv.phone) data.phone = phone.trim();
    if (password.trim()) data.password = password.trim();
    if (Object.keys(data).length === 0) { onOpenChange(false); return; }
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[2rem] p-0 border-border/50 shadow-2xl overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl font-black">Edit Field Officer</DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Officer name"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">Phone (login)</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit phone"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">New Password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter className="p-6 pt-0 flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-xl"
            onClick={handleSave}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reassign Modal ────────────────────────────────────────────────────────────
function ReassignModal({
  report,
  currentSvId,
  allSupervisors,
  open,
  onOpenChange,
}: {
  report: SupervisorReport;
  currentSvId: number;
  allSupervisors: SupervisorStat[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [selectedSvId, setSelectedSvId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const otherSupervisors = allSupervisors.filter((s) => s.id !== currentSvId);

  const mutation = useMutation({
    mutationFn: (targetSupervisorId: number) =>
      customFetch(`/api/health-inspector/reports/${report.id}/reassign`, {
        method: "POST",
        body: JSON.stringify({ targetSupervisorId }),
      }),
    onSuccess: () => {
      toast({ title: "Report reassigned successfully" });
      queryClient.invalidateQueries({ queryKey: ["hi-sv-reports"] });
      queryClient.invalidateQueries({ queryKey: ["hi-supervisor-stats"] });
      setSelectedSvId(null);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to reassign", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[2rem] p-0 border-border/50 shadow-2xl overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-black">Reassign Report #{report.id}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {report.address || `${report.latitude?.toFixed(4)}, ${report.longitude?.toFixed(4)}`}
          </p>
        </DialogHeader>
        <div className="px-6 pb-2 space-y-2 max-h-64 overflow-y-auto">
          {otherSupervisors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No other field officers available.</p>
          ) : (
            otherSupervisors.map((sv) => (
              <button
                key={sv.id}
                type="button"
                onClick={() => setSelectedSvId(sv.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  selectedSvId === sv.id
                    ? "border-violet-400 bg-violet-50"
                    : "border-border/50 hover:bg-muted/40"
                }`}
              >
                <div className="font-bold text-sm text-foreground">{sv.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {Array.isArray(sv.wardNames) ? sv.wardNames.join(", ") : "—"}
                </div>
              </button>
            ))
          )}
        </div>
        <DialogFooter className="p-6 pt-3 flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-xl"
            onClick={() => selectedSvId && mutation.mutate(selectedSvId)}
            disabled={!selectedSvId || mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Supervisor Card ───────────────────────────────────────────────────────────
function SupervisorCard({ sv, allSupervisors }: { sv: SupervisorStat; allSupervisors: SupervisorStat[] }) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reassignReport, setReassignReport] = useState<SupervisorReport | null>(null);
  const { lightbox, open: openLightbox } = useImageLightbox();
  const { data: reportsData, isLoading } = useSupervisorReports(expanded ? sv.id : null);

  const [pillDrill, setPillDrill] = useState<string | null>(null);
  const { data: drillData, isLoading: drillLoading } = useQuery<{ reports: DrilldownReport[] }>({
    queryKey: ["hi-sv-pill-drill", sv.id, pillDrill],
    queryFn: () => customFetch(`/api/health-inspector/supervisor/${sv.id}/reports?status=${pillDrill}`),
    enabled: pillDrill !== null,
    staleTime: 60_000,
  });
  const drillReports = drillData?.reports ?? [];
  const pillDrillTitle =
    pillDrill === "reported" ? `${sv.name} · New` :
    pillDrill === "cleaning" ? `${sv.name} · In Progress` :
    pillDrill === "cleaned"  ? `${sv.name} · Cleaned` : "";

  const wardNames: string[] = Array.isArray(sv.wardNames) ? sv.wardNames : [];
  const resolutionRate = sv.totalCount > 0 ? Math.round((sv.cleanedCount / sv.totalCount) * 100) : 0;

  return (
    <>
      <StatusDrilldownSheet
        open={pillDrill !== null}
        onClose={() => setPillDrill(null)}
        title={pillDrillTitle}
        reports={drillReports}
        isLoading={drillLoading}
      />
      <EditCredentialsModal sv={sv} open={editOpen} onOpenChange={setEditOpen} />
      {reassignReport && (
        <ReassignModal
          report={reassignReport}
          currentSvId={sv.id}
          allSupervisors={allSupervisors}
          open={!!reassignReport}
          onOpenChange={(v) => { if (!v) setReassignReport(null); }}
        />
      )}
      <Card className="rounded-3xl border-border/50 overflow-hidden">
        {lightbox}
        {/* Header row: expand button + edit action */}
        <div className="flex items-stretch">
          <button
            type="button"
            className="flex-1 text-left p-5 hover:bg-muted/30 transition-colors"
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
                {/* Status pills + resolution rate */}
                <div className="flex gap-2 flex-wrap items-center">
                  {[
                    { status: "reported", label: `${sv.reportedCount} New`, cls: "bg-destructive/10 text-destructive border-destructive/20" },
                    { status: "cleaning", label: `${sv.cleaningCount} In Progress`, cls: "bg-blue-50 text-blue-700 border-blue-200" },
                    { status: "cleaned",  label: `${sv.cleanedCount} Cleaned`,    cls: "bg-primary/10 text-primary border-primary/20" },
                  ].map((p) => (
                    <button
                      key={p.status}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setPillDrill(pillDrill === p.status ? null : p.status); }}
                      className={`${p.cls} ${pillDrill === p.status ? "ring-2 ring-offset-1 brightness-95" : ""} text-xs font-bold px-2.5 py-1 rounded-full border transition-all hover:brightness-95`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <TrendingUp className="w-3 h-3" /> {resolutionRate}%
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-muted-foreground mt-1">
                {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </div>
            </div>
          </button>
          {/* Edit button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
            className="px-4 flex items-center justify-center border-l border-border/40 hover:bg-violet-50 transition-colors text-muted-foreground hover:text-violet-600"
            title="Edit field officer"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>

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
                          {r.address || `${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)}`}
                        </p>
                        {r.wasteTypes && r.wasteTypes.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.wasteTypes.slice(0, 3).map((wt) => (
                              <span key={wt} className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">{wt}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {format(new Date(r.createdAt), "MMM d, h:mm a")}
                          </div>
                          {/* Reassign button — only for New reports */}
                          {r.status === "reported" && (
                            <button
                              type="button"
                              onClick={() => setReassignReport(r)}
                              className="flex items-center gap-1 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full hover:bg-violet-100 transition-colors"
                            >
                              <ArrowRightLeft className="w-3 h-3" /> Reassign
                            </button>
                          )}
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
    </>
  );
}

// ── Analytics ──────────────────────────────────────────────────────────────────

type PerfRow = { name: string; open: number; cleaning: number; cleaned: number; total: number; rate: number; avgCleanupHours: number };
type TrendRow = { date: string; reported: number; cleaned: number };
type BacklogRow = { wardName: string; open: number };
type HIAnalytics = {
  kpis: { open: number; cleaning: number; resolvedThisMonth: number; totalCleaned: number; total: number; avgCleanupHours: number; resolutionRate: number };
  dailyTrend: TrendRow[];
  wardBacklog: BacklogRow[];
  supervisorPerformance: PerfRow[];
};

function useHIAnalytics() {
  return useQuery<HIAnalytics>({
    queryKey: ["hi-analytics"],
    queryFn: () => customFetch("/api/health-inspector/analytics"),
    staleTime: 3 * 60_000,
  });
}

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtHrs(h: number) {
  if (!h) return "–";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round(h / 24)}d`;
}

function PerfBars({ rows, label }: { rows: PerfRow[]; label: string }) {
  if (!rows.length) return null;
  return (
    <div className="bg-card border border-border/50 rounded-3xl p-5">
      <h3 className="text-sm font-black text-foreground mb-0.5">{label}</h3>
      <p className="text-xs text-muted-foreground mb-4">Resolution rate · open count</p>
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-foreground truncate max-w-[55%]">{row.name}</span>
              <div className="flex items-center gap-2 text-xs shrink-0 ml-2">
                <span className="text-destructive font-semibold">{row.open} open</span>
                <span className="font-black text-foreground">{row.rate}%</span>
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${row.rate >= 60 ? "bg-primary" : row.rate >= 30 ? "bg-amber-500" : "bg-destructive"}`}
                style={{ width: `${row.rate}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HIAnalyticsPanel() {
  const { data, isLoading } = useHIAnalytics();
  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
      <p className="font-bold">Loading analytics…</p>
    </div>
  );
  if (!data) return null;
  const { kpis, dailyTrend, wardBacklog, supervisorPerformance } = data;
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open Reports",      value: kpis.open,              color: "text-destructive", bg: "bg-destructive/8" },
          { label: "In Progress",       value: kpis.cleaning,          color: "text-blue-500",    bg: "bg-blue-50"       },
          { label: "Cleaned (30d)",     value: kpis.resolvedThisMonth, color: "text-primary",     bg: "bg-primary/8"     },
          { label: "Avg. Cleanup Time", value: fmtHrs(kpis.avgCleanupHours), color: "text-amber-600", bg: "bg-amber-50" },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl px-4 py-3`}>
            <div className={`text-2xl font-black ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground font-semibold mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {dailyTrend.length > 0 && (
        <div className="bg-card border border-border/50 rounded-3xl p-5">
          <h3 className="text-sm font-black text-foreground mb-0.5">30-Day Activity</h3>
          <p className="text-xs text-muted-foreground mb-4">Reports received vs cleaned per day</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={dailyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={fmtDateShort} tick={{ fontSize: 10 }} interval={6} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip labelFormatter={(l: string) => fmtDateShort(l)} />
              <Line type="monotone" dataKey="reported" stroke="#ef4444" strokeWidth={2} dot={false} name="New Reports" />
              <Line type="monotone" dataKey="cleaned"  stroke="#22c55e" strokeWidth={2} dot={false} name="Cleaned" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <PerfBars rows={supervisorPerformance ?? []} label="Field Officer Performance" />

      {wardBacklog.length > 0 && (
        <div className="bg-card border border-border/50 rounded-3xl p-5">
          <h3 className="text-sm font-black text-foreground mb-0.5">Ward Backlog</h3>
          <p className="text-xs text-muted-foreground mb-4">Open reports per ward</p>
          <ResponsiveContainer width="100%" height={Math.max(140, wardBacklog.length * 26)}>
            <BarChart layout="vertical" data={wardBacklog} margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="wardName" tick={{ fontSize: 10 }} width={36} />
              <Tooltip />
              <Bar dataKey="open" name="Open Reports" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {(supervisorPerformance ?? []).filter(e => e.avgCleanupHours > 0).length > 0 && (
        <div className="bg-card border border-border/50 rounded-3xl p-5">
          <h3 className="text-sm font-black text-foreground mb-0.5">Avg. Cleanup Time by Field Officer</h3>
          <p className="text-xs text-muted-foreground mb-4">Time from report received to cleaned</p>
          <div className="divide-y divide-border/30">
            {(supervisorPerformance ?? []).filter(e => e.avgCleanupHours > 0).map(sv => (
              <div key={sv.name} className="flex items-center justify-between py-2.5">
                <span className="text-xs font-bold text-foreground truncate">{sv.name}</span>
                <span className="text-sm font-black text-amber-600 shrink-0 ml-3">{fmtHrs(sv.avgCleanupHours)}</span>
              </div>
            ))}
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
export default function HealthInspectorDashboard() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: statsData, isLoading: statsLoading } = useSupervisorStats();

  const supervisors = statsData?.supervisors ?? [];
  const totals = useMemo(() => ({
    reported: supervisors.reduce((s, sv) => s + sv.reportedCount, 0),
    cleaning: supervisors.reduce((s, sv) => s + sv.cleaningCount, 0),
    cleaned: supervisors.reduce((s, sv) => s + sv.cleanedCount, 0),
    total: supervisors.reduce((s, sv) => s + sv.totalCount, 0),
  }), [supervisors]);

  const overallRate = totals.total > 0 ? Math.round((totals.cleaned / totals.total) * 100) : 0;

  const [tab, setTab] = useState<"overview" | "analytics">("overview");
  const [drillStatus, setDrillStatus] = useState<string | null>(null);
  const [drillWard, setDrillWard] = useState<string | null>(null);

  const drillOpen = drillStatus !== null || drillWard !== null;

  const drillParams = new URLSearchParams();
  if (drillStatus) drillParams.set("status", drillStatus);
  if (drillWard)   drillParams.set("wardName", drillWard);
  const drillQs = drillParams.toString();

  const { data: drillData, isLoading: drillLoading } = useQuery<{ reports: DrilldownReport[]; total: number }>({
    queryKey: ["hi-drill", drillStatus, drillWard],
    queryFn: () => customFetch(`/api/health-inspector/reports${drillQs ? `?${drillQs}` : ""}`),
    enabled: drillOpen,
    staleTime: 60_000,
  });
  const drillReports = drillData?.reports ?? [];

  const statusLabel =
    drillStatus === "reported" ? "New Reports" :
    drillStatus === "cleaning" ? "In Progress" :
    drillStatus === "cleaned"  ? "Cleaned" : "All Reports";
  const drillTitle = `${statusLabel}${drillWard ? ` · ${drillWard}` : " · Health Inspector"}`;

  const availableWards = useMemo(() => {
    const seen = new Set<string>();
    for (const sv of supervisors) {
      for (const wn of (Array.isArray(sv.wardNames) ? sv.wardNames : [])) {
        seen.add(svWardToGeoName(wn));
      }
    }
    return [...seen].sort();
  }, [supervisors]);

  const { data: mapData } = useMapReports();
  const mapReports = mapData?.reports ?? [];
  const wardGroups = useMemo((): WardGroup[] =>
    supervisors.map(sv => ({
      id: sv.id,
      name: sv.name,
      wardGeoNames: (Array.isArray(sv.wardNames) ? sv.wardNames : []).map(svWardToGeoName),
      openCount: sv.reportedCount,
      cleaningCount: sv.cleaningCount,
      cleanedCount: sv.cleanedCount,
      totalCount: sv.totalCount,
    })), [supervisors]);
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
        <div className="absolute top-0 right-0 w-40 h-40 bg-violet-500/5 rounded-bl-[100px] pointer-events-none" />
        <p className="text-sm font-medium text-muted-foreground mb-1">{getGreeting(user?.name)}</p>
        <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-violet-200">
          <Users className="w-3.5 h-3.5" /> Health Inspector
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
          {profileLoading ? "Loading…" : (profile?.name ?? user?.name)}
        </h1>
        <p className="text-sm text-muted-foreground font-medium">
          {profile?.panchayat_name ?? "Udupi"} · {supervisors.length} Field Officer{supervisors.length !== 1 ? "s" : ""}
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
              <div className="text-2xl font-black text-emerald-600">{overallRate}%</div>
              <div className="text-xs text-muted-foreground font-semibold">Resolution Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 bg-muted/50 p-1 rounded-2xl w-fit">
        <button type="button" onClick={() => setTab("overview")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === "overview" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <LayoutDashboard className="w-4 h-4" /> Overview
        </button>
        <button type="button" onClick={() => setTab("analytics")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === "analytics" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <BarChart2 className="w-4 h-4" /> Analytics
        </button>
      </div>

      {tab === "overview" && (
        <>
          {/* Coverage map — coloured by field officer */}
          {wardGeoNames.length > 0 && (
            <RoleMap
              reports={mapReports}
              wardGeoNames={wardGeoNames}
              wardGroups={wardGroups}
              title="Coverage Overview"
              subtitle="Wards coloured by field officer · tap a ward to filter complaints"
              height="340px"
              onWardTap={(geoName) => { setDrillWard(geoName); }}
            />
          )}

          {/* Field Officer cards */}
          {statsLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <p className="font-bold text-lg">Loading field officers…</p>
            </div>
          ) : supervisors.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-20 px-4 text-center">
              <Users className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-xl font-black text-foreground mb-1">No field officers assigned</h3>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-foreground">Your Field Officers</h2>
              {supervisors.map((sv) => (
                <SupervisorCard key={sv.id} sv={sv} allSupervisors={supervisors} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "analytics" && <HIAnalyticsPanel />}
    </div>
  );
}
