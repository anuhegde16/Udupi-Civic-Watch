import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { getGreeting } from "@/lib/greeting";

// ── Commissioner Team View ─────────────────────────────────────────────────────
type CommissionerHierarchy = {
  environmentalEngineer: {
    id: number; name: string; phone: string; hiCount: number;
    healthInspectors: {
      id: number; name: string; phone: string; supervisorCount: number;
      reportedCount: number; cleaningCount: number; cleanedCount: number;
      supervisors: {
        id: number; name: string; phone: string; wardNames: string[];
        reportedCount: number; totalCount: number;
      }[];
    }[];
  } | null;
};

function CommissionerTeamView() {
  const [expandedHi, setExpandedHi] = useState<number | null>(null);
  const { data, isLoading, error } = useQuery<CommissionerHierarchy>({
    queryKey: ["commissioner-hierarchy"],
    queryFn: () => customFetch("/api/commissioner/hierarchy"),
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
      <span className="font-bold">Loading org tree…</span>
    </div>
  );
  if (error || !data?.environmentalEngineer) return (
    <div className="text-center py-12 text-muted-foreground font-medium">No hierarchy data available.</div>
  );

  const ee = data.environmentalEngineer;
  const his = ee.healthInspectors ?? [];
  const totals = {
    reported: his.reduce((s, h) => s + h.reportedCount, 0),
    cleaning: his.reduce((s, h) => s + h.cleaningCount, 0),
    cleaned: his.reduce((s, h) => s + h.cleanedCount, 0),
  };

  return (
    <div className="space-y-6">
      {/* EE card */}
      <div className="bg-sky-50 border border-sky-200 rounded-3xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-500 text-white flex items-center justify-center font-black text-lg shrink-0">
            {ee.name.charAt(0)}
          </div>
          <div>
            <p className="font-black text-sky-900">{ee.name}</p>
            <p className="text-xs text-sky-600 font-bold">Environmental Engineer · {ee.hiCount} Health Inspector{ee.hiCount !== 1 ? "s" : ""}</p>
          </div>
          {ee.phone && <a href={`tel:${ee.phone}`} className="ml-auto text-sky-700 text-xs font-bold hover:underline">{ee.phone}</a>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="bg-destructive/10 text-destructive text-xs font-bold px-2.5 py-1 rounded-full border border-destructive/20">{totals.reported} New</span>
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200">{totals.cleaning} In Progress</span>
          <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full border border-primary/20">{totals.cleaned} Cleaned</span>
        </div>
      </div>

      {/* HI cards */}
      <div className="space-y-3">
        <h3 className="text-base font-black text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-500" /> Health Inspectors
        </h3>
        {his.length === 0 && <p className="text-sm text-muted-foreground">No health inspectors found.</p>}
        {his.map((hi) => (
          <div key={hi.id} className="bg-card border border-border/50 rounded-2xl overflow-hidden">
            <button
              type="button"
              className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedHi(expandedHi === hi.id ? null : hi.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-sm text-foreground">{hi.name}</span>
                    {hi.phone && <a href={`tel:${hi.phone}`} onClick={(e) => e.stopPropagation()} className="text-primary text-xs font-bold hover:underline">{hi.phone}</a>}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{hi.supervisorCount} supervisor{hi.supervisorCount !== 1 ? "s" : ""}</p>
                  <div className="flex gap-2 flex-wrap">
                    <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-0.5 rounded-full border border-destructive/20">{hi.reportedCount} New</span>
                    <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full border border-blue-200">{hi.cleaningCount} In Progress</span>
                    <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full border border-primary/20">{hi.cleanedCount} Cleaned</span>
                  </div>
                </div>
                <span className="text-muted-foreground mt-1 text-lg">{expandedHi === hi.id ? "↑" : "↓"}</span>
              </div>
            </button>
            {expandedHi === hi.id && (
              <div className="border-t border-border/50 bg-muted/20 p-3 space-y-2">
                {hi.supervisors.length === 0 && <p className="text-sm text-muted-foreground px-2">No supervisors assigned.</p>}
                {hi.supervisors.map((sv) => {
                  const wards: string[] = Array.isArray(sv.wardNames) ? sv.wardNames : [];
                  return (
                    <div key={sv.id} className="bg-card border border-border/40 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-foreground">{sv.name}</span>
                        {sv.phone && <a href={`tel:${sv.phone}`} className="text-primary text-xs font-bold hover:underline">{sv.phone}</a>}
                      </div>
                      {wards.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {wards.map((w) => <span key={w} className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">{w}</span>)}
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-0.5 rounded-full border border-destructive/20">{sv.reportedCount} New</span>
                        <span className="text-muted-foreground text-xs font-bold px-2 py-0.5 bg-muted rounded-full">{sv.totalCount} Total</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useCreateOfficer, useUpdateOfficer, useUpdateReport } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  Loader2,
  Users,
  MapPin,
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  Mail,
  Phone,
  LayoutList,
  Pencil,
  FileWarning,
  X,
  KeyRound,
  RefreshCw,
  Archive,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import geofencesData from "@/data/geofences.json";
import { PanchayatMap, type PanchayatMapReport } from "@/components/panchayat-map";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ReportDetailSheet, type ReportDetail } from "@/components/report-detail-sheet";
import { NotificationCTABanner } from "@/components/notification-cta-banner";
import { ReportNumberSearch } from "@/components/report-number-search";

const allWardNames: string[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "ward")
  .map((f) => (f.properties as any)?.name ?? "");

/** Maps ward name → panchayat name from geofences.json; used for exact-match scoping. */
const wardPanchayatMap: Record<string, string> = Object.fromEntries(
  geofencesData.features
    .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "ward")
    .map((f) => [(f.properties as any)?.name ?? "", (f.properties as any)?.panchayat ?? ""])
);

const ZONE_COLORS = ["#f97316", "#8b5cf6", "#f43f5e", "#3b82f6", "#10b981", "#ec4899", "#0ea5e9", "#eab308"];

type PanchayatOfficer = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  areaName?: string | null;
  panchayatName?: string | null;
  reportCount: number;
  pendingCount: number;
  createdAt: string;
};

type PanchayatStats = {
  total: number;
  reported: number;
  cleaning: number;
  cleaned: number;
};

const createOfficerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional(),
  areaName: z.string().optional(),
});
type CreateOfficerValues = z.infer<typeof createOfficerSchema>;

const editOfficerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().optional(),
  email: z.string().email("Valid email required"),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine(
  (d) => !d.password || d.password.length >= 6,
  { message: "Password must be at least 6 characters", path: ["password"] }
).refine(
  (d) => !d.password || d.password === d.confirmPassword,
  { message: "Passwords do not match", path: ["confirmPassword"] }
);
type EditOfficerValues = z.infer<typeof editOfficerSchema>;

function usePanchayatOfficers(isCommissioner: boolean) {
  return useQuery<{ officers: PanchayatOfficer[]; total: number }>({
    queryKey: isCommissioner ? ["all-officers"] : ["panchayat-officers"],
    queryFn: () => customFetch(isCommissioner ? "/api/commissioner/all-officers" : "/api/panchayat/officers"),
    retry: false,
    staleTime: 5 * 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

function usePanchayatStats() {
  return useQuery<PanchayatStats>({
    queryKey: ["panchayat-stats"],
    queryFn: () => customFetch("/api/panchayat/stats"),
    retry: false,
    staleTime: 2 * 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

function usePanchayatReports() {
  return useQuery<{ reports: PanchayatMapReport[]; total: number }>({
    queryKey: ["panchayat-reports-map"],
    queryFn: () => customFetch("/api/panchayat/reports"),
    retry: false,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

function usePanchayatArchivedReports(enabled: boolean) {
  return useQuery<{ reports: PanchayatMapReport[]; total: number }>({
    queryKey: ["panchayat-reports-archived"],
    queryFn: () => customFetch("/api/panchayat/reports?archived=true"),
    retry: false,
    enabled,
  });
}

function useDeleteOfficer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/officers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panchayat-officers"] });
      queryClient.invalidateQueries({ queryKey: ["all-officers"] });
      queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] });
    },
  });
}

export default function MasterDashboard() {
  const { user } = useAuth();
  const isCommissioner = user?.role === "commissioner";
  const isUdupi = user?.panchayatName === "Udupi";
  // Show only the wards that belong to the logged-in admin's panchayat.
  // Use the geofences panchayat property for exact-match scoping rather than a
  // name-prefix heuristic — this stays correct regardless of future naming changes.
  const wardNames = useMemo(
    () => allWardNames.filter((n) => wardPanchayatMap[n] === user?.panchayatName),
    [user?.panchayatName],
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"dashboard" | "team">("dashboard");
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const relativeLastRefreshed = useRelativeTime(lastRefreshed);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["panchayat-officers"] }),
        queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["panchayat-reports-map"] }),
      ]);
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }
  const { data: officersData, isLoading: isLoadingOfficers, dataUpdatedAt: officersUpdatedAt } = usePanchayatOfficers(isCommissioner);
  const { data: stats, isLoading: isLoadingStats, dataUpdatedAt: statsUpdatedAt } = usePanchayatStats();
  const { data: hierarchyData } = useQuery<CommissionerHierarchy>({
    queryKey: ["commissioner-hierarchy"],
    queryFn: () => customFetch("/api/commissioner/hierarchy"),
    staleTime: 60_000,
    enabled: isCommissioner,
  });
  const { data: reportsData, dataUpdatedAt: reportsUpdatedAt } = usePanchayatReports();

  useEffect(() => {
    const latest = Math.max(officersUpdatedAt || 0, statsUpdatedAt || 0, reportsUpdatedAt || 0);
    if (latest > 0) setLastRefreshed(new Date(latest));
  }, [officersUpdatedAt, statsUpdatedAt, reportsUpdatedAt]);
  const createOfficer = useCreateOfficer();
  const deleteOfficer = useDeleteOfficer();
  const updateOfficer = useUpdateOfficer();
  const updateReport = useUpdateReport();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWard, setSelectedWard] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<PanchayatOfficer | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "reported" | "cleaning" | "cleaned">("all");
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null);
  const [mobileOfficerDetail, setMobileOfficerDetail] = useState<PanchayatOfficer | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const { data: archivedReportsData, isLoading: isLoadingArchived } = usePanchayatArchivedReports(archivedOpen);

  const archiveReportMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/panchayat/reports/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      toast({ title: "Report archived", description: "The report was moved to the archive." });
      setSelectedReport((prev) => (prev && prev.id === id ? null : prev));
      queryClient.invalidateQueries({ queryKey: ["panchayat-reports-map"] });
      queryClient.invalidateQueries({ queryKey: ["panchayat-reports-archived"] });
      queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] });
      queryClient.invalidateQueries({ queryKey: ["panchayat-officers"] });
    },
    onError: (err: any) =>
      toast({ title: "Failed to archive", description: err.message, variant: "destructive" }),
  });

  function handleArchiveReport(reportId: number) {
    archiveReportMutation.mutate(reportId);
  }

  const [deepLinkedReportId] = useState<number | null>(() => {
    const id = new URLSearchParams(window.location.search).get("report");
    return id ? parseInt(id, 10) : null;
  });
  const deepLinkedConsumedRef = useRef(false);

  async function handleReportStatusChange(reportId: number, newStatus: "cleaning" | "cleaned") {
    await new Promise<void>((resolve, reject) => {
      updateReport.mutate(
        { id: reportId, data: { status: newStatus } },
        {
          onSuccess: (updated) => {
            setSelectedReport((prev) =>
              prev && prev.id === reportId ? { ...prev, status: updated.status } : prev
            );
            queryClient.invalidateQueries({ queryKey: ["panchayat-reports-map"] });
            queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] });
            toast({ title: newStatus === "cleaning" ? "Marked as In Progress" : "Marked as Cleaned" });
            resolve();
          },
          onError: (err) => {
            toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
            reject(err);
          },
        }
      );
    });
  }

  function openReport(r: PanchayatMapReport, officerName?: string) {
    const officer = officers.find((o) => o.id === r.assignedOfficerId);
    setSelectedReport({
      id: r.id,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      status: r.status,
      wardName: (officer ?? null)?.areaName ?? null,
      officerName: officerName ?? officer?.name ?? null,
      imageUrl: r.imageUrls?.[0]?.url ?? r.imageUrl ?? null,
      imageUrls: r.imageUrls ?? null,
      cleanupImageUrl: r.cleanupImageUrl ?? null,
      cleanupImageUrls: r.cleanupImageUrls ?? null,
      reporterEmail: r.reporterEmail ?? null,
      createdAt: r.createdAt ?? null,
    });
  }

  const editForm = useForm<EditOfficerValues>({
    resolver: zodResolver(editOfficerSchema),
    defaultValues: { name: "", phone: "", email: "", password: "", confirmPassword: "" },
  });

  const officers = officersData?.officers ?? [];

  useEffect(() => {
    if (deepLinkedConsumedRef.current || !deepLinkedReportId || !reportsData) return;
    const found = reportsData.reports.find((r) => r.id === deepLinkedReportId);
    if (found) {
      openReport(found);
      deepLinkedConsumedRef.current = true;
    }
  // openReport reads `officers` — include it so the call sees the latest officer list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedReportId, reportsData, officers]);

  const form = useForm<CreateOfficerValues>({
    resolver: zodResolver(createOfficerSchema),
    defaultValues: { name: "", email: "", password: "", phone: "", areaName: "" },
  });

  const assignedWards = useMemo(
    () => new Set(officers.map((o) => o.areaName).filter(Boolean)),
    [officers]
  );

  const unassignedWards = wardNames.filter((w) => !assignedWards.has(w));

  function onSubmit(data: CreateOfficerValues) {
    createOfficer.mutate(
      { data: { ...data, areaName: data.areaName || undefined, phone: data.phone || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Field officer created" });
          setCreateOpen(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: ["panchayat-officers"] });
          queryClient.invalidateQueries({ queryKey: ["all-officers"] });
          queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] });
        },
        onError: (err) => {
          toast({ title: "Failed to create officer", description: err.message, variant: "destructive" });
        },
      }
    );
  }

  function handleDelete(id: number) {
    deleteOfficer.mutate(
      id,
      {
        onSuccess: () => {
          toast({ title: "Officer removed" });
          setSelectedWard(null);
          queryClient.invalidateQueries({ queryKey: ["panchayat-officers"] });
          queryClient.invalidateQueries({ queryKey: ["all-officers"] });
          queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] });
        },
        onError: (err) => toast({ title: "Failed to remove officer", description: err.message, variant: "destructive" }),
      }
    );
  }

  function openEdit(officer: PanchayatOfficer) {
    setEditingOfficer(officer);
    editForm.reset({ name: officer.name, phone: officer.phone ?? "", email: officer.email, password: "", confirmPassword: "" });
    setEditOpen(true);
  }

  function handleUpdate(data: EditOfficerValues) {
    if (!editingOfficer) return;
    const passwordChanged = !!data.password;
    const payload: Record<string, any> = { name: data.name, phone: data.phone || null };
    if (data.email && data.email !== editingOfficer.email) payload.email = data.email;
    if (passwordChanged) payload.password = data.password;
    updateOfficer.mutate(
      { id: editingOfficer.id, data: payload },
      {
        onSuccess: () => {
          toast({ title: passwordChanged ? "Password reset successfully" : "Officer updated" });
          setEditOpen(false);
          setEditingOfficer(null);
          queryClient.invalidateQueries({ queryKey: ["panchayat-officers"] });
          queryClient.invalidateQueries({ queryKey: ["all-officers"] });
        },
        onError: (err) => toast({ title: "Failed to update officer", description: err.message, variant: "destructive" }),
      }
    );
  }

  const isLoading = isLoadingOfficers || isLoadingStats;

  type StatFilter = "all" | "reported" | "cleaning" | "cleaned";
  const statCards: { label: string; value: number; icon: React.ReactNode; color: string; bg: string; activeBg: string; filter: StatFilter }[] = [
    { label: "Total", value: stats?.total ?? 0, icon: <LayoutList className="w-5 h-5" />, color: "text-foreground", bg: "bg-muted/60", activeBg: "bg-muted ring-2 ring-foreground/30", filter: "all" },
    { label: "New", value: stats?.reported ?? 0, icon: <AlertCircle className="w-5 h-5" />, color: "text-destructive", bg: "bg-destructive/8", activeBg: "bg-destructive/20 ring-2 ring-destructive/40", filter: "reported" },
    { label: "In Progress", value: stats?.cleaning ?? 0, icon: <Clock className="w-5 h-5" />, color: "text-blue-500", bg: "bg-blue-50", activeBg: "bg-blue-100 ring-2 ring-blue-400/40", filter: "cleaning" },
    { label: "Cleaned", value: stats?.cleaned ?? 0, icon: <CheckCircle2 className="w-5 h-5" />, color: "text-primary", bg: "bg-primary/8", activeBg: "bg-primary/20 ring-2 ring-primary/40", filter: "cleaned" },
  ];

  // Wards that have at least one report matching the active status filter
  const allReports = reportsData?.reports ?? [];
  // For Udupi, reports are not assigned to officer IDs (supervisors), so skip the
  // officer-based status filter — all wards are always visible in the coverage grid.
  const filteredWardNames = statusFilter === "all" || isUdupi
    ? wardNames
    : wardNames.filter((ward) => {
        const officer = officers.find((o) => o.areaName === ward);
        if (!officer) return false;
        return allReports.some((r) => r.assignedOfficerId === officer.id && r.status === statusFilter);
      });

  const completionRate =
    (stats?.total ?? 0) > 0 ? Math.round(((stats?.cleaned ?? 0) / stats!.total) * 100) : 0;

  // Flat list of Udupi supervisors extracted from the commissioner hierarchy (empty for panchayat admins)
  const udupiSupervisors = useMemo(() => {
    if (!isCommissioner || !hierarchyData?.environmentalEngineer) return [] as NonNullable<CommissionerHierarchy["environmentalEngineer"]>["healthInspectors"][number]["supervisors"];
    return hierarchyData.environmentalEngineer.healthInspectors.flatMap((hi) => hi.supervisors);
  }, [isCommissioner, hierarchyData]);

  // Officers grouped by panchayatName; Udupi group also carries supervisors
  const panchayatGroups = useMemo(() => {
    const map = new Map<string, PanchayatOfficer[]>();
    for (const o of officers) {
      const key = o.panchayatName ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries()).map(([panchayat, groupOfficers]) => ({
      panchayat,
      officers: groupOfficers,
      supervisors: panchayat === "Udupi" ? udupiSupervisors : ([] as typeof udupiSupervisors),
    }));
  }, [officers, udupiSupervisors]);

  // For Udupi panchayat admin: collapse the one-entry-per-ward officers array into
  // unique supervisors, each carrying all their ward names and summed counts.
  const udupiGroupedOfficers = useMemo(() => {
    if (!isUdupi) return [];
    const map = new Map<number, { id: number; name: string; phone: string; areaNames: string[]; reportCount: number; pendingCount: number }>();
    for (const o of officers) {
      if (!map.has(o.id)) {
        map.set(o.id, { id: o.id, name: o.name, phone: o.phone ?? "", areaNames: [], reportCount: 0, pendingCount: 0 });
      }
      const entry = map.get(o.id)!;
      if (o.areaName) entry.areaNames.push(o.areaName);
      entry.reportCount += o.reportCount ?? 0;
      entry.pendingCount += o.pendingCount ?? 0;
    }
    // Sort wards by numeric ward number for readability
    for (const entry of map.values()) {
      entry.areaNames.sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
        const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
        return na - nb;
      });
    }
    return Array.from(map.values());
  }, [isUdupi, officers]);

  // Guard: a missing panchayatName would silently show all wards and wrong data.
  // Render a clear error rather than a broken dashboard.
  if (user && !user.panchayatName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4 opacity-70" />
        <h2 className="text-xl font-black text-foreground mb-2">Panchayat not assigned</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          Your account is missing a panchayat assignment. Please contact your administrator to resolve this before accessing the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-12 animate-in fade-in duration-500 space-y-6">
      <NotificationCTABanner variant="officer" />

      {/* Commissioner: tab switcher */}
      {isCommissioner && (
        <div className="flex gap-2 bg-muted/50 p-1.5 rounded-2xl border border-border/50">
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all ${activeTab === "dashboard" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("team")}
            className={`flex-1 py-2 px-4 rounded-xl text-sm font-bold transition-all ${activeTab === "team" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Team Hierarchy
          </button>
        </div>
      )}

      {/* Commissioner Team tab */}
      {isCommissioner && activeTab === "team" && <CommissionerTeamView />}

      {/* Main dashboard (hidden when Team tab is active for commissioner) */}
      {(!isCommissioner || activeTab === "dashboard") && <>

      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-bl-[100px] pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              {getGreeting(user?.name)}
            </p>
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full mb-3 border border-indigo-200">
              <Users className="w-3.5 h-3.5" /> Panchayat Admin
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
              {user?.panchayatName ?? "My Panchayat"}
            </h1>
            <p className="text-muted-foreground font-medium">
              Manage field officers and ward-level sanitation reports
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh data"
              className="relative z-10 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/60 hover:bg-muted disabled:opacity-50 px-3 py-2 rounded-xl"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>Updated {relativeLastRefreshed}</span>
            </button>
            <ReportNumberSearch onFound={(r) => setSelectedReport(r)} />

            <Link
              href="/master/reports"
              title="View all reports"
              className="relative z-10 flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-2 rounded-xl"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>All Reports</span>
            </Link>

            <button
              type="button"
              onClick={() => setArchivedOpen(true)}
              title="View archived reports"
              className="relative z-10 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/60 hover:bg-muted px-3 py-2 rounded-xl"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archived Reports</span>
            </button>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="lg"
                className="h-12 rounded-2xl font-black shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white hover:-translate-y-1 transition-all"
              >
                <Plus className="w-5 h-5 mr-2" /> Add Field Officer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg rounded-[2rem] p-8 border-border/50 shadow-2xl">
              <DialogHeader className="mb-6">
                <DialogTitle className="text-2xl font-black">New Field Officer</DialogTitle>
                <p className="text-sm text-muted-foreground font-medium mt-1">
                  Will be assigned to <strong>{user?.panchayatName}</strong>
                </p>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Full Name</FormLabel>
                      <FormControl><Input placeholder="Officer Name" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Email</FormLabel>
                        <FormControl><Input placeholder="email@example.com" type="email" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold">Password</FormLabel>
                        <FormControl><Input type="text" placeholder="min 6 chars" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Phone <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                      <FormControl><Input placeholder="+91 98765 43210" {...field} className="rounded-xl h-11 bg-muted/50" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="areaName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Assigned Ward <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                      <Select onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)} value={field.value || "__none__"}>
                        <FormControl>
                          <SelectTrigger className="bg-muted/50 rounded-xl h-11 border-border/50">
                            <SelectValue placeholder="Select a ward…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__"><span className="text-muted-foreground">No ward assigned</span></SelectItem>
                          {wardNames.map((w) => (
                            <SelectItem key={w} value={w}>
                              <span className="flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                                {w}
                                {assignedWards.has(w) && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">Assigned</Badge>}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                    <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)} className="rounded-xl h-11">Cancel</Button>
                    <Button type="submit" className="rounded-xl h-11 font-black px-8 bg-indigo-600 hover:bg-indigo-700" disabled={createOfficer.isPending}>
                      {createOfficer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create Officer
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Stats */}
        {!isLoading && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCards.map((s) => {
              const isActive = statusFilter === s.filter;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setStatusFilter(isActive ? "all" : s.filter)}
                  className={`${isActive ? s.activeBg : s.bg} rounded-2xl px-4 py-3 flex items-center gap-3 transition-all duration-150 hover:brightness-95 active:scale-95 cursor-pointer text-left w-full`}
                  title={isActive ? "Show all wards" : `Filter by: ${s.label}`}
                >
                  <div className={`${s.color} shrink-0`}>{s.icon}</div>
                  <div>
                    <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground font-semibold">{s.label}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {!isLoading && (stats?.total ?? 0) > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Panchayat completion</span>
              <span className="text-xs font-black text-primary">{completionRate}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${completionRate}%` }} />
            </div>
          </div>
        )}
        {isLoading && (
          <div className="mt-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Loading stats…</span>
          </div>
        )}

        {/* Filtered reports list — visible when a status card is active */}
        {!isLoading && statusFilter !== "all" && (() => {
          const filtered = allReports.filter((r) => r.status === statusFilter);
          const label = statusFilter === "reported" ? "New" : statusFilter === "cleaning" ? "In Progress" : "Cleaned";
          const labelColor = statusFilter === "reported" ? "text-destructive bg-destructive/10" : statusFilter === "cleaning" ? "text-blue-600 bg-blue-50" : "text-primary bg-primary/10";
          return (
            <div className="mt-5 border-t border-border/40 pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${labelColor}`}>
                  {label} — {filtered.length} report{filtered.length !== 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <X className="w-3 h-3" /> Clear filter
                </button>
              </div>
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground font-medium text-center py-4">No reports with this status.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {filtered.map((r) => {
                    const officer = officers.find((o) => o.id === r.assignedOfficerId);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => openReport(r)}
                        className="flex items-start gap-3 bg-background rounded-xl px-3 py-2.5 border border-border/50 w-full text-left hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] transition-all"
                      >
                        <span className="text-[10px] font-black text-muted-foreground font-mono mt-0.5 shrink-0">#{r.id}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-snug truncate">
                            {r.address ?? `${r.latitude.toFixed(4)}° N, ${r.longitude.toFixed(4)}° E`}
                          </p>
                          {officer && (
                            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                              {officer.name} · <span className="font-semibold">Ward:</span> {officer.areaName}
                            </p>
                          )}
                          {r.createdAt && (
                            <p className="text-[10px] text-muted-foreground/70 font-medium mt-0.5">
                              {format(new Date(r.createdAt), "MMM d, h:mm a")}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-primary font-bold shrink-0 mt-0.5">View →</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Panchayat map */}
      <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-500" /> Ward Map
          </h2>
          <div className="flex items-center gap-3 text-[11px] font-bold text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> New</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" /> In Progress</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Cleaned</span>
          </div>
        </div>
        <PanchayatMap
          officers={officers}
          reports={reportsData?.reports ?? []}
          highlightedWard={selectedWard}
          onReportClick={(r) => openReport(r)}
          panchayatName={user?.panchayatName}
          requirePanchayat
        />
      </div>

      {/* Ward coverage */}
      {wardNames.length > 0 && (
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-black text-foreground flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-500" /> Ward Coverage
            </h2>
            {statusFilter !== "all" && (
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
                {filteredWardNames.length} of {wardNames.length} wards
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-medium mb-4">Tap a ward to see officer details and open reports</p>
          {filteredWardNames.length === 0 && statusFilter !== "all" ? (
            <p className="text-sm text-muted-foreground font-medium text-center py-6">No wards have reports with this status.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {filteredWardNames.map((ward) => {
                  const officer = officers.find((o) => o.areaName === ward);
                  const isSelected = selectedWard === ward;
                  return (
                    <button
                      key={ward}
                      type="button"
                      onClick={() => setSelectedWard(isSelected ? null : ward)}
                      className={`rounded-xl px-3 py-2.5 border text-sm font-semibold flex items-center gap-2 text-left transition-all duration-150 active:scale-95 ${
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground shadow-md ring-2 ring-primary/30"
                          : officer
                          ? "bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 hover:border-primary/40"
                          : "bg-muted/40 border-border/50 text-muted-foreground hover:bg-muted/70"
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? "bg-primary-foreground" : officer ? "bg-primary" : "bg-muted-foreground/40"}`} />
                      <span className="truncate">{ward}</span>
                    </button>
                  );
                })}
              </div>
              {unassignedWards.length > 0 && (
                <p className="text-xs text-amber-600 font-medium mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  {unassignedWards.length} ward{unassignedWards.length !== 1 ? "s" : ""} without an assigned officer
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Ward officer slide-out sheet */}
      {(() => {
        const wardOfficer = selectedWard ? officers.find((o) => o.areaName === selectedWard) : null;
        // For Udupi: reports carry a geographicWardName instead of assignedOfficerId, so we match by ward name.
        // For Saligrama: use the classic assignedOfficerId match.
        const allReportsForWard = wardOfficer
          ? (reportsData?.reports ?? []).filter((r) =>
              isUdupi
                ? r.geographicWardName === selectedWard
                : r.assignedOfficerId === wardOfficer.id
            )
          : [];
        const wardReports    = allReportsForWard.filter((r) => r.status !== "cleaned");
        const pendingCount   = allReportsForWard.filter((r) => r.status === "reported").length;
        const cleaningCount  = allReportsForWard.filter((r) => r.status === "cleaning").length;

        return (
          <Sheet open={!!selectedWard} onOpenChange={(open) => { if (!open) setSelectedWard(null); }}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
              {/* Header */}
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 p-6 pb-5">
                <SheetHeader className="mb-0">
                  <SheetTitle className="text-white text-lg font-black">{selectedWard}</SheetTitle>
                </SheetHeader>
                {wardOfficer ? (
                  <div className="flex items-center gap-3 mt-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white font-black text-xl shrink-0">
                      {wardOfficer.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-black text-base leading-tight truncate">{wardOfficer.name}</p>
                      <p className="text-indigo-200 text-xs font-medium mt-0.5">{isUdupi ? "Supervisor" : "Field Officer"}</p>
                    </div>
                    {!isUdupi && (
                      <button
                        type="button"
                        onClick={() => openEdit(wardOfficer)}
                        className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors shrink-0"
                        title="Edit officer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mt-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                      <Users className="w-6 h-6 text-white/50" />
                    </div>
                    <p className="text-white/70 font-medium text-sm">No officer assigned to this ward</p>
                  </div>
                )}
              </div>

              {wardOfficer && (
                <>
                  {/* Contact info */}
                  <div className="px-6 py-4 border-b border-border/50 space-y-2.5">
                    {wardOfficer.email && (
                      <a href={`mailto:${wardOfficer.email}`} className="flex items-center gap-3 text-sm text-foreground hover:text-primary transition-colors group">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Mail className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="truncate font-medium group-hover:underline">{wardOfficer.email}</span>
                      </a>
                    )}
                    {wardOfficer.phone && (
                      <a href={`tel:${wardOfficer.phone}`} className="flex items-center gap-3 text-sm text-foreground hover:text-primary transition-colors group">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Phone className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="font-medium group-hover:underline">{wardOfficer.phone}</span>
                      </a>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="px-6 py-4 border-b border-border/50">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center bg-red-50 rounded-xl py-3 border border-red-100">
                        <p className="text-2xl font-black text-red-600">{pendingCount}</p>
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mt-0.5">New</p>
                      </div>
                      <div className="text-center bg-blue-50 rounded-xl py-3 border border-blue-100">
                        <p className="text-2xl font-black text-blue-600">{cleaningCount}</p>
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mt-0.5">In Progress</p>
                      </div>
                      <div className="text-center bg-indigo-50 rounded-xl py-3 border border-indigo-100">
                        <p className="text-2xl font-black text-indigo-600">{wardOfficer.reportCount - wardOfficer.pendingCount}</p>
                        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide mt-0.5">Resolved</p>
                      </div>
                    </div>
                  </div>

                  {/* Pending reports list */}
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">
                      Open Reports ({wardReports.length})
                    </p>
                    {wardReports.length === 0 ? (
                      <div className="flex flex-col items-center py-10 text-center">
                        <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mb-3">
                          <CheckCircle2 className="w-7 h-7 text-green-500" />
                        </div>
                        <p className="font-black text-foreground">All clear!</p>
                        <p className="text-sm text-muted-foreground font-medium mt-1">No open reports for this ward</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {wardReports.map((report) => {
                          const isNew = report.status === "reported";
                          return (
                            <button
                              key={report.id}
                              type="button"
                              onClick={() => openReport(report, wardOfficer?.name)}
                              className="bg-muted/40 rounded-xl p-3 border border-border/40 w-full text-left hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] transition-all"
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">#{report.id}</span>
                                <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                  isNew
                                    ? "bg-red-100 text-red-700"
                                    : "bg-blue-100 text-blue-700"
                                }`}>
                                  {isNew ? "New" : "In Progress"}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                                {report.address ?? `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`}
                              </p>
                              <p className="text-[10px] text-primary font-bold mt-1.5">Tap to view photo →</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Officer actions footer — hidden for Udupi supervisors (read-only) */}
                  {!isUdupi && (
                    <div className="px-6 pb-6 pt-2 border-t border-border/50 flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl h-10 font-bold text-sm border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        onClick={() => openEdit(wardOfficer)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Details
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" className="rounded-xl h-10 font-bold text-sm border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 px-3">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-[2rem] p-8">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-black text-2xl">Remove Officer?</AlertDialogTitle>
                            <AlertDialogDescription className="text-base text-muted-foreground mt-3">
                              This will permanently delete <strong>{wardOfficer.name}</strong>. Assigned reports will become unassigned.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="mt-6 gap-2">
                            <AlertDialogCancel className="rounded-xl font-bold h-11">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive rounded-xl font-black h-11"
                              onClick={() => handleDelete(wardOfficer.id)}
                            >
                              Yes, remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </>
              )}
            </SheetContent>
          </Sheet>
        );
      })()}

      {/* Edit officer dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) { setEditOpen(false); setEditingOfficer(null); } }}>
        <DialogContent className="sm:max-w-sm rounded-[2rem] p-0 border-border/50 shadow-2xl overflow-hidden">
          <div className="px-7 pt-7 pb-4">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Pencil className="w-4 h-4" />
                </div>
                <DialogTitle className="text-xl font-black tracking-tight">Edit Officer</DialogTitle>
              </div>
              {editingOfficer && (
                <p className="text-sm text-muted-foreground font-medium mt-0.5 pl-12">{editingOfficer.email}</p>
              )}
            </DialogHeader>
          </div>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdate)} className="px-7 pb-7 space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-foreground">Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Officer Name" {...field} className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-foreground">
                      Phone <span className="text-muted-foreground font-medium ml-1">(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="+91 98765 43210" {...field} className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-foreground">Email (Login)</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="pt-1">
                <div className="flex items-center gap-2 mb-3">
                  <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground">Reset Password</span>
                  <span className="text-xs text-muted-foreground font-medium">(leave blank for no change)</span>
                </div>
                <div className="space-y-3">
                  <FormField
                    control={editForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold text-foreground text-sm">New Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Min 6 characters" {...field} className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold text-foreground text-sm">Confirm Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Re-enter new password" {...field} className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="flex-1 rounded-xl h-11 font-bold" onClick={() => { setEditOpen(false); setEditingOfficer(null); }}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 rounded-xl h-11 font-black bg-indigo-600 hover:bg-indigo-700" disabled={updateOfficer.isPending}>
                  {updateOfficer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Officer Zones — grouped by panchayat for commissioner, flat list for panchayat admin */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" /> Officer Zones
            <span className="text-sm font-bold text-muted-foreground ml-1">
              ({isUdupi ? udupiGroupedOfficers.length : officers.length + (isCommissioner ? udupiSupervisors.length : 0)})
            </span>
          </h2>
        </div>

        {isLoadingOfficers ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
            <p className="font-bold">Loading officers…</p>
          </div>
        ) : officers.length === 0 && udupiSupervisors.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-3xl flex flex-col items-center py-20 text-center">
            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-black text-foreground mb-1">No field officers yet</h3>
            <p className="text-muted-foreground font-medium mb-6">Add your first field officer to start managing ward cleanup.</p>
            <Button
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Field Officer
            </Button>
          </div>
        ) : isCommissioner ? (
          /* ── Grouped view for commissioner ─────────────────────────────────── */
          <div className="space-y-8">
            {panchayatGroups
              .filter((g) => g.officers.length > 0 || g.supervisors.length > 0)
              .map(({ panchayat, officers: groupOfficers, supervisors: groupSupervisors }) => (
                <div key={panchayat}>
                  {/* Panchayat section header */}
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-base font-black text-foreground">{panchayat} Panchayat</h3>
                    <Badge variant="secondary" className="text-xs font-bold rounded-full px-2">
                      {groupOfficers.length + groupSupervisors.length}
                    </Badge>
                  </div>

                  {/* Mobile: compact list */}
                  <div className="sm:hidden border border-border/50 rounded-2xl overflow-hidden bg-card divide-y divide-border/50 mb-3">
                    {groupOfficers.map((officer, i) => {
                      const color = ZONE_COLORS[i % ZONE_COLORS.length];
                      return (
                        <button
                          key={officer.id}
                          type="button"
                          onClick={() => setMobileOfficerDetail(officer)}
                          className="w-full flex items-center gap-3 p-3 text-left active:bg-muted/50 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0" style={{ background: color }}>
                            {officer.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-black text-foreground text-sm leading-tight truncate">{officer.name}</h3>
                            <p className="text-[11px] text-muted-foreground font-bold truncate">{officer.areaName || "No ward assigned"}</p>
                          </div>
                          {officer.pendingCount > 0 && (
                            <Badge className="bg-destructive/10 text-destructive border-destructive/20 shrink-0 text-[10px] font-black">{officer.pendingCount} pending</Badge>
                          )}
                        </button>
                      );
                    })}
                    {groupSupervisors.map((sv) => (
                      <div key={`sv-${sv.id}`} className="flex items-center gap-3 p-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0 bg-violet-500">
                          {sv.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-black text-foreground text-sm leading-tight truncate">{sv.name}</span>
                            <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[9px] font-black px-1.5 py-0 h-4 shrink-0">Supervisor</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-bold truncate">
                            {sv.wardNames?.join(", ") || "No wards assigned"}
                          </p>
                        </div>
                        {sv.reportedCount > 0 && (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/20 shrink-0 text-[10px] font-black">{sv.reportedCount} open</Badge>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop: cards grid */}
                  <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupOfficers.map((officer, i) => {
                      const color = ZONE_COLORS[i % ZONE_COLORS.length];
                      const resolvedCount = officer.reportCount - officer.pendingCount;
                      return (
                        <Card key={officer.id} className="rounded-xl border-border/50 p-3 relative overflow-hidden group hover:shadow-md transition-all">
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0" style={{ background: color }}>
                                {officer.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-black text-foreground text-sm leading-tight truncate">{officer.name}</h3>
                                <p className="text-[10px] text-muted-foreground font-bold truncate">{officer.areaName || "No ward assigned"}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 h-6 w-6 rounded-full" onClick={() => openEdit(officer)} title="Edit officer">
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-6 w-6 rounded-full">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-[2rem] p-8">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="font-black text-2xl">Remove Officer?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-base text-muted-foreground mt-3">
                                      This will permanently delete <strong>{officer.name}</strong>. Assigned reports will become unassigned.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter className="mt-6 gap-2">
                                    <AlertDialogCancel className="rounded-xl font-bold h-11">Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive rounded-xl font-black h-11" onClick={() => handleDelete(officer.id)}>Yes, remove</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="bg-muted/50 rounded-lg py-1.5 text-center border border-border/50">
                              <div className="text-sm font-black text-foreground leading-none mb-0.5">{officer.pendingCount}</div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Pending</div>
                            </div>
                            <div className="rounded-lg py-1.5 text-center border" style={{ background: `${color}10`, borderColor: `${color}30` }}>
                              <div className="text-sm font-black leading-none mb-0.5" style={{ color }}>{resolvedCount}</div>
                              <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>Resolved</div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                    {/* Supervisor cards — read-only, violet accent */}
                    {groupSupervisors.map((sv) => {
                      const wardList = sv.wardNames ?? [];
                      const cleaned = sv.totalCount - sv.reportedCount;
                      return (
                        <Card key={`sv-${sv.id}`} className="rounded-xl border-violet-200 p-3 relative overflow-hidden bg-violet-50/30 hover:shadow-md transition-all">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0 bg-violet-500">
                              {sv.name.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-black text-foreground text-sm leading-tight truncate">{sv.name}</h3>
                              <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[9px] font-black px-1.5 py-0 h-4">Supervisor</Badge>
                            </div>
                          </div>
                          {wardList.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {wardList.map((w) => (
                                <span key={w} className="text-[9px] font-bold bg-muted/60 border border-border/50 px-1.5 py-0.5 rounded-md text-muted-foreground">{w}</span>
                              ))}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="bg-muted/50 rounded-lg py-1.5 text-center border border-border/50">
                              <div className="text-sm font-black text-foreground leading-none mb-0.5">{sv.reportedCount}</div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Open</div>
                            </div>
                            <div className="rounded-lg py-1.5 text-center border bg-violet-50 border-violet-200">
                              <div className="text-sm font-black leading-none mb-0.5 text-violet-700">{cleaned}</div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-violet-600">Cleaned</div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        ) : isUdupi ? (
          /* ── Grouped supervisor cards for Udupi panchayat admin ─────────────── */
          <>
            {/* Mobile: compact list — one row per supervisor */}
            <div className="sm:hidden border border-border/50 rounded-2xl overflow-hidden bg-card divide-y divide-border/50">
              {udupiGroupedOfficers.map((sv, i) => {
                const color = ZONE_COLORS[i % ZONE_COLORS.length];
                return (
                  <div key={sv.id} className="flex items-center gap-3 p-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0" style={{ background: color }}>
                      {sv.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-foreground text-sm leading-tight truncate">{sv.name}</h3>
                      <p className="text-[11px] text-muted-foreground font-bold truncate">
                        {sv.areaNames.length > 0 ? sv.areaNames.map((n) => n.replace("Udupi ", "")).join(", ") : "No wards assigned"}
                      </p>
                    </div>
                    {sv.pendingCount > 0 && (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/20 shrink-0 text-[10px] font-black">
                        {sv.pendingCount} pending
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop/tablet: grouped supervisor cards with tappable ward chips */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {udupiGroupedOfficers.map((sv, i) => {
                const color = ZONE_COLORS[i % ZONE_COLORS.length];
                const resolvedCount = sv.reportCount - sv.pendingCount;
                return (
                  <Card key={sv.id} className="rounded-xl border-border/50 p-3 relative overflow-hidden hover:shadow-md transition-all">
                    {/* Supervisor name row */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0" style={{ background: color }}>
                        {sv.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-black text-foreground text-sm leading-tight truncate">{sv.name}</h3>
                        <p className="text-[10px] text-muted-foreground font-bold">{sv.areaNames.length} ward{sv.areaNames.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>

                    {/* Ward chips — each opens the ward slide-out */}
                    {sv.areaNames.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2.5">
                        {sv.areaNames.map((ward) => (
                          <button
                            key={ward}
                            type="button"
                            onClick={() => setSelectedWard(ward)}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-md border transition-colors hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 bg-muted/50 border-border/50 text-muted-foreground"
                          >
                            {ward.replace("Udupi ", "")}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Pending / Resolved stats */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="bg-muted/50 rounded-lg py-1.5 text-center border border-border/50">
                        <div className="text-sm font-black text-foreground leading-none mb-0.5">{sv.pendingCount}</div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Pending</div>
                      </div>
                      <div className="rounded-lg py-1.5 text-center border" style={{ background: `${color}10`, borderColor: `${color}30` }}>
                        <div className="text-sm font-black leading-none mb-0.5" style={{ color }}>{resolvedCount}</div>
                        <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>Resolved</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          /* ── Flat list for Saligrama panchayat admins (unchanged) ───────────── */
          <>
            {/* Mobile: compact tappable list (name + ward only) */}
            <div className="sm:hidden border border-border/50 rounded-2xl overflow-hidden bg-card divide-y divide-border/50">
              {officers.map((officer, i) => {
                const color = ZONE_COLORS[i % ZONE_COLORS.length];
                return (
                  <button
                    key={officer.id}
                    type="button"
                    onClick={() => setMobileOfficerDetail(officer)}
                    className="w-full flex items-center gap-3 p-3 text-left active:bg-muted/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0" style={{ background: color }}>
                      {officer.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-black text-foreground text-sm leading-tight truncate">{officer.name}</h3>
                      <p className="text-[11px] text-muted-foreground font-bold truncate">
                        {officer.areaName || "No ward assigned"}
                      </p>
                    </div>
                    {officer.pendingCount > 0 && (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/20 shrink-0 text-[10px] font-black">
                        {officer.pendingCount} pending
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Desktop/tablet: full detail cards */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {officers.map((officer, i) => {
                const color = ZONE_COLORS[i % ZONE_COLORS.length];
                const resolvedCount = officer.reportCount - officer.pendingCount;
                return (
                  <Card key={officer.id} className="rounded-xl border-border/50 p-3 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0" style={{ background: color }}>
                          {officer.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-black text-foreground text-sm leading-tight truncate">{officer.name}</h3>
                          <p className="text-[10px] text-muted-foreground font-bold truncate">
                            {officer.areaName || "No ward assigned"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 h-6 w-6 rounded-full"
                          onClick={() => openEdit(officer)}
                          title="Edit officer"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-6 w-6 rounded-full">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-[2rem] p-8">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-black text-2xl">Remove Officer?</AlertDialogTitle>
                              <AlertDialogDescription className="text-base text-muted-foreground mt-3">
                                This will permanently delete <strong>{officer.name}</strong>. Assigned reports will become unassigned.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-6 gap-2">
                              <AlertDialogCancel className="rounded-xl font-bold h-11">Cancel</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive rounded-xl font-black h-11" onClick={() => handleDelete(officer.id)}>
                                Yes, remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="bg-muted/50 rounded-lg py-1.5 text-center border border-border/50">
                        <div className="text-sm font-black text-foreground leading-none mb-0.5">{officer.pendingCount}</div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Pending</div>
                      </div>
                      <div className="rounded-lg py-1.5 text-center border" style={{ background: `${color}10`, borderColor: `${color}30` }}>
                        <div className="text-sm font-black leading-none mb-0.5" style={{ color }}>{resolvedCount}</div>
                        <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>Resolved</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Mobile officer detail sheet */}
      <Sheet open={mobileOfficerDetail !== null} onOpenChange={(open) => !open && setMobileOfficerDetail(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
          {mobileOfficerDetail && (() => {
            const officer = mobileOfficerDetail;
            const i = officers.findIndex((o) => o.id === officer.id);
            const color = ZONE_COLORS[(i < 0 ? 0 : i) % ZONE_COLORS.length];
            const resolvedCount = officer.reportCount - officer.pendingCount;
            return (
              <div className="pt-2 pb-4">
                <SheetHeader className="text-left mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg shrink-0" style={{ background: color }}>
                      {officer.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <SheetTitle className="font-black text-lg truncate">{officer.name}</SheetTitle>
                      <p className="text-xs text-muted-foreground font-medium">
                        Joined {format(new Date(officer.createdAt), "MMM yyyy")}
                      </p>
                    </div>
                  </div>
                </SheetHeader>

                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center gap-2 text-sm text-foreground/80 font-medium">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{officer.email}</span>
                  </div>
                  {officer.phone && (
                    <div className="flex items-center gap-2 text-sm text-foreground/80 font-medium">
                      <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span>{officer.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm font-bold bg-muted/30 px-2.5 py-2 rounded-lg">
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate">{officer.areaName || "No ward assigned"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-5">
                  <div className="bg-muted/50 rounded-xl p-3 text-center border border-border/50">
                    <div className="text-xl font-black text-foreground leading-none mb-0.5">{officer.pendingCount}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pending</div>
                  </div>
                  <div className="rounded-xl p-3 text-center border" style={{ background: `${color}10`, borderColor: `${color}30` }}>
                    <div className="text-xl font-black leading-none mb-0.5" style={{ color }}>{resolvedCount}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>Resolved</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl font-bold h-11"
                    onClick={() => {
                      setMobileOfficerDetail(null);
                      openEdit(officer);
                    }}
                  >
                    <Pencil className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="flex-1 rounded-xl font-bold h-11 text-destructive border-destructive/30 hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4 mr-2" /> Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-[2rem] p-8">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-black text-2xl">Remove Officer?</AlertDialogTitle>
                        <AlertDialogDescription className="text-base text-muted-foreground mt-3">
                          This will permanently delete <strong>{officer.name}</strong>. Assigned reports will become unassigned.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="mt-6 gap-2">
                        <AlertDialogCancel className="rounded-xl font-bold h-11">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive rounded-xl font-black h-11"
                          onClick={() => {
                            setMobileOfficerDetail(null);
                            handleDelete(officer.id);
                          }}
                        >
                          Yes, remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      <ReportDetailSheet
        report={selectedReport}
        open={selectedReport !== null}
        onClose={() => setSelectedReport(null)}
        onStatusChange={selectedReport?.deletedAt ? undefined : handleReportStatusChange}
        isUpdating={updateReport.isPending}
        onArchive={selectedReport?.deletedAt ? undefined : handleArchiveReport}
        isArchiving={archiveReportMutation.isPending}
      />

      <Sheet open={archivedOpen} onOpenChange={setArchivedOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-black">
              <Archive className="w-5 h-5" />
              Archived Reports
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {isLoadingArchived && (
              <div className="text-sm text-muted-foreground text-center py-8">Loading archived reports…</div>
            )}
            {!isLoadingArchived && (archivedReportsData?.reports.length ?? 0) === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">No archived reports yet.</div>
            )}
            {archivedReportsData?.reports.map((r) => {
              const officer = officers.find((o) => o.id === r.assignedOfficerId);
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelectedReport({
                      id: r.id,
                      address: r.address,
                      latitude: r.latitude,
                      longitude: r.longitude,
                      status: r.status,
                      wardName: officer?.areaName ?? null,
                      officerName: officer?.name ?? null,
                      imageUrl: r.imageUrls?.[0]?.url ?? r.imageUrl ?? null,
                      imageUrls: r.imageUrls ?? null,
                      cleanupImageUrl: r.cleanupImageUrl ?? null,
                      cleanupImageUrls: r.cleanupImageUrls ?? null,
                      reporterEmail: r.reporterEmail ?? null,
                      createdAt: r.createdAt ?? null,
                      deletedAt: (r as any).deletedAt ?? new Date().toISOString(),
                    });
                  }}
                  className="w-full text-left rounded-xl border border-border/60 p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">
                      {r.address ?? `${r.latitude.toFixed(4)}° N, ${r.longitude.toFixed(4)}° E`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {officer?.name ?? "Unassigned"}
                      {r.createdAt ? ` · ${format(new Date(r.createdAt), "MMM d, yyyy")}` : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 capitalize">{r.status}</Badge>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      </> /* end main dashboard fragment */}
    </div>
  );
}
