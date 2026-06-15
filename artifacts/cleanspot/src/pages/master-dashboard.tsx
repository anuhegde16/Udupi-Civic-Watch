import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, useCreateOfficer } from "@workspace/api-client-react";
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

const wardNames: string[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "ward")
  .map((f) => (f.properties as any)?.name ?? "");

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

function usePanchayatOfficers() {
  return useQuery<{ officers: PanchayatOfficer[]; total: number }>({
    queryKey: ["panchayat-officers"],
    queryFn: () => customFetch("/api/panchayat/officers"),
    retry: false,
  });
}

function usePanchayatStats() {
  return useQuery<PanchayatStats>({
    queryKey: ["panchayat-stats"],
    queryFn: () => customFetch("/api/panchayat/stats"),
    retry: false,
  });
}

function usePanchayatReports() {
  return useQuery<{ reports: PanchayatMapReport[]; total: number }>({
    queryKey: ["panchayat-reports-map"],
    queryFn: () => customFetch("/api/panchayat/reports"),
    retry: false,
    refetchInterval: 60_000,
  });
}

function useDeleteOfficer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/officers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["panchayat-officers"] });
      queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] });
    },
  });
}

export default function MasterDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: officersData, isLoading: isLoadingOfficers } = usePanchayatOfficers();
  const { data: stats, isLoading: isLoadingStats } = usePanchayatStats();
  const { data: reportsData } = usePanchayatReports();
  const createOfficer = useCreateOfficer();
  const deleteOfficer = useDeleteOfficer();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWard, setSelectedWard] = useState<string | null>(null);

  const officers = officersData?.officers ?? [];

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
      { id },
      {
        onSuccess: () => {
          toast({ title: "Officer removed" });
          queryClient.invalidateQueries({ queryKey: ["panchayat-officers"] });
          queryClient.invalidateQueries({ queryKey: ["panchayat-stats"] });
        },
        onError: (err) => toast({ title: "Failed to remove officer", description: err.message, variant: "destructive" }),
      }
    );
  }

  const isLoading = isLoadingOfficers || isLoadingStats;

  const statCards = [
    { label: "Total", value: stats?.total ?? 0, icon: <LayoutList className="w-5 h-5" />, color: "text-foreground", bg: "bg-muted/60" },
    { label: "New", value: stats?.reported ?? 0, icon: <AlertCircle className="w-5 h-5" />, color: "text-destructive", bg: "bg-destructive/8" },
    { label: "In Progress", value: stats?.cleaning ?? 0, icon: <Clock className="w-5 h-5" />, color: "text-orange-500", bg: "bg-orange-50" },
    { label: "Cleaned", value: stats?.cleaned ?? 0, icon: <CheckCircle2 className="w-5 h-5" />, color: "text-primary", bg: "bg-primary/8" },
  ];

  const completionRate =
    (stats?.total ?? 0) > 0 ? Math.round(((stats?.cleaned ?? 0) / stats!.total) * 100) : 0;

  return (
    <div className="pb-12 animate-in fade-in duration-500 space-y-6">
      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-bl-[100px] pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
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
                  <div className="grid grid-cols-2 gap-3">
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

        {/* Stats */}
        {!isLoading && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCards.map((s) => (
              <div key={s.label} className={`${s.bg} rounded-2xl px-4 py-3 flex items-center gap-3`}>
                <div className={`${s.color} shrink-0`}>{s.icon}</div>
                <div>
                  <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground font-semibold">{s.label}</div>
                </div>
              </div>
            ))}
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
      </div>

      {/* Panchayat map */}
      <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-500" /> Ward Map
          </h2>
          <div className="flex items-center gap-3 text-[11px] font-bold text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> New</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> In Progress</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Cleaned</span>
          </div>
        </div>
        <PanchayatMap
          officers={officers}
          reports={reportsData?.reports ?? []}
          highlightedWard={selectedWard}
        />
      </div>

      {/* Ward coverage */}
      {wardNames.length > 0 && (
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6">
          <h2 className="text-xl font-black text-foreground mb-1 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-500" /> Ward Coverage
          </h2>
          <p className="text-xs text-muted-foreground font-medium mb-4">Tap a ward to see officer details and open reports</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {wardNames.map((ward) => {
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
        </div>
      )}

      {/* Ward officer slide-out sheet */}
      {(() => {
        const wardOfficer = selectedWard ? officers.find((o) => o.areaName === selectedWard) : null;
        const wardReports = wardOfficer
          ? (reportsData?.reports ?? []).filter(
              (r) => r.assignedOfficerId === wardOfficer.id && r.status !== "cleaned"
            )
          : [];
        const pendingCount = wardOfficer
          ? (reportsData?.reports ?? []).filter(
              (r) => r.assignedOfficerId === wardOfficer.id && r.status === "reported"
            ).length
          : 0;
        const cleaningCount = wardOfficer
          ? (reportsData?.reports ?? []).filter(
              (r) => r.assignedOfficerId === wardOfficer.id && r.status === "cleaning"
            ).length
          : 0;

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
                      <p className="text-indigo-200 text-xs font-medium mt-0.5">Field Officer</p>
                    </div>
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
                      <div className="text-center bg-amber-50 rounded-xl py-3 border border-amber-100">
                        <p className="text-2xl font-black text-amber-600">{cleaningCount}</p>
                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide mt-0.5">In Progress</p>
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
                            <div
                              key={report.id}
                              className="bg-muted/40 rounded-xl p-3 border border-border/40"
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">#{report.id}</span>
                                <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                  isNew
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}>
                                  {isNew ? "New" : "In Progress"}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                                {report.address ?? `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </SheetContent>
          </Sheet>
        );
      })()}

      {/* Officers list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" /> Field Officers
            <span className="text-sm font-bold text-muted-foreground ml-1">({officers.length})</span>
          </h2>
        </div>

        {isLoadingOfficers ? (
          <div className="flex flex-col items-center py-20 text-muted-foreground">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
            <p className="font-bold">Loading officers…</p>
          </div>
        ) : officers.length === 0 ? (
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {officers.map((officer, i) => {
              const color = ZONE_COLORS[i % ZONE_COLORS.length];
              const resolvedCount = officer.reportCount - officer.pendingCount;
              return (
                <Card key={officer.id} className="rounded-2xl border-border/50 p-5 relative overflow-hidden group hover:shadow-md transition-all">
                  <div className="absolute top-0 right-0 w-16 h-16 rounded-bl-[60px] transition-transform duration-500 group-hover:scale-125" style={{ background: `${color}15` }} />
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base shrink-0" style={{ background: color }}>
                        {officer.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-black text-foreground text-sm leading-tight mb-0.5">{officer.name}</h3>
                        <p className="text-[10px] text-muted-foreground font-medium">
                          Joined {format(new Date(officer.createdAt), "MMM yyyy")}
                        </p>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 w-7 rounded-full -mt-1 -mr-1">
                          <Trash2 className="w-3.5 h-3.5" />
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

                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center gap-2 text-xs text-foreground/80 font-medium">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{officer.email}</span>
                    </div>
                    {officer.phone && (
                      <div className="flex items-center gap-2 text-xs text-foreground/80 font-medium">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>{officer.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs font-bold bg-muted/30 px-2 py-1.5 rounded-lg">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{officer.areaName || "No ward assigned"}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/50 rounded-xl p-2.5 text-center border border-border/50">
                      <div className="text-lg font-black text-foreground leading-none mb-0.5">{officer.pendingCount}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pending</div>
                    </div>
                    <div className="rounded-xl p-2.5 text-center border" style={{ background: `${color}10`, borderColor: `${color}30` }}>
                      <div className="text-lg font-black leading-none mb-0.5" style={{ color }}>{resolvedCount}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>Resolved</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
