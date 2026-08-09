import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Pencil,
  TrendingUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type EeHierarchy = {
  healthInspectors: HealthInspector[];
};

// ─── Data hooks ───────────────────────────────────────────────────────────────

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

// ─── Edit credentials modal ───────────────────────────────────────────────────

type EditTarget = { id: number; name: string; phone: string; kind: "hi" | "supervisor" };

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

  const endpoint =
    target.kind === "hi"
      ? `/api/env-engineer/health-inspector/${target.id}/credentials`
      : `/api/env-engineer/supervisor/${target.id}/credentials`;

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
      qc.invalidateQueries({ queryKey: ["ee-hierarchy"] });
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
            <Label htmlFor="ec-name">Name</Label>
            <Input
              id="ec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-phone">Phone</Label>
            <Input
              id="ec-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-password">New password <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="ec-password"
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
            disabled={mutation.isPending || (!name.trim() && !phone.trim() && !password.trim())}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useMapReports() {
  return useQuery<{ reports: RoleMapReport[] }>({
    queryKey: ["ee-map-reports"],
    queryFn: () => customFetch("/api/env-engineer/map-reports"),
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

// ─── Resolution rate pill ─────────────────────────────────────────────────────

function ResolutionPill({ cleaned, total }: { cleaned: number; total: number }) {
  const rate = total > 0 ? Math.round((cleaned / total) * 100) : 0;
  return (
    <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
      <TrendingUp className="w-3 h-3" />
      {rate}%
    </span>
  );
}

// ─── HI card ─────────────────────────────────────────────────────────────────

function HiCard({ hi }: { hi: HealthInspector }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const wardSet = useMemo(() => {
    const seen = new Set<string>();
    for (const sv of hi.supervisors) {
      const wards: string[] = Array.isArray(sv.wardNames) ? sv.wardNames : [];
      wards.forEach((w) => seen.add(w));
    }
    return [...seen];
  }, [hi.supervisors]);

  return (
    <>
      {editing && <EditCredentialsModal target={editing} onClose={() => setEditing(null)} />}

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
                <span className="font-black text-foreground text-base truncate">{hi.name}</span>
                {hi.phone && (
                  <a
                    href={`tel:${hi.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary text-xs font-bold hover:underline shrink-0"
                  >
                    {hi.phone}
                  </a>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing({ id: hi.id, name: hi.name, phone: hi.phone, kind: "hi" });
                  }}
                  className="ml-auto shrink-0 p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Edit health inspector credentials"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground font-medium mb-3">
                {hi.supervisorCount} field officer{hi.supervisorCount !== 1 ? "s" : ""} · {wardSet.length} ward{wardSet.length !== 1 ? "s" : ""}
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
                <ResolutionPill cleaned={hi.cleanedCount} total={hi.totalCount} />
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
                  {/* Name + phone + edit */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-bold text-foreground text-sm">{sv.name}</span>
                    {sv.phone && (
                      <a href={`tel:${sv.phone}`} className="text-primary text-xs font-bold hover:underline">
                        {sv.phone}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({ id: sv.id, name: sv.name, phone: sv.phone, kind: "supervisor" })
                      }
                      className="ml-auto p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      aria-label="Edit field officer credentials"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>

                  {svWards.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {svWards.map((w) => (
                        <span
                          key={w}
                          className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full"
                        >
                          {w}
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
                    <ResolutionPill cleaned={sv.cleanedCount} total={sv.totalCount} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {expanded && hi.supervisors.length === 0 && (
          <div className="border-t border-border/50 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            No field officers assigned yet.
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function EnvEngineerDashboard() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: hierarchy, isLoading: hierarchyLoading } = useHierarchy();

  const his = hierarchy?.healthInspectors ?? [];

  const totals = useMemo(() => {
    const reported = his.reduce((s, h) => s + h.reportedCount, 0);
    const cleaning = his.reduce((s, h) => s + h.cleaningCount, 0);
    const cleaned = his.reduce((s, h) => s + h.cleanedCount, 0);
    const total = his.reduce((s, h) => s + h.totalCount, 0);
    const supervisors = his.reduce((s, h) => s + h.supervisorCount, 0);
    const resolutionRate = total > 0 ? Math.round((cleaned / total) * 100) : 0;
    return { reported, cleaning, cleaned, total, supervisors, resolutionRate };
  }, [his]);

  const [drillStatus, setDrillStatus] = useState<string | null>(null);
  const [drillWard, setDrillWard] = useState<string | null>(null);

  const drillOpen = drillStatus !== null || drillWard !== null;

  const drillParams = new URLSearchParams();
  if (drillStatus) drillParams.set("status", drillStatus);
  if (drillWard)   drillParams.set("wardName", drillWard);
  const drillQs = drillParams.toString();

  const { data: drillData, isLoading: drillLoading } = useQuery<{ reports: DrilldownReport[]; total: number }>({
    queryKey: ["ee-drill", drillStatus, drillWard],
    queryFn: () => customFetch(`/api/env-engineer/reports${drillQs ? `?${drillQs}` : ""}`),
    enabled: drillOpen,
    staleTime: 60_000,
  });
  const drillReports = drillData?.reports ?? [];

  const statusLabel =
    drillStatus === "reported" ? "New Reports" :
    drillStatus === "cleaning" ? "In Progress" :
    drillStatus === "cleaned"  ? "Cleaned" : "All Reports";
  const drillTitle = `${statusLabel}${drillWard ? ` · ${drillWard}` : " · Env. Engineer"}`;

  const availableWards = useMemo(() => {
    const seen = new Set<string>();
    for (const hi of his) {
      for (const sv of hi.supervisors) {
        for (const wn of (Array.isArray(sv.wardNames) ? sv.wardNames : [])) {
          seen.add(svWardToGeoName(wn));
        }
      }
    }
    return [...seen].sort();
  }, [his]);

  const { data: mapData } = useMapReports();
  const mapReports = mapData?.reports ?? [];
  const wardGroups = useMemo((): WardGroup[] =>
    his.map(hi => ({
      id: hi.id,
      name: hi.name,
      wardGeoNames: hi.supervisors.flatMap(sv =>
        (Array.isArray(sv.wardNames) ? sv.wardNames : []).map(svWardToGeoName)
      ),
      openCount: hi.reportedCount,
      cleaningCount: hi.cleaningCount,
      cleanedCount: hi.cleanedCount,
      totalCount: hi.totalCount,
    })), [his]);
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
        <div className="absolute top-0 right-0 w-40 h-40 bg-sky-500/5 rounded-bl-[100px] pointer-events-none" />
        <p className="text-sm font-medium text-muted-foreground mb-1">{getGreeting(user?.name)}</p>
        <div className="inline-flex items-center gap-2 bg-sky-50 text-sky-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-sky-200">
          <Users className="w-3.5 h-3.5" /> Environmental Engineer
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
          {profileLoading ? "Loading…" : (profile?.name ?? user?.name)}
        </h1>
        <p className="text-sm text-muted-foreground font-medium">
          {profile?.panchayat_name ?? "Udupi"} · {his.length} Health Inspector{his.length !== 1 ? "s" : ""} · {totals.supervisors} Field Officers
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
              <div className="text-2xl font-black text-emerald-600">{totals.resolutionRate}%</div>
              <div className="text-xs text-muted-foreground font-semibold">Resolution Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Coverage map — coloured by health inspector zone */}
      {wardGeoNames.length > 0 && (
        <RoleMap
          reports={mapReports}
          wardGeoNames={wardGeoNames}
          wardGroups={wardGroups}
          title="Zone Coverage Map"
          subtitle="Wards coloured by health inspector zone · tap a ward to filter complaints"
          height="340px"
          onWardTap={(geoName) => { setDrillWard(geoName); }}
        />
      )}

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
