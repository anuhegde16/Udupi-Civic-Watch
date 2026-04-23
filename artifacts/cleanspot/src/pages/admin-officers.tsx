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
import { Loader2, Plus, Users, MapPin, Phone, Mail, Trash2 } from "lucide-react";
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
    <div className="pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Team Roster</h1>
          <p className="text-gray-600 font-medium">Manage sanitation officers and their assigned zones.</p>
        </div>

        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="h-12 rounded-xl font-bold shadow-md shadow-primary/20">
              <Plus className="w-5 h-5 mr-2" /> Add Officer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
            <DialogHeader className="mb-4">
              <DialogTitle className="text-2xl font-black">New Officer</DialogTitle>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="font-bold text-gray-700">Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Doe" {...field} className="bg-gray-50 rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="font-bold text-gray-700">Email (Login)</FormLabel>
                        <FormControl>
                          <Input placeholder="jane@cleanspot.city" type="email" {...field} className="bg-gray-50 rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="font-bold text-gray-700">Temporary Password</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="min 6 characters" {...field} className="bg-gray-50 rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="font-bold text-gray-700">Phone <span className="text-gray-400 font-normal">(Optional)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 123-4567" {...field} className="bg-gray-50 rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="col-span-2 pt-4 pb-2">
                    <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-1">Assignment Area</h3>
                    <div className="h-px w-full bg-gray-100" />
                  </div>

                  <FormField
                    control={form.control}
                    name="areaName"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="font-bold text-gray-700">Area Name <span className="text-gray-400 font-normal">(Optional)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="Downtown District" {...field} className="bg-gray-50 rounded-xl" />
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
                        <FormLabel className="font-bold text-gray-700">Center Lat</FormLabel>
                        <FormControl>
                          <Input placeholder="13.3409" type="number" step="any" {...field} value={field.value ?? ""} className="bg-gray-50 rounded-xl" />
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
                        <FormLabel className="font-bold text-gray-700">Center Lng</FormLabel>
                        <FormControl>
                          <Input placeholder="74.7421" type="number" step="any" {...field} value={field.value ?? ""} className="bg-gray-50 rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="radiusKm"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="font-bold text-gray-700">Radius (km)</FormLabel>
                        <FormControl>
                          <Input placeholder="5" type="number" step="any" {...field} value={field.value ?? ""} className="bg-gray-50 rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="pt-6 flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)} className="rounded-xl">Cancel</Button>
                  <Button type="submit" className="rounded-xl font-bold px-6" disabled={createOfficer.isPending}>
                    {createOfficer.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Create Officer
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-200 border-dashed">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="font-medium text-gray-500">Loading officers...</p>
        </div>
      ) : officers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-200 border-dashed text-center px-4">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No officers on roster</h3>
          <p className="text-gray-500 max-w-md">Add your first sanitation officer to start assigning reports.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {officers.map(officer => (
            <div key={officer.id} className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 flex flex-col hover:border-primary/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-black shrink-0">
                    {officer.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg leading-tight">{officer.name}</h3>
                    <p className="text-sm text-gray-500 font-medium">Joined {format(new Date(officer.createdAt), "MMM yyyy")}</p>
                  </div>
                </div>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-gray-400 hover:text-red-500 hover:bg-red-50 -mt-2 -mr-2">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-3xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-black text-xl">Remove Officer?</AlertDialogTitle>
                      <AlertDialogDescription className="text-base text-gray-600">
                        This will permanently delete <strong>{officer.name}</strong> from the system. Any currently assigned reports will become unassigned. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6">
                      <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        className="bg-red-500 hover:bg-red-600 rounded-xl font-bold"
                        onClick={() => handleDelete(officer.id)}
                      >
                        Yes, remove officer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="space-y-3 mb-6 flex-1">
                <div className="flex items-center gap-2.5 text-sm text-gray-600">
                  <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate">{officer.email}</span>
                </div>
                {officer.phone && (
                  <div className="flex items-center gap-2.5 text-sm text-gray-600">
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>{officer.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="font-medium text-gray-900">{officer.areaName || "No specific area"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-black text-gray-900">{officer.pendingCount}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mt-1">Pending</div>
                </div>
                <div className="bg-primary/5 rounded-xl p-3 text-center">
                  <div className="text-2xl font-black text-primary">{officer.reportCount - officer.pendingCount}</div>
                  <div className="text-xs font-bold uppercase tracking-wider text-primary/70 mt-1">Resolved</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
