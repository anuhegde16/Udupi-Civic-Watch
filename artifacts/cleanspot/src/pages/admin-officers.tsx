import { useMemo, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Loader2,
  Plus,
  Users,
  MapPin,
  Phone,
  Mail,
  Trash2,
  Shield,
  Map as MapIcon,
  Pencil,
  KeyRound,
  ChevronDown,
  Search,
  UserCog,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OfficerZonesMap, type StaffZone } from "@/components/officer-zones-map";
import {
  PANCHAYAT_NAMES,
  PANCHAYAT_WARDS,
  STAFF_COLORS,
  STAFF_LABELS,
  STAFF_ORDER,
  STAFF_SHORT_LABELS,
  hasDerivedWards,
  keyToSupervisorWard,
  staffTypesForPanchayat,
  supervisorWardToKey,
  supportsMultipleWards,
  usesPhoneLogin,
  wardChipLabel,
  type StaffMember,
  type StaffRosterResponse,
  type StaffType,
} from "@/lib/staff-roster";

const STAFF_QUERY_KEY = ["control-center", "staff"] as const;

// ── Forms ────────────────────────────────────────────────────────────────────

const createStaffSchema = z
  .object({
    panchayatName: z.string().min(1, "Panchayat is required"),
    staffType: z.string().min(1, "Role is required"),
    name: z.string().min(2, "Name is required"),
    email: z.string().optional(),
    phone: z.string().optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    healthInspectorId: z.string().optional(),
    environmentalEngineerId: z.string().optional(),
    wardKeys: z.array(z.string()).default([]),
  })
  .superRefine((d, ctx) => {
    const type = d.staffType as StaffType;
    if (!type) return;
    if (usesPhoneLogin(type)) {
      const digits = (d.phone ?? "").replace(/\D/g, "");
      if (digits.length < 10) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "A 10-digit phone number is required" });
      }
    } else if (!d.email || !/^\S+@\S+\.\S+$/.test(d.email)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Valid email is required" });
    }
    if (type === "supervisor" && !d.healthInspectorId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["healthInspectorId"], message: "Choose the reporting health inspector" });
    }
    if (type === "community_mobiliser" && d.wardKeys.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["wardKeys"], message: "Select exactly one ward" });
    }
    // Udupi field officers see reports by ward, so one without a ward would
    // log in to a permanently empty dashboard. Saligrama field officers work
    // from per-report assignments and may be created without one.
    if (type === "field_officer" && d.panchayatName === "Udupi" && d.wardKeys.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["wardKeys"], message: "Select the ward this officer covers" });
    }
  });

type CreateStaffValues = z.infer<typeof createStaffSchema>;

const editStaffSchema = z
  .object({
    name: z.string().min(2, "Name is required"),
    email: z.string().optional(),
    phone: z.string().optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
    healthInspectorId: z.string().optional(),
    wardKeys: z.array(z.string()).default([]),
  })
  .refine((d) => !d.password || d.password.length >= 6, {
    message: "Password must be at least 6 characters",
    path: ["password"],
  })
  .refine((d) => !d.password || d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type EditStaffValues = z.infer<typeof editStaffSchema>;

// ── Small presentational helpers ─────────────────────────────────────────────

function RoleBadge({ staffType }: { staffType: StaffType }) {
  const color = STAFF_COLORS[staffType];
  return (
    <span
      className="inline-flex items-center text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md shrink-0"
      style={{ color, background: `${color}14`, border: `1px solid ${color}33` }}
    >
      {STAFF_SHORT_LABELS[staffType]}
    </span>
  );
}

function WardChips({ wardKeys, limit = 3 }: { wardKeys: string[]; limit?: number }) {
  if (!wardKeys.length) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
        No ward
      </span>
    );
  }
  const shown = wardKeys.slice(0, limit);
  const rest = wardKeys.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((w) => (
        <span
          key={w}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary/80 bg-primary/8 px-1.5 py-0.5 rounded-md"
        >
          <MapPin className="w-2.5 h-2.5 shrink-0" />
          {wardChipLabel(w)}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[10px] font-bold text-muted-foreground">+{rest}</span>
      )}
    </span>
  );
}

/**
 * Compact ward line for the collapsed card header. Long ward names and
 * many-ward supervisors would otherwise blow out the row, so anything past a
 * single ward collapses to a count.
 */
function WardSummary({ staffType, wardKeys }: { staffType: StaffType; wardKeys: string[] }) {
  if (hasDerivedWards(staffType)) {
    return (
      <span className="text-[10px] font-semibold text-muted-foreground truncate">
        {wardKeys.length ? `${wardKeys.length} wards via team` : "Full panchayat"}
      </span>
    );
  }
  if (!wardKeys.length) {
    return (
      <span className="text-[10px] font-semibold text-amber-600 shrink-0">No ward</span>
    );
  }
  if (wardKeys.length === 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary/80 min-w-0 max-w-full">
        <MapPin className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate">{wardChipLabel(wardKeys[0])}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary/80 shrink-0">
      <MapPin className="w-2.5 h-2.5 shrink-0" />
      {wardKeys.length} wards
    </span>
  );
}

/** Multi-select ward picker used by both the create and edit forms. */
function WardPicker({
  wards,
  value,
  onChange,
  multiple,
  disabled,
}: {
  wards: string[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple: boolean;
  disabled?: boolean;
}) {
  const toggle = (ward: string) => {
    if (disabled) return;
    if (multiple) {
      onChange(value.includes(ward) ? value.filter((w) => w !== ward) : [...value, ward]);
    } else {
      onChange(value.includes(ward) ? [] : [ward]);
    }
  };

  if (!wards.length) {
    return <p className="text-sm text-muted-foreground font-medium">Select a panchayat first.</p>;
  }

  return (
    <div className="max-h-48 overflow-y-auto rounded-xl border border-border/50 bg-muted/30 p-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
      {wards.map((ward) => {
        const selected = value.includes(ward);
        return (
          <button
            key={ward}
            type="button"
            disabled={disabled}
            onClick={() => toggle(ward)}
            className={`text-left text-xs font-semibold px-2 py-1.5 rounded-lg border transition-colors ${
              selected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border/50 hover:border-primary/40 text-foreground"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {wardChipLabel(ward)}
          </button>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminOfficers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<StaffRosterResponse>({
    queryKey: STAFF_QUERY_KEY,
    queryFn: () => customFetch<StaffRosterResponse>("/api/control-center/staff"),
  });

  const staff = useMemo(() => data?.staff ?? [], [data]);

  const [panchayatFilter, setPanchayatFilter] = useState<string>("all");
  const [wardFilter, setWardFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createStaff = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch("/api/control-center/staff", { method: "POST", body: JSON.stringify(body) }),
  });

  const updateStaff = useMutation({
    mutationFn: ({ staffType, id, body }: { staffType: StaffType; id: number; body: Record<string, unknown> }) =>
      customFetch(`/api/control-center/staff/${staffType}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  });

  const removeStaff = useMutation({
    mutationFn: ({ staffType, id }: { staffType: StaffType; id: number }) =>
      customFetch(`/api/control-center/staff/${staffType}/${id}`, { method: "DELETE" }),
  });

  // ── Filtering ──────────────────────────────────────────────────────────────

  const wardOptions = panchayatFilter === "all" ? [] : PANCHAYAT_WARDS[panchayatFilter] ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return staff
      .filter((s) => panchayatFilter === "all" || s.panchayatName === panchayatFilter)
      .filter((s) => wardFilter === "all" || s.wardKeys.includes(wardFilter))
      .filter((s) => roleFilter === "all" || s.staffType === roleFilter)
      .filter(
        (s) =>
          !term ||
          s.name.toLowerCase().includes(term) ||
          (s.email ?? "").toLowerCase().includes(term) ||
          (s.phone ?? "").includes(term)
      )
      .sort((a, b) => {
        const p = (a.panchayatName ?? "").localeCompare(b.panchayatName ?? "");
        if (p !== 0) return p;
        const r = STAFF_ORDER[a.staffType] - STAFF_ORDER[b.staffType];
        if (r !== 0) return r;
        return a.name.localeCompare(b.name);
      });
  }, [staff, panchayatFilter, wardFilter, roleFilter, search]);

  const mapZones: StaffZone[] = useMemo(
    () =>
      filtered
        .filter((s) => !hasDerivedWards(s.staffType))
        .filter((s) => s.wardKeys.length > 0 || s.centerLat != null)
        .map((s) => ({
          key: s.key,
          name: s.name,
          wardKeys: s.wardKeys,
          centerLat: s.centerLat,
          centerLng: s.centerLng,
        })),
    [filtered]
  );

  const counts = useMemo(() => {
    const byType = new Map<StaffType, number>();
    for (const s of filtered) byType.set(s.staffType, (byType.get(s.staffType) ?? 0) + 1);
    return byType;
  }, [filtered]);

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Create form ────────────────────────────────────────────────────────────

  const createForm = useForm<CreateStaffValues>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: {
      panchayatName: "",
      staffType: "",
      name: "",
      email: "",
      phone: "",
      password: "",
      healthInspectorId: "",
      environmentalEngineerId: "",
      wardKeys: [],
    },
  });

  const createPanchayat = useWatch({ control: createForm.control, name: "panchayatName" });
  const createType = useWatch({ control: createForm.control, name: "staffType" }) as StaffType | "";
  const createWardKeys = useWatch({ control: createForm.control, name: "wardKeys" }) ?? [];

  const availableTypes = createPanchayat ? staffTypesForPanchayat(createPanchayat) : [];
  const createWards = createPanchayat ? PANCHAYAT_WARDS[createPanchayat] ?? [] : [];

  const inspectorOptions = useMemo(
    () => staff.filter((s) => s.staffType === "health_inspector" && s.panchayatName === createPanchayat),
    [staff, createPanchayat]
  );
  const engineerOptions = useMemo(
    () => staff.filter((s) => s.staffType === "environmental_engineer" && s.panchayatName === createPanchayat),
    [staff, createPanchayat]
  );

  function submitCreate(values: CreateStaffValues) {
    const type = values.staffType as StaffType;
    const body: Record<string, unknown> = {
      staffType: type,
      name: values.name.trim(),
      panchayatName: values.panchayatName,
      password: values.password,
    };
    if (usesPhoneLogin(type)) body.phone = values.phone?.trim();
    else body.email = values.email?.trim();
    if (values.phone?.trim() && !usesPhoneLogin(type)) body.phone = values.phone.trim();

    if (type === "supervisor") {
      body.healthInspectorId = Number(values.healthInspectorId);
      body.wardNames = values.wardKeys
        .map(keyToSupervisorWard)
        .filter((w): w is string => Boolean(w));
    } else if (type === "health_inspector") {
      if (values.environmentalEngineerId) body.environmentalEngineerId = Number(values.environmentalEngineerId);
    } else if (type === "field_officer" || type === "community_mobiliser") {
      body.wardNames = values.wardKeys.slice(0, 1);
    }

    createStaff.mutate(body, {
      onSuccess: () => {
        toast({ title: `${STAFF_LABELS[type]} added` });
        setCreateOpen(false);
        createForm.reset();
        invalidate();
      },
      onError: (err: any) =>
        toast({ title: "Could not add staff member", description: err?.message, variant: "destructive" }),
    });
  }

  // ── Edit form ──────────────────────────────────────────────────────────────

  const editForm = useForm<EditStaffValues>({
    resolver: zodResolver(editStaffSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      healthInspectorId: "",
      wardKeys: [],
    },
  });

  const editWardKeys = useWatch({ control: editForm.control, name: "wardKeys" }) ?? [];

  function openEdit(member: StaffMember) {
    setEditTarget(member);
    editForm.reset({
      name: member.name,
      email: member.email ?? "",
      phone: member.phone ?? "",
      password: "",
      confirmPassword: "",
      healthInspectorId: member.parentId ? String(member.parentId) : "",
      wardKeys: member.wardKeys,
    });
  }

  function submitEdit(values: EditStaffValues) {
    if (!editTarget) return;
    const type = editTarget.staffType;
    const body: Record<string, unknown> = { name: values.name.trim() };

    if (usesPhoneLogin(type)) {
      if (values.phone?.trim()) body.phone = values.phone.trim();
    } else {
      if (values.email?.trim() && values.email.trim() !== editTarget.email) body.email = values.email.trim();
      body.phone = values.phone?.trim() ?? "";
    }
    if (values.password) body.password = values.password;

    // Only send ward assignment when it actually changed. The server recomputes a
    // staff member's map centre from the ward polygon whenever wardNames is present,
    // which would silently relocate a field officer's hand-placed zone dot on an
    // unrelated edit such as a rename or password change.
    const wardsChanged =
      values.wardKeys.length !== editTarget.wardKeys.length ||
      values.wardKeys.some((w) => !editTarget.wardKeys.includes(w));

    if (type === "supervisor") {
      if (wardsChanged) {
        body.wardNames = values.wardKeys
          .map(keyToSupervisorWard)
          .filter((w): w is string => Boolean(w));
      }
      if (values.healthInspectorId && Number(values.healthInspectorId) !== editTarget.parentId) {
        body.healthInspectorId = Number(values.healthInspectorId);
      }
    } else if ((type === "field_officer" || type === "community_mobiliser") && wardsChanged) {
      body.wardNames = values.wardKeys.slice(0, 1);
    }

    updateStaff.mutate(
      { staffType: type, id: editTarget.id, body },
      {
        onSuccess: () => {
          toast({ title: values.password ? "Password changed" : "Staff details updated" });
          setEditTarget(null);
          invalidate();
        },
        onError: (err: any) =>
          toast({ title: "Could not save changes", description: err?.message, variant: "destructive" }),
      }
    );
  }

  function handleRemove(member: StaffMember) {
    removeStaff.mutate(
      { staffType: member.staffType, id: member.id },
      {
        onSuccess: () => {
          toast({ title: `${member.name} removed` });
          invalidate();
        },
        onError: (err: any) =>
          toast({ title: "Could not remove staff member", description: err?.message, variant: "destructive" }),
      }
    );
  }

  const editInspectorOptions = useMemo(
    () =>
      editTarget
        ? staff.filter((s) => s.staffType === "health_inspector" && s.panchayatName === editTarget.panchayatName)
        : [],
    [staff, editTarget]
  );
  const editWards = editTarget?.panchayatName ? PANCHAYAT_WARDS[editTarget.panchayatName] ?? [] : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden mb-6">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-[120px] pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <div>
            <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">Team Roster</h1>
            <p className="text-muted-foreground font-medium text-lg">
              Every sanitation staff member across Udupi and Saligrama, with their assigned wards.
            </p>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="lg"
                className="h-14 rounded-2xl font-black shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground hover:-translate-y-1 transition-all"
              >
                <Plus className="w-5 h-5 mr-2" /> Add Staff
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl rounded-[2rem] p-0 border-border/50 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
              <div className="px-8 pt-8 pb-4 shrink-0">
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <DialogTitle className="text-2xl font-black tracking-tight">New Staff Member</DialogTitle>
                  </div>
                </DialogHeader>
              </div>

              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(submitCreate)} className="flex flex-col flex-1 min-h-0">
                  <div className="overflow-y-auto flex-1 px-8 py-2 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <FormField
                        control={createForm.control}
                        name="panchayatName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-bold text-foreground">Panchayat</FormLabel>
                            <Select
                              onValueChange={(v) => {
                                field.onChange(v);
                                createForm.setValue("staffType", "");
                                createForm.setValue("wardKeys", []);
                                createForm.setValue("healthInspectorId", "");
                                createForm.setValue("environmentalEngineerId", "");
                              }}
                              value={field.value || ""}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium">
                                  <SelectValue placeholder="Select panchayat…" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PANCHAYAT_NAMES.map((p) => (
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
                        control={createForm.control}
                        name="staffType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-bold text-foreground">Role</FormLabel>
                            <Select
                              onValueChange={(v) => {
                                field.onChange(v);
                                createForm.setValue("wardKeys", []);
                              }}
                              value={field.value || ""}
                              disabled={!createPanchayat}
                            >
                              <FormControl>
                                <SelectTrigger className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium">
                                  <SelectValue placeholder={createPanchayat ? "Select role…" : "Select panchayat first"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableTypes.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {STAFF_LABELS[t]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={createForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel className="font-bold text-foreground">Full Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Jane Doe"
                                {...field}
                                className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {createType && usesPhoneLogin(createType) ? (
                        <FormField
                          control={createForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-bold text-foreground">Phone (Login)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="98765 43210"
                                  {...field}
                                  className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <FormField
                          control={createForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="font-bold text-foreground">Email (Login)</FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  placeholder="officer@udupicivicwatch.in"
                                  {...field}
                                  className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={createForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-bold text-foreground">Temporary Password</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                placeholder="min 6 characters"
                                {...field}
                                className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {createType === "supervisor" && (
                        <FormField
                          control={createForm.control}
                          name="healthInspectorId"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel className="font-bold text-foreground">Reports To (Health Inspector)</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium">
                                    <SelectValue placeholder="Select health inspector…" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {inspectorOptions.map((hi) => (
                                    <SelectItem key={hi.id} value={String(hi.id)}>
                                      {hi.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {createType === "health_inspector" && engineerOptions.length > 0 && (
                        <FormField
                          control={createForm.control}
                          name="environmentalEngineerId"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel className="font-bold text-foreground">
                                Reports To (Environmental Engineer)
                              </FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || ""}>
                                <FormControl>
                                  <SelectTrigger className="bg-muted/50 rounded-xl h-12 border-border/50 font-medium">
                                    <SelectValue placeholder="Default engineer for this panchayat" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {engineerOptions.map((ee) => (
                                    <SelectItem key={ee.id} value={String(ee.id)}>
                                      {ee.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    {createType && !hasDerivedWards(createType) && (
                      <FormField
                        control={createForm.control}
                        name="wardKeys"
                        render={({ field }) => (
                          <FormItem>
                            <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 mb-3">
                              <h3 className="font-black text-primary flex items-center gap-2 mb-1">
                                <MapPin className="w-5 h-5" /> Ward Assignment
                              </h3>
                              <p className="text-sm text-foreground/70 font-medium">
                                {supportsMultipleWards(createType)
                                  ? "Supervisors cover several wards — pick all of them."
                                  : "Reports inside this ward are routed to this staff member."}
                              </p>
                            </div>
                            <WardPicker
                              wards={createWards}
                              value={field.value ?? []}
                              onChange={field.onChange}
                              multiple={supportsMultipleWards(createType)}
                            />
                            {createWardKeys.length > 0 && (
                              <p className="text-xs text-muted-foreground font-medium mt-2">
                                {createWardKeys.length} ward{createWardKeys.length === 1 ? "" : "s"} selected
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {createType && hasDerivedWards(createType) && (
                      <div className="rounded-xl border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground font-medium">
                        Ward coverage for a {STAFF_LABELS[createType].toLowerCase()} is derived from the
                        supervisors beneath them — no direct ward assignment needed.
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 px-8 pb-8 pt-4 border-t border-border/50 flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setCreateOpen(false)}
                      className="rounded-xl h-12 font-bold px-6"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-xl h-12 font-black px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                      disabled={createStaff.isPending}
                    >
                      {createStaff.isPending && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
                      Create Staff
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-4 md:p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              className="pl-9 rounded-xl h-11 bg-muted/50 border-border/50 font-medium"
            />
          </div>

          <Select
            value={panchayatFilter}
            onValueChange={(v) => {
              setPanchayatFilter(v);
              setWardFilter("all");
            }}
          >
            <SelectTrigger
              data-testid="filter-panchayat"
              className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All panchayats</SelectItem>
              {PANCHAYAT_NAMES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={wardFilter} onValueChange={setWardFilter} disabled={panchayatFilter === "all"}>
            <SelectTrigger
              data-testid="filter-ward"
              className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium"
            >
              <SelectValue placeholder={panchayatFilter === "all" ? "Select panchayat first" : "All wards"} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="all">All wards</SelectItem>
              {wardOptions.map((w) => (
                <SelectItem key={w} value={w}>
                  {wardChipLabel(w)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger
              data-testid="filter-role"
              className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {(Object.keys(STAFF_LABELS) as StaffType[])
                .sort((a, b) => STAFF_ORDER[a] - STAFF_ORDER[b])
                .map((t) => (
                  <SelectItem key={t} value={t}>
                    {STAFF_LABELS[t]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {!isLoading && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span
              data-testid="roster-summary"
              className="text-xs font-bold text-muted-foreground uppercase tracking-wide"
            >
              {filtered.length} of {staff.length} staff
            </span>
            {(Object.keys(STAFF_LABELS) as StaffType[])
              .sort((a, b) => STAFF_ORDER[a] - STAFF_ORDER[b])
              .filter((t) => (counts.get(t) ?? 0) > 0)
              .map((t) => (
                <span
                  key={t}
                  data-testid={`roster-count-${t}`}
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color: STAFF_COLORS[t],
                    background: `${STAFF_COLORS[t]}14`,
                    border: `1px solid ${STAFF_COLORS[t]}33`,
                  }}
                >
                  {counts.get(t)} {STAFF_SHORT_LABELS[t]}
                  {(counts.get(t) ?? 0) === 1 ? "" : "s"}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Zone overview */}
      {!isLoading && mapZones.length > 0 && (
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm overflow-hidden mb-6">
          <div className="flex items-center gap-3 px-6 pt-6 pb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <MapIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-foreground text-lg leading-tight">Zone Overview</h2>
              <p className="text-muted-foreground text-sm font-medium">
                Click a zone to open that staff member's details.
              </p>
            </div>
          </div>
          <div className="overflow-hidden" style={{ height: "360px" }}>
            <OfficerZonesMap
              zones={mapZones}
              panchayat={panchayatFilter === "all" ? null : panchayatFilter}
              onZoneClick={(key) => {
                const member = staff.find((s) => s.key === key);
                if (member) openEdit(member);
              }}
              height="360px"
            />
          </div>
        </div>
      )}

      {/* Roster */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-[2.5rem] border border-border/50 border-dashed shadow-sm">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-6" />
          <p className="font-bold text-lg text-foreground">Loading staff…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-[2.5rem] border border-border/50 border-dashed text-center px-4 shadow-sm">
          <div className="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-6">
            <Users className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-2xl font-black text-foreground mb-3">
            {staff.length === 0 ? "No staff on roster" : "No staff match these filters"}
          </h3>
          <p className="text-muted-foreground font-medium max-w-md">
            {staff.length === 0
              ? "Add your first staff member to start assigning cleanup work."
              : "Try clearing the panchayat, ward or role filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((member, i) => {
            const color = STAFF_COLORS[member.staffType];
            const isExpanded = expanded.has(member.key);
            const resolved = (member.reportCount ?? 0) - (member.pendingCount ?? 0);
            return (
              <div
                key={member.key}
                data-testid={`staff-card-${member.key}`}
                data-staff-type={member.staffType}
                className="bg-card rounded-2xl shadow-sm border border-border/50 hover:border-primary/30 transition-all hover:shadow-md group relative overflow-hidden animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
              >
                <div
                  className="absolute top-0 right-0 w-14 h-14 rounded-bl-[50px] transition-transform duration-500 group-hover:scale-125 pointer-events-none"
                  style={{ background: `${color}12` }}
                />

                <button
                  type="button"
                  data-testid="staff-card-toggle"
                  className="w-full flex items-center gap-2.5 pl-3 pr-9 py-2.5 relative z-10 text-left"
                  onClick={() => toggleExpanded(member.key)}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0 text-white"
                    style={{ background: color }}
                  >
                    {member.name.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.)\s*/i, "").charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-sm leading-tight truncate group-hover:text-primary transition-colors">
                      {member.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1 min-w-0">
                      <RoleBadge staffType={member.staffType} />
                      <WardSummary staffType={member.staffType} wardKeys={member.wardKeys} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="flex flex-col items-center px-1.5 py-0.5 rounded-lg bg-muted/60 border border-border/40 min-w-[32px]">
                      <span className="text-sm font-black text-foreground leading-none">
                        {member.pendingCount ?? 0}
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
                        pend
                      </span>
                    </span>
                    <span
                      className="flex flex-col items-center px-1.5 py-0.5 rounded-lg min-w-[32px]"
                      style={{ background: `${color}12`, border: `1px solid ${color}30` }}
                    >
                      <span className="text-sm font-black leading-none" style={{ color }}>
                        {resolved}
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color }}>
                        done
                      </span>
                    </span>
                  </div>

                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border/30">
                      <div className="pt-2 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-foreground/80 font-medium">
                          <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span>{member.panchayatName ?? "—"}</span>
                        </div>
                        {member.email && (
                          <div className="flex items-center gap-2 text-xs text-foreground/80 font-medium">
                            <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{member.email}</span>
                          </div>
                        )}
                        {member.phone && (
                          <div className="flex items-center gap-2 text-xs text-foreground/80 font-medium">
                            <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>{member.phone}</span>
                          </div>
                        )}
                        {member.parentName && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <UserCog className="w-3 h-3 shrink-0" />
                            <span>Reports to {member.parentName}</span>
                          </div>
                        )}
                        {member.wardKeys.length > 0 && (
                          <div className="pt-0.5">
                            <WardChips wardKeys={member.wardKeys} limit={8} />
                          </div>
                        )}
                        {!member.hasLogin && (
                          <div className="flex items-center gap-2 text-xs text-amber-600 font-semibold">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>No login account</span>
                          </div>
                        )}
                        {member.createdAt && (
                          <p className="text-[10px] text-muted-foreground/50">
                            Joined {format(new Date(member.createdAt), "MMM yyyy")}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          data-testid="staff-manage"
                          className="flex-1 rounded-xl h-8 text-xs font-bold border-border/60 hover:border-primary/40 hover:bg-primary/5"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(member);
                          }}
                        >
                          <Pencil className="w-3 h-3 mr-1.5" />
                          Manage
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              data-testid="staff-remove"
                              title="Remove staff member"
                              className="h-8 w-8 shrink-0 rounded-xl border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-[2rem] p-8 border-border/50 shadow-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-black text-3xl text-foreground font-display">
                                Remove {STAFF_LABELS[member.staffType]}?
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-lg text-muted-foreground font-medium mt-4 leading-relaxed">
                                This permanently removes{" "}
                                <strong className="text-foreground">{member.name}</strong> and their
                                login account. Reports in their ward stay in the system but will no
                                longer be routed to them. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-8 gap-3 sm:gap-0">
                              <AlertDialogCancel className="rounded-xl font-bold h-12 px-6 border-border/50">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/20 rounded-xl font-black h-12 px-6"
                                onClick={() => handleRemove(member)}
                              >
                                Yes, remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manage staff member */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-xl rounded-[2rem] p-0 border-border/50 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <div className="px-7 pt-7 pb-4 shrink-0">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white"
                  style={{ background: editTarget ? STAFF_COLORS[editTarget.staffType] : undefined }}
                >
                  <Pencil className="w-4 h-4" />
                </div>
                <DialogTitle className="text-xl font-black tracking-tight">
                  {editTarget ? STAFF_LABELS[editTarget.staffType] : "Staff"}
                </DialogTitle>
              </div>
              {editTarget && (
                <p className="text-sm text-muted-foreground font-medium mt-0.5 pl-12">
                  {editTarget.name} · {editTarget.panchayatName}
                </p>
              )}
            </DialogHeader>
          </div>

          {editTarget && (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(submitEdit)} className="flex flex-col flex-1 min-h-0">
                <div className="overflow-y-auto flex-1 px-7 space-y-4">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold text-foreground">Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {usesPhoneLogin(editTarget.staffType) ? (
                    <FormField
                      control={editForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-foreground">Phone (Login)</FormLabel>
                          <FormControl>
                            <Input {...field} className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <>
                      <FormField
                        control={editForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-bold text-foreground">Email (Login)</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                {...field}
                                className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium"
                              />
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
                              <Input {...field} className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {editTarget.staffType === "supervisor" && (
                    <FormField
                      control={editForm.control}
                      name="healthInspectorId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-foreground">Reports To (Health Inspector)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium">
                                <SelectValue placeholder="Select health inspector…" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {editInspectorOptions.map((hi) => (
                                <SelectItem key={hi.id} value={String(hi.id)}>
                                  {hi.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {!hasDerivedWards(editTarget.staffType) && (
                    <FormField
                      control={editForm.control}
                      name="wardKeys"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-foreground">
                            Ward Assignment
                            {editWardKeys.length > 0 && (
                              <span className="text-muted-foreground font-medium ml-2">
                                {editWardKeys.length} selected
                              </span>
                            )}
                          </FormLabel>
                          <WardPicker
                            wards={editWards}
                            value={field.value ?? []}
                            onChange={field.onChange}
                            multiple={supportsMultipleWards(editTarget.staffType)}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {hasDerivedWards(editTarget.staffType) && (
                    <div className="rounded-xl border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground font-medium">
                      Ward coverage is inherited from the supervisors reporting into this{" "}
                      {STAFF_LABELS[editTarget.staffType].toLowerCase()}.
                    </div>
                  )}

                  <div className="pt-1 pb-2">
                    <div className="flex items-center gap-2 mb-3">
                      <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-bold text-foreground">Change Password</span>
                      <span className="text-xs text-muted-foreground font-medium">
                        (leave blank to keep current)
                      </span>
                    </div>
                    <div className="space-y-3">
                      <FormField
                        control={editForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-bold text-foreground text-sm">New Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Min 6 characters"
                                {...field}
                                className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium"
                              />
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
                              <Input
                                type="password"
                                placeholder="Re-enter new password"
                                {...field}
                                className="rounded-xl h-11 bg-muted/50 border-border/50 font-medium"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex gap-2 px-7 py-5 border-t border-border/50">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-xl h-11 font-bold"
                    onClick={() => setEditTarget(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 rounded-xl h-11 font-black" disabled={updateStaff.isPending}>
                    {updateStaff.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
