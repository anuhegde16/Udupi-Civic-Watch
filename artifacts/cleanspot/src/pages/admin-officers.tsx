import { useState } from "react";
import {
  useListOfficers,
  useCreateOfficer,
  useDeleteOfficer,
  useUpdateOfficer,
  getListOfficersQueryKey,
} from "@workspace/api-client-react";
import type { Officer, OfficerList } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OfficerZonesMap } from "@/components/officer-zones-map";
import { OfficerAreaEditMap } from "@/components/officer-area-edit-map";

const UDUPI_CENTER = { lat: 13.3409, lng: 74.7421 };
const ZONE_COLORS = ["#0d9488", "#f59e0b", "#f43f5e", "#8b5cf6", "#3b82f6", "#10b981"];

const createOfficerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional(),
  areaName: z.string().optional(),
  centerLat: z.coerce.number().optional().or(z.literal("")),
  centerLng: z.coerce.number().optional().or(z.literal("")),
  radiusKm: z.coerce.number().optional().or(z.literal("")),
});

type CreateOfficerValues = z.infer<typeof createOfficerSchema>;

interface OfficerZoneDraft {
  officerId: number;
  name: string;
  email: string;
  areaName: string;
  lat: number;
  lng: number;
  radiusKm: number;
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

  const form = useForm<CreateOfficerValues>({
    resolver: zodResolver(createOfficerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      areaName: "",
      centerLat: undefined,
      centerLng: undefined,
      radiusKm: undefined,
    },
  });

  const officers = officersData?.officers || [];

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
      radiusKm: officer.radiusKm ?? 8,
      colorIdx: idx,
    });
  }

  const onSubmit = (data: CreateOfficerValues) => {
    const cleanData = {
      ...data,
      centerLat: data.centerLat === "" ? undefined : data.centerLat,
      centerLng: data.centerLng === "" ? undefined : data.centerLng,
      radiusKm: data.radiusKm === "" ? undefined : data.radiusKm,
    };

    createOfficer.mutate(
      { data: cleanData },
      {
        onSuccess: () => {
          toast({ title: "Officer created successfully" });
          setCreateModalOpen(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListOfficersQueryKey() });
        },
        onError: (err) => {
          toast({
            title: "Failed to create officer",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
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

  const handleSaveZone = () => {
    if (!editingZone) return;
    const snapshot = editingZone;
    updateOfficer.mutate(
      {
        id: snapshot.officerId,
        data: {
          areaName: snapshot.areaName !== "" ? snapshot.areaName : null,
          centerLat: snapshot.lat,
          centerLng: snapshot.lng,
          radiusKm: snapshot.radiusKm,
        },
      },
      {
        onMutate: async () => {
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
                      radiusKm: snapshot.radiusKm,
                    }
                  : o
              ),
            };
          });
          return { previous };
        },
        onError: (err, _vars, context: { previous?: OfficerList } | undefined) => {
          if (context?.previous) {
            queryClient.setQueryData<OfficerList>(getListOfficersQueryKey(), context.previous);
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
            <DialogContent className="sm:max-w-2xl rounded-[2rem] p-8 border-border/50 shadow-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader className="mb-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <Shield className="w-7 h-7" />
                </div>
                <DialogTitle className="text-3xl font-black font-display tracking-tight">
                  New Officer
                </DialogTitle>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                              placeholder="jane@cleanspot.city"
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
                          <MapPin className="w-5 h-5" /> Coastal Sector Assignment
                        </h3>
                        <p className="text-sm text-foreground/70 font-medium">
                          Assign a specific beach or coastal zone for this officer to manage.
                        </p>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="areaName"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="font-bold text-foreground">
                            Sector Name{" "}
                            <span className="text-muted-foreground font-medium ml-1">(Optional)</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Malpe Beach South"
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
                      name="centerLat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-foreground">Center Lat</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="13.3409"
                              type="number"
                              step="any"
                              {...field}
                              value={field.value ?? ""}
                              className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="centerLng"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-foreground">Center Lng</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="74.7421"
                              type="number"
                              step="any"
                              {...field}
                              value={field.value ?? ""}
                              className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="radiusKm"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="font-bold text-foreground">Radius (km)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="5"
                              type="number"
                              step="any"
                              {...field}
                              value={field.value ?? ""}
                              className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="pt-6 flex justify-end gap-3 mt-8 border-t border-border/50 pt-8">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {officers.map((officer, i) => {
            const color = ZONE_COLORS[i % ZONE_COLORS.length];
            return (
              <div
                key={officer.id}
                className="bg-card rounded-3xl shadow-sm border border-border/50 p-6 md:p-8 flex flex-col hover:border-primary/30 transition-all hover:shadow-lg group relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 cursor-pointer"
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => openZoneEditor(officer.id)}
              >
                <div
                  className="absolute top-0 right-0 w-24 h-24 rounded-bl-[80px] transition-transform duration-500 group-hover:scale-125"
                  style={{ background: `${color}10` }}
                />

                <div className="flex items-start justify-between mb-6 relative z-10">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 font-display shadow-inner text-white"
                      style={{ background: color }}
                    >
                      {officer.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-black text-foreground text-xl leading-tight mb-1 group-hover:text-primary transition-colors">
                        {officer.name}
                      </h3>
                      <p className="text-sm text-muted-foreground font-medium">
                        Joined {format(new Date(officer.createdAt), "MMM yyyy")}
                      </p>
                    </div>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-2 -mr-2 h-10 w-10 rounded-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-5 h-5" />
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

                <div className="space-y-3 mb-6 flex-1 relative z-10">
                  <div className="flex items-center gap-3 text-sm text-foreground/80 font-medium">
                    <Mail className="w-5 h-5 text-muted-foreground shrink-0" />
                    <span className="truncate">{officer.email}</span>
                  </div>
                  {officer.phone && (
                    <div className="flex items-center gap-3 text-sm text-foreground/80 font-medium">
                      <Phone className="w-5 h-5 text-muted-foreground shrink-0" />
                      <span>{officer.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm text-foreground font-bold bg-muted/30 p-3 rounded-xl">
                    <MapPin className="w-5 h-5 text-primary shrink-0" />
                    <span>{officer.areaName || "Unassigned"}</span>
                  </div>
                  {officer.centerLat != null && officer.radiusKm != null ? (
                    <div className="text-xs font-mono text-muted-foreground bg-muted/20 rounded-lg p-2 leading-relaxed">
                      {officer.centerLat.toFixed(4)}, {officer.centerLng?.toFixed(4)} &bull;{" "}
                      {officer.radiusKm} km radius
                    </div>
                  ) : (
                    <div className="text-xs text-amber-600 font-medium bg-amber-50 rounded-lg p-2 border border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/30 dark:text-amber-400">
                      No zone set — click Edit Zone to define coverage area.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 relative z-10 mb-4">
                  <div className="bg-muted/50 rounded-2xl p-4 text-center border border-border/50">
                    <div className="text-3xl font-black text-foreground mb-1 font-display">
                      {officer.pendingCount}
                    </div>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Pending
                    </div>
                  </div>
                  <div
                    className="rounded-2xl p-4 text-center border"
                    style={{ background: `${color}10`, borderColor: `${color}30` }}
                  >
                    <div className="text-3xl font-black mb-1 font-display" style={{ color }}>
                      {officer.reportCount - officer.pendingCount}
                    </div>
                    <div className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
                      Resolved
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full rounded-2xl h-11 font-bold border-border/60 hover:border-primary/40 hover:bg-primary/5 relative z-10"
                  onClick={(e) => { e.stopPropagation(); openZoneEditor(officer.id); }}
                >
                  <Map className="w-4 h-4 mr-2" style={{ color }} />
                  Edit Zone
                </Button>
              </div>
            );
          })}
        </div>
      )}

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
                      radiusKm={editingZone.radiusKm}
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
                      onRadiusChange={(r) =>
                        setEditingZone((z) => (z ? { ...z, radiusKm: r } : z))
                      }
                      height="280px"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-bold text-sm text-foreground">Radius</label>
                    <span
                      className="text-sm font-black px-3 py-1 rounded-full"
                      style={{ background: `${zoneColor}18`, color: zoneColor }}
                    >
                      {editingZone.radiusKm} km
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={50}
                    step={0.5}
                    value={[editingZone.radiusKm]}
                    onValueChange={([val]) =>
                      setEditingZone((z) => (z ? { ...z, radiusKm: val } : z))
                    }
                  />
                  <div className="flex justify-between text-xs text-muted-foreground font-medium mt-2">
                    <span>1 km</span>
                    <span>50 km</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-xs text-muted-foreground block mb-1.5 uppercase tracking-wide">
                      Latitude
                    </label>
                    <Input
                      type="number"
                      step="any"
                      value={editingZone.lat}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) setEditingZone((z) => (z ? { ...z, lat: v } : z));
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
                      value={editingZone.lng}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) setEditingZone((z) => (z ? { ...z, lng: v } : z));
                      }}
                      className="bg-muted/50 rounded-xl h-10 font-mono text-sm border-border/50"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-xs text-muted-foreground block mb-1.5 uppercase tracking-wide">
                      Radius km
                    </label>
                    <Input
                      type="number"
                      step="0.5"
                      min={1}
                      max={50}
                      value={editingZone.radiusKm}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v >= 1 && v <= 50)
                          setEditingZone((z) => (z ? { ...z, radiusKm: v } : z));
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
