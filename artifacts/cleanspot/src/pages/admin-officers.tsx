import { useState, useEffect } from "react";
import {
  useListOfficers,
  useCreateOfficer,
  useDeleteOfficer,
  useUpdateOfficer,
  getListOfficersQueryKey,
} from "@workspace/api-client-react";
import type { Officer, OfficerList } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Loader2,
  Plus,
  Users,
  MapPin,
  Phone,
  Mail,
  Trash2,
  Shield,
  Map,
  Save,
  Pencil,
  KeyRound,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OfficerZonesMap } from "@/components/officer-zones-map";
import { OfficerAreaEditMap } from "@/components/officer-area-edit-map";
import geofencesData from "@/data/geofences.json";

const UDUPI_CENTER = { lat: 13.3409, lng: 74.7421 };
const ZONE_COLORS = ["#f97316", "#8b5cf6", "#f43f5e", "#3b82f6", "#10b981", "#ec4899"];

const panchayatNames: string[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "district")
  .map((f) => (f.properties as any)?.name ?? "")
  .filter(Boolean);

const allWardNames: string[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "ward")
  .map((f) => (f.properties as any)?.name ?? "Zone");

// Ward features don't carry an explicit panchayat — all wards belong to the single district.
// When multiple panchayats are added, add a "panchayat" property to each ward feature.
const wardsByPanchayat: Record<string, string[]> = {};
panchayatNames.forEach((p) => { wardsByPanchayat[p] = allWardNames; });

const geoZoneNames = allWardNames;

const createOfficerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional(),
  panchayatName: z.string().min(1, "Panchayat is required"),
  areaName: z.string().optional(),
});

type CreateOfficerValues = z.infer<typeof createOfficerSchema>;

const editDetailsSchema = z.object({
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

type EditDetailsValues = z.infer<typeof editDetailsSchema>;

interface OfficerZoneDraft {
  officerId: number;
  name: string;
  email: string;
  areaName: string;
  lat: number;
  lng: number;
  colorIdx: number;
}

export default function AdminOfficers() {
  const { data: officersData, isLoading } = useListOfficers();
  const createOfficer = useCreateOfficer();
  const deleteOfficer = useDeleteOfficer();
  const updateOfficer = useUpdateOfficer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<OfficerZoneDraft | null>(null);
  const [pendingSubmitData, setPendingSubmitData] = useState<CreateOfficerValues | null>(null);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [editDetailsOfficer, setEditDetailsOfficer] = useState<(typeof officers)[0] | null>(null);
  const [expandedOfficers, setExpandedOfficers] = useState<Set<number>>(new Set());

  function toggleExpanded(id: number) {
    setExpandedOfficers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const editDetailsForm = useForm<EditDetailsValues>({
    resolver: zodResolver(editDetailsSchema),
    defaultValues: { name: "", phone: "", email: "", password: "", confirmPassword: "" },
  });

  // Local string state for coordinate inputs — updated on blur, not every keystroke
  const [latStr, setLatStr] = useState("");
  const [lngStr, setLngStr] = useState("");

  // Keep string inputs in sync when editingZone changes externally (map drag)
  useEffect(() => {
    if (!editingZone) return;
    setLatStr(editingZone.lat.toFixed(6));
    setLngStr(editingZone.lng.toFixed(6));
  }, [editingZone?.lat, editingZone?.lng]);

  const form = useForm<CreateOfficerValues>({
    resolver: zodResolver(createOfficerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      panchayatName: "",
      areaName: "",
    },
  });

  const selectedPanchayat = useWatch({ control: form.control, name: "panchayatName" });
  const visibleWards = selectedPanchayat ? (wardsByPanchayat[selectedPanchayat] ?? []) : [];

  const officers = officersData?.officers || [];

  // areaName → officer name for wards already taken
  const assignedWardsMap: Record<string, string> = Object.fromEntries(
    officers
      .filter((o) => o.areaName)
      .map((o) => [o.areaName as string, o.name])
  );

  function openZoneEditor(id: number) {
    const idx = officers.findIndex((o) => o.id === id);
    if (idx === -1) return;
    const officer = officers[idx];
    setEditingZone({
      officerId: officer.id,
      name: officer.name,
      email: officer.email,
      areaName: officer.areaName ?? "",
      lat: officer.centerLat ?? UDUPI_CENTER.lat,
      lng: officer.centerLng ?? UDUPI_CENTER.lng,
      colorIdx: idx,
    });
  }

  function openEditDetails(officer: (typeof officers)[0]) {
    setEditDetailsOfficer(officer);
    editDetailsForm.reset({ name: officer.name, phone: officer.phone ?? "", email: officer.email, password: "", confirmPassword: "" });
    setEditDetailsOpen(true);
  }

  function handleSaveDetails(data: EditDetailsValues) {
    if (!editDetailsOfficer) return;
    const passwordChanged = !!data.password;
    const payload: Record<string, any> = { name: data.name, phone: data.phone || null };
    if (data.email && data.email !== editDetailsOfficer.email) payload.email = data.email;
    if (passwordChanged) payload.password = data.password;
    updateOfficer.mutate(
      { id: editDetailsOfficer.id, data: payload },
      {
        onSuccess: () => {
          toast({ title: passwordChanged ? "Password reset successfully" : "Officer updated" });
          setEditDetailsOpen(false);
          setEditDetailsOfficer(null);
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
        },
        onError: (err) => {
          toast({ title: "Failed to update officer", description: err.message, variant: "destructive" });
        },
      }
    );
  }

  const doCreateOfficer = (data: CreateOfficerValues) => {
    const cleanData = {
      ...data,
      areaName: data.areaName || undefined,
      panchayatName: data.panchayatName,
    };
    createOfficer.mutate(
      { data: cleanData },
      {
        onSuccess: () => {
          toast({ title: "Officer created successfully" });
          setCreateModalOpen(false);
          setPendingSubmitData(null);
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
        },
        onError: (err) => {
          setPendingSubmitData(null);
          toast({
            title: "Failed to create officer",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const onSubmit = (data: CreateOfficerValues) => {
    if (data.areaName && assignedWardsMap[data.areaName]) {
      setPendingSubmitData(data);
      return;
    }
    doCreateOfficer(data);
  };

  const handleDelete = (id: number) => {
    deleteOfficer.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Officer removed" });
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
        },
        onError: (err) => {
          toast({
            title: "Failed to remove officer",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSaveZone = async () => {
    if (!editingZone) return;
    const snapshot = editingZone;

    // Optimistic update before firing the mutation
    await queryClient.cancelQueries({ queryKey: getListOfficersQueryKey() });
    const previous = queryClient.getQueryData<OfficerList>(getListOfficersQueryKey());
    queryClient.setQueryData<OfficerList>(getListOfficersQueryKey(), (old) => {
      if (!old) return old;
      return {
        ...old,
        officers: old.officers.map((o: Officer) =>
          o.id === snapshot.officerId
            ? {
                ...o,
                areaName: snapshot.areaName !== "" ? snapshot.areaName : null,
                centerLat: snapshot.lat,
                centerLng: snapshot.lng,
              }
            : o
        ),
      };
    });

    updateOfficer.mutate(
      {
        id: snapshot.officerId,
        data: {
          areaName: snapshot.areaName !== "" ? snapshot.areaName : null,
          centerLat: snapshot.lat,
          centerLng: snapshot.lng,
        },
      },
      {
        onError: (err) => {
          // Rollback optimistic update on error
          if (previous) {
            queryClient.setQueryData<OfficerList>(getListOfficersQueryKey(), previous);
          }
          toast({
            title: "Failed to save zone",
            description: err.message,
            variant: "destructive",
          });
        },
        onSuccess: () => {
          toast({
            title: "Zone saved",
            description: `${snapshot.name}'s coverage area has been updated.`,
          });
          setEditingZone(null);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
        },
      }
    );
  };

  const zoneColor = editingZone
    ? ZONE_COLORS[editingZone.colorIdx % ZONE_COLORS.length]
    : "#0d9488";

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-[120px] pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <div>
            <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">Team Roster</h1>
            <p className="text-muted-foreground font-medium text-lg">
              Manage coastal sanitation officers and their assigned zones.
            </p>
          </div>

          <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
            <DialogTrigger asChild>
              <Button
                size="lg"
                className="h-14 rounded-2xl font-black shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground hover:-translate-y-1 transition-all"
              >
                <Plus className="w-5 h-5 mr-2" /> Add Officer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl rounded-[2rem] p-0 border-border/50 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="px-8 pt-8 pb-4 shrink-0">
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <DialogTitle className="text-2xl font-black tracking-tight">
                      New Officer
                    </DialogTitle>
                  </div>
                </DialogHeader>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
                  <div className="overflow-y-auto flex-1 px-8 py-2 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="font-bold text-foreground">Full Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Jane Doe"
                              {...field}
                              className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-medium"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-foreground">Email (Login)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="officer@udupicivicwatch.in"
                              type="email"
                              {...field}
                              className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-medium"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-foreground">Temporary Password</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="min 6 characters"
                              {...field}
                              className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-medium"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="font-bold text-foreground">
                            Phone{" "}
                            <span className="text-muted-foreground font-medium ml-1">(Optional)</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="+91 98765 43210"
                              {...field}
                              className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-medium"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="md:col-span-2 pt-4 pb-2">
                      <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                        <h3 className="font-black text-primary flex items-center gap-2 mb-1">
                          <MapPin className="w-5 h-5" /> Service Zone Assignment
                        </h3>
                        <p className="text-sm text-foreground/70 font-medium">
                          Select the panchayat first, then assign the ward. Reports in that ward will be auto-routed to this officer.
                        </p>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="panchayatName"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="font-bold text-foreground">Panchayat</FormLabel>
                          <Select
                            onValueChange={(v) => {
                              field.onChange(v);
                              form.setValue("areaName", "");
                            }}
                            value={field.value || ""}
                          >
                            <FormControl>
                              <SelectTrigger className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium">
                                <SelectValue placeholder="Select panchayat…" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {panchayatNames.map((p) => (
                                <SelectItem key={p} value={p}>
                                  <span className="flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                                    {p}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="areaName"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="font-bold text-foreground">
                            Ward{" "}
                            <span className="text-muted-foreground font-medium ml-1">(Optional)</span>
                          </FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                            value={field.value || "__none__"}
                            disabled={!selectedPanchayat}
                          >
                            <FormControl>
                              <SelectTrigger className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium">
                                <SelectValue placeholder={selectedPanchayat ? "Select a ward…" : "Select panchayat first"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-56 overflow-y-auto">
                              <SelectItem value="__none__">
                                <span className="text-muted-foreground">No ward assigned</span>
                              </SelectItem>
                              {visibleWards.map((wardName) => {
                                const assignedTo = assignedWardsMap[wardName];
                                return (
                                  <SelectItem key={wardName} value={wardName}>
                                    <span className="flex items-center gap-2 min-w-0">
                                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                                      <span className="font-medium">{wardName}</span>
                                      {assignedTo && (
                                        <span className="ml-1 text-[11px] text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
                                          {assignedTo}
                                        </span>
                                      )}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  </div>{/* end scroll area */}

                  <div className="shrink-0 px-8 pb-8 pt-4 border-t border-border/50 flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setCreateModalOpen(false)}
                      className="rounded-xl h-12 font-bold px-6"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-xl h-12 font-black px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                      disabled={createOfficer.isPending}
                    >
                      {createOfficer.isPending ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      ) : null}
                      Create Officer
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <AlertDialog
        open={!!pendingSubmitData}
        onOpenChange={(open) => { if (!open) setPendingSubmitData(null); }}
      >
        <AlertDialogContent className="rounded-[2rem] p-8 border-border/50 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-2xl text-foreground font-display">
              Ward already assigned
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-muted-foreground mt-3 leading-relaxed">
              {pendingSubmitData?.areaName && assignedWardsMap[pendingSubmitData.areaName] ? (
                <>
                  <span className="font-semibold text-foreground">{pendingSubmitData.areaName}</span>
                  {" is already assigned to "}
                  <span className="font-semibold text-foreground">{assignedWardsMap[pendingSubmitData.areaName]}</span>
                  {". Do you want to reassign it to the new officer?"}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3 sm:gap-0">
            <AlertDialogCancel
              className="rounded-xl font-bold h-12 px-6 border-border/50"
              onClick={() => setPendingSubmitData(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl font-black h-12 px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
              onClick={() => { if (pendingSubmitData) doCreateOfficer(pendingSubmitData); }}
            >
              Reassign Ward
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!isLoading && officers.length > 0 && (
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm overflow-hidden mb-8">
          <div className="flex items-center gap-3 px-6 pt-6 pb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Map className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-foreground text-lg leading-tight">Zone Overview</h2>
              <p className="text-muted-foreground text-sm font-medium">
                Click a zone or officer label to edit boundaries.
              </p>
            </div>
          </div>
          <div className="overflow-hidden" style={{ height: "360px" }}>
            <OfficerZonesMap
              officers={officers}
              onOfficerClick={openZoneEditor}
              height="360px"
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-[2.5rem] border border-border/50 border-dashed shadow-sm">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-6" />
          <p className="font-bold text-lg text-foreground">Loading officers...</p>
        </div>
      ) : officers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-[2.5rem] border border-border/50 border-dashed text-center px-4 shadow-sm">
          <div className="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-6">
            <Users className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-2xl font-black text-foreground mb-3">No officers on roster</h3>
          <p className="text-muted-foreground font-medium max-w-md">
            Add your first sanitation officer to start assigning coastal cleanup reports.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {officers.map((officer, i) => {
            const color = ZONE_COLORS[i % ZONE_COLORS.length];
            const isExpanded = expandedOfficers.has(officer.id);
            const hasZone = officer.centerLat != null;
            const resolved = officer.reportCount - officer.pendingCount;
            return (
              <div
                key={officer.id}
                className="bg-card rounded-2xl shadow-sm border border-border/50 hover:border-primary/30 transition-all hover:shadow-md group relative overflow-hidden animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Decorative corner */}
                <div
                  className="absolute top-0 right-0 w-14 h-14 rounded-bl-[50px] transition-transform duration-500 group-hover:scale-125 pointer-events-none"
                  style={{ background: `${color}12` }}
                />

                {/* Collapsed header — always visible, click toggles expand */}
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 relative z-10 text-left"
                  onClick={() => toggleExpanded(officer.id)}
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0 text-white"
                    style={{ background: color }}
                  >
                    {officer.name.charAt(0)}
                  </div>

                  {/* Name + subtitle */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-sm leading-tight truncate group-hover:text-primary transition-colors">
                      {officer.name}
                    </p>
                    {officer.areaName ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary/80 bg-primary/8 px-1.5 py-0.5 rounded-md mt-0.5">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                        {officer.areaName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md mt-0.5 border border-amber-200">
                        No zone
                      </span>
                    )}
                  </div>

                  {/* Stats pills */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="flex flex-col items-center px-1.5 py-0.5 rounded-lg bg-muted/60 border border-border/40 min-w-[32px]">
                      <span className="text-sm font-black text-foreground leading-none">{officer.pendingCount}</span>
                      <span className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground">pend</span>
                    </span>
                    <span className="flex flex-col items-center px-1.5 py-0.5 rounded-lg min-w-[32px]" style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
                      <span className="text-sm font-black leading-none" style={{ color }}>{resolved}</span>
                      <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color }}>done</span>
                    </span>
                  </div>

                  {/* Chevron */}
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Delete button — always visible, outside the toggle button */}
                <div className="absolute top-1.5 right-1.5 z-20">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-full text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                        title="Remove officer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-[2rem] p-8 border-border/50 shadow-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-black text-3xl text-foreground font-display">
                          Remove Officer?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-lg text-muted-foreground font-medium mt-4 leading-relaxed">
                          This will permanently delete{" "}
                          <strong className="text-foreground">{officer.name}</strong> from the
                          system. Any currently assigned reports will become unassigned. This action
                          cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="mt-8 gap-3 sm:gap-0">
                        <AlertDialogCancel className="rounded-xl font-bold h-12 px-6 border-border/50">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/20 rounded-xl font-black h-12 px-6"
                          onClick={() => handleDelete(officer.id)}
                        >
                          Yes, remove officer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Expandable body */}
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border/30 mt-0">
                      <div className="pt-2 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-foreground/80 font-medium">
                          <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{officer.email}</span>
                        </div>
                        {officer.phone && (
                          <div className="flex items-center gap-2 text-xs text-foreground/80 font-medium">
                            <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>{officer.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {hasZone ? (
                            <span className="font-mono text-[11px]">
                              {officer.centerLat!.toFixed(4)}, {officer.centerLng?.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium text-[11px]">No zone set</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground/50">
                          Joined {format(new Date(officer.createdAt), "MMM yyyy")}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <Button
                          variant="outline"
                          className="rounded-xl h-8 text-xs font-bold border-border/60 hover:border-primary/40 hover:bg-primary/5"
                          onClick={(e) => { e.stopPropagation(); openEditDetails(officer); }}
                        >
                          <Pencil className="w-3 h-3 mr-1.5" />
                          Edit Details
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl h-8 text-xs font-bold border-border/60 hover:border-primary/40 hover:bg-primary/5"
                          onClick={(e) => { e.stopPropagation(); openZoneEditor(officer.id); }}
                        >
                          <Map className="w-3 h-3 mr-1.5" style={{ color }} />
                          Edit Zone
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={editDetailsOpen} onOpenChange={(open) => { if (!open) { setEditDetailsOpen(false); setEditDetailsOfficer(null); } }}>
        <DialogContent className="sm:max-w-sm rounded-[2rem] p-0 border-border/50 shadow-2xl overflow-hidden">
          <div className="px-7 pt-7 pb-4">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Pencil className="w-4 h-4" />
                </div>
                <DialogTitle className="text-xl font-black tracking-tight">Edit Officer</DialogTitle>
              </div>
              {editDetailsOfficer && (
                <p className="text-sm text-muted-foreground font-medium mt-0.5 pl-12">{editDetailsOfficer.panchayatName ?? ""}</p>
              )}
            </DialogHeader>
          </div>
          <Form {...editDetailsForm}>
            <form onSubmit={editDetailsForm.handleSubmit(handleSaveDetails)} className="px-7 pb-7 space-y-4">
              <FormField
                control={editDetailsForm.control}
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
                control={editDetailsForm.control}
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
                control={editDetailsForm.control}
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
                    control={editDetailsForm.control}
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
                    control={editDetailsForm.control}
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
                <Button type="button" variant="outline" className="flex-1 rounded-xl h-11 font-bold" onClick={() => { setEditDetailsOpen(false); setEditDetailsOfficer(null); }}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 rounded-xl h-11 font-black" disabled={updateOfficer.isPending}>
                  {updateOfficer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Sheet
        open={!!editingZone}
        onOpenChange={(open) => {
          if (!open) setEditingZone(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-y-auto">
          {editingZone && (
            <div className="flex flex-col min-h-full">
              <SheetHeader className="px-6 pt-8 pb-4 border-b border-border/50">
                <div className="flex items-center gap-4 mb-1">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black text-white shadow-inner shrink-0"
                    style={{ background: zoneColor }}
                  >
                    {editingZone.name.charAt(0)}
                  </div>
                  <div>
                    <SheetTitle className="font-black text-2xl leading-tight">
                      {editingZone.name}
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground font-medium">{editingZone.email}</p>
                  </div>
                </div>
              </SheetHeader>

              <div className="px-6 py-6 space-y-6 flex-1">
                <div>
                  <label className="font-bold text-sm text-foreground block mb-2">
                    Sector / Area Name
                  </label>
                  <Input
                    value={editingZone.areaName}
                    onChange={(e) =>
                      setEditingZone((z) => (z ? { ...z, areaName: e.target.value } : z))
                    }
                    placeholder="e.g. Udupi Taluk North"
                    className="bg-muted/50 rounded-xl h-11 font-medium border-border/50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-bold text-sm text-foreground">Coverage Zone</label>
                    <span className="text-xs text-muted-foreground font-medium">
                      Drag the dot or click map to move centre
                    </span>
                  </div>
                  <div
                    className="rounded-2xl overflow-hidden border border-border/50"
                    style={{ height: 280 }}
                  >
                    <OfficerAreaEditMap
                      lat={editingZone.lat}
                      lng={editingZone.lng}
                      areaName={editingZone.areaName}
                      color={zoneColor}
                      onCenterChange={(lat, lng) =>
                        setEditingZone((z) =>
                          z
                            ? {
                                ...z,
                                lat: parseFloat(lat.toFixed(6)),
                                lng: parseFloat(lng.toFixed(6)),
                              }
                            : z
                        )
                      }
                      height="280px"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-xs text-muted-foreground block mb-1.5 uppercase tracking-wide">
                      Latitude
                    </label>
                    <Input
                      type="number"
                      step="any"
                      value={latStr}
                      onChange={(e) => setLatStr(e.target.value)}
                      onBlur={() => {
                        const v = parseFloat(latStr);
                        if (!isNaN(v)) {
                          setEditingZone((z) => (z ? { ...z, lat: v } : z));
                        } else {
                          setLatStr(editingZone.lat.toFixed(6));
                        }
                      }}
                      className="bg-muted/50 rounded-xl h-10 font-mono text-sm border-border/50"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-xs text-muted-foreground block mb-1.5 uppercase tracking-wide">
                      Longitude
                    </label>
                    <Input
                      type="number"
                      step="any"
                      value={lngStr}
                      onChange={(e) => setLngStr(e.target.value)}
                      onBlur={() => {
                        const v = parseFloat(lngStr);
                        if (!isNaN(v)) {
                          setEditingZone((z) => (z ? { ...z, lng: v } : z));
                        } else {
                          setLngStr(editingZone.lng.toFixed(6));
                        }
                      }}
                      className="bg-muted/50 rounded-xl h-10 font-mono text-sm border-border/50"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-6 border-t border-border/50 bg-muted/20">
                <Button
                  className="w-full h-12 rounded-2xl font-black text-base shadow-lg text-white"
                  style={{ background: zoneColor }}
                  onClick={handleSaveZone}
                  disabled={updateOfficer.isPending}
                >
                  {updateOfficer.isPending ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5 mr-2" />
                  )}
                  Save Zone
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
