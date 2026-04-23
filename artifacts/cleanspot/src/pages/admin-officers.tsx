import { useState } from "react";
import { useListOfficers, useCreateOfficer, useDeleteOfficer, getListOfficersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Users, MapPin, Phone, Mail, Trash2, Shield, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export default function AdminOfficers() {
  const { data: officersData, isLoading } = useListOfficers();
  const createOfficer = useCreateOfficer();
  const deleteOfficer = useDeleteOfficer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [createModalOpen, setCreateModalOpen] = useState(false);

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

  const onSubmit = (data: CreateOfficerValues) => {
    // Clean up empty string values from form
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
          toast({ title: "Failed to create officer", description: err.message, variant: "destructive" });
        }
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
          toast({ title: "Failed to remove officer", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const officers = officersData?.officers || [];

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-[120px] pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
          <div>
            <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">Team Roster</h1>
            <p className="text-muted-foreground font-medium text-lg">Manage coastal sanitation officers and their assigned zones.</p>
          </div>

          <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="h-14 rounded-2xl font-black shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground hover:-translate-y-1 transition-all">
                <Plus className="w-5 h-5 mr-2" /> Add Officer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl rounded-[2rem] p-8 border-border/50 shadow-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader className="mb-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <Shield className="w-7 h-7" />
                </div>
                <DialogTitle className="text-3xl font-black font-display tracking-tight">New Officer</DialogTitle>
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
                            <Input placeholder="Jane Doe" {...field} className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-medium" />
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
                            <Input placeholder="jane@cleanspot.city" type="email" {...field} className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-medium" />
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
                            <Input type="text" placeholder="min 6 characters" {...field} className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-medium" />
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
                          <FormLabel className="font-bold text-foreground">Phone <span className="text-muted-foreground font-medium ml-1">(Optional)</span></FormLabel>
                          <FormControl>
                            <Input placeholder="+91 98765 43210" {...field} className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-medium" />
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
                        <p className="text-sm text-foreground/70 font-medium">Assign a specific beach or coastal zone for this officer to manage.</p>
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="areaName"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel className="font-bold text-foreground">Sector Name <span className="text-muted-foreground font-medium ml-1">(Optional)</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Malpe Beach South" {...field} className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-medium" />
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
                            <Input placeholder="13.3409" type="number" step="any" {...field} value={field.value ?? ""} className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-mono" />
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
                            <Input placeholder="74.7421" type="number" step="any" {...field} value={field.value ?? ""} className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-mono" />
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
                            <Input placeholder="5" type="number" step="any" {...field} value={field.value ?? ""} className="bg-muted/50 rounded-xl h-12 focus:ring-primary border-border/50 font-mono" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="pt-6 flex justify-end gap-3 mt-8 border-t border-border/50 pt-8">
                    <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)} className="rounded-xl h-12 font-bold px-6">Cancel</Button>
                    <Button type="submit" className="rounded-xl h-12 font-black px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20" disabled={createOfficer.isPending}>
                      {createOfficer.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                      Create Officer
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
          <p className="text-muted-foreground font-medium max-w-md">Add your first sanitation officer to start assigning coastal cleanup reports.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {officers.map((officer, i) => (
            <div key={officer.id} className="bg-card rounded-3xl shadow-sm border border-border/50 p-6 md:p-8 flex flex-col hover:border-primary/30 transition-all hover:shadow-lg group relative overflow-hidden animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/5 rounded-bl-[80px] transition-transform duration-500 group-hover:scale-125" />
              
              <div className="flex items-start justify-between mb-6 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-secondary/20 text-secondary-foreground flex items-center justify-center text-xl font-black shrink-0 font-display shadow-inner">
                    {officer.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-black text-foreground text-xl leading-tight mb-1 group-hover:text-primary transition-colors">{officer.name}</h3>
                    <p className="text-sm text-muted-foreground font-medium">Joined {format(new Date(officer.createdAt), "MMM yyyy")}</p>
                  </div>
                </div>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-2 -mr-2 h-10 w-10 rounded-full">
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[2rem] p-8 border-border/50 shadow-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-black text-3xl text-foreground font-display">Remove Officer?</AlertDialogTitle>
                      <AlertDialogDescription className="text-lg text-muted-foreground font-medium mt-4 leading-relaxed">
                        This will permanently delete <strong className="text-foreground">{officer.name}</strong> from the system. Any currently assigned reports will become unassigned. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-8 gap-3 sm:gap-0">
                      <AlertDialogCancel className="rounded-xl font-bold h-12 px-6 border-border/50">Cancel</AlertDialogCancel>
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

              <div className="space-y-4 mb-8 flex-1 relative z-10">
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
              </div>

              <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="bg-muted/50 rounded-2xl p-4 text-center border border-border/50">
                  <div className="text-3xl font-black text-foreground mb-1 font-display">{officer.pendingCount}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pending</div>
                </div>
                <div className="bg-primary/5 rounded-2xl p-4 text-center border border-primary/10">
                  <div className="text-3xl font-black text-primary mb-1 font-display">{officer.reportCount - officer.pendingCount}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-primary">Resolved</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
