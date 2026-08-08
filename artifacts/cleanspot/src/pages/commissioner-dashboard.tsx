import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";

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

function useHierarchy() {
  return useQuery<CommissionerHierarchy>({
    queryKey: ["commissioner-hierarchy"],
    queryFn: () => customFetch("/api/commissioner/hierarchy"),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
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
        <ResolutionPill cleaned={sv.cleanedCount} total={sv.totalCount} size="sm" />
      </div>
    </div>
  );
}

// ── Health Inspector card (expandable to supervisors) ─────────────────────────

function HiCard({
  hi,
  onEdit,
}: {
  hi: HealthInspector;
  onEdit: (t: EditTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const wardCount = useMemo(() => {
    const seen = new Set<string>();
    for (const sv of hi.supervisors) {
      const wards: string[] = Array.isArray(sv.wardNames) ? sv.wardNames : [];
      wards.forEach((w) => seen.add(w));
    }
    return seen.size;
  }, [hi.supervisors]);

  return (
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
              <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-0.5 rounded-full border border-destructive/20">
                {hi.reportedCount} New
              </span>
              <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full border border-blue-200">
                {hi.cleaningCount} In Progress
              </span>
              <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full border border-primary/20">
                {hi.cleanedCount} Cleaned
              </span>
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
  );
}

// ── Environmental Engineer card (expandable to HI cards) ──────────────────────

function EeCard({ ee }: { ee: EnvironmentalEngineer }) {
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
              <HiCard key={hi.id} hi={hi} onEdit={(t) => setEditing(t)} />
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function CommissionerDashboard() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: hierarchy, isLoading: hierarchyLoading } = useHierarchy();

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

  return (
    <div className="w-full pb-10 animate-in fade-in duration-500 space-y-6">
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

        {/* Summary stats — 4 tiles */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "New Reports",
              value: totals.reported,
              icon: <AlertCircle className="w-5 h-5" />,
              color: "text-destructive",
              bg: "bg-destructive/8",
            },
            {
              label: "In Progress",
              value: totals.cleaning,
              icon: <Wrench className="w-5 h-5" />,
              color: "text-blue-500",
              bg: "bg-blue-50",
            },
            {
              label: "Cleaned",
              value: totals.cleaned,
              icon: <CheckCircle2 className="w-5 h-5" />,
              color: "text-primary",
              bg: "bg-primary/8",
            },
            {
              label: "Resolution Rate",
              value: `${resolutionRate}%`,
              icon: <TrendingUp className="w-5 h-5" />,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
            },
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
          <EeCard ee={ee} />
        </div>
      )}
    </div>
  );
}
