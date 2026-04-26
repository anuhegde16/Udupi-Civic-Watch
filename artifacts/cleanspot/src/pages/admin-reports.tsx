import { useState } from "react";
import { useAdminListReports, useListOfficers, useReassignReport, getAdminListReportsQueryKey, customFetch } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Search, FileWarning, CheckCircle2, HardHat, MapPin, CalendarIcon, Anchor, Map, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
type AdminListReportsStatus = "reported" | "cleaning" | "cleaned";

type Report = {
  id: number;
  latitude: number;
  longitude: number;
  address?: string | null;
  status: string;
  createdAt: string;
  assignedOfficer?: { name: string } | null;
  assignedOfficerId?: number | null;
};

export default function AdminReports() {
  const [statusFilter, setStatusFilter] = useState<AdminListReportsStatus | "all">("all");
  const [officerFilter, setOfficerFilter] = useState<string>("all");

  const { data: reportsData, isLoading: isLoadingReports } = useAdminListReports({
    status: statusFilter === "all" ? undefined : statusFilter as AdminListReportsStatus,
    officerId: officerFilter === "all" ? undefined : parseInt(officerFilter, 10),
    limit: 100,
  });

  const { data: officersData } = useListOfficers();

  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>("");

  const [mapReport, setMapReport] = useState<Report | null>(null);

  const [deleteReportId, setDeleteReportId] = useState<number | null>(null);

  const reassignMutation = useReassignReport();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/reports/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Report deleted successfully" });
      setDeleteReportId(null);
      queryClient.invalidateQueries({ queryKey: getAdminListReportsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
    },
    onError: (err: any) =>
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
  });

  const handleReassign = () => {
    if (!selectedReportId || !selectedOfficerId) return;
    reassignMutation.mutate(
      { id: selectedReportId, data: { officerId: parseInt(selectedOfficerId, 10) } },
      {
        onSuccess: () => {
          toast({ title: "Report dispatched successfully" });
          setReassignModalOpen(false);
          queryClient.invalidateQueries({ queryKey: getAdminListReportsQueryKey() });
        },
        onError: (err) => toast({ title: "Failed to dispatch", description: err.message, variant: "destructive" }),
      }
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "reported": return "bg-destructive/10 text-destructive border-destructive/20";
      case "cleaning": return "bg-secondary/20 text-secondary-foreground border-secondary/30";
      case "cleaned": return "bg-primary/10 text-primary border-primary/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "reported": return <FileWarning className="w-3.5 h-3.5 mr-1.5" />;
      case "cleaning": return <HardHat className="w-3.5 h-3.5 mr-1.5" />;
      case "cleaned": return <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />;
      default: return null;
    }
  };

  const reports = (reportsData?.reports || []) as Report[];
  const officers = officersData?.officers || [];

  const osmEmbedUrl = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.012},${lat - 0.009},${lng + 0.012},${lat + 0.009}&layer=mapnik&marker=${lat},${lng}`;

  const osmNavUrl = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/directions?from=&to=${lat}%2C${lng}#map=15/${lat}/${lng}`;

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      <div className="mb-8 bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-[120px] pointer-events-none" />
        <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">All Reports</h1>
        <p className="text-muted-foreground font-medium text-lg">Manage and dispatch civic waste reports across the coast.</p>
      </div>

      <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-6 mb-8 flex flex-col md:flex-row gap-6 items-center">
        <div className="flex-1 w-full flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-64">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Filter by Status</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AdminListReportsStatus | "all")}>
              <SelectTrigger className="bg-muted/50 border-border/50 h-12 rounded-xl focus:ring-primary font-medium text-foreground">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50 shadow-lg">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="reported">New / Reported</SelectItem>
                <SelectItem value="cleaning">In Progress</SelectItem>
                <SelectItem value="cleaned">Cleaned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-64">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Filter by Officer</label>
            <Select value={officerFilter} onValueChange={setOfficerFilter}>
              <SelectTrigger className="bg-muted/50 border-border/50 h-12 rounded-xl focus:ring-primary font-medium text-foreground">
                <SelectValue placeholder="All Officers" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50 shadow-lg">
                <SelectItem value="all">All Officers</SelectItem>
                {officers.map((off) => (
                  <SelectItem key={off.id} value={off.id.toString()}>{off.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-right whitespace-nowrap self-end pb-2 md:pb-1 bg-primary/5 px-6 py-3 rounded-2xl border border-primary/10">
          <span className="text-3xl font-black text-primary font-display">{reportsData?.total || 0}</span>
          <span className="text-primary/70 font-bold ml-2 uppercase text-sm tracking-wider">Reports Found</span>
        </div>
      </div>

      {isLoadingReports ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-[2.5rem] border border-border/50 border-dashed shadow-sm">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-6" />
          <p className="font-bold text-lg text-foreground">Loading reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-card rounded-[2.5rem] border border-border/50 border-dashed text-center px-4 shadow-sm">
          <div className="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-6">
            <Search className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-2xl font-black text-foreground mb-3">No reports matched</h3>
          <p className="text-muted-foreground font-medium max-w-md">Try adjusting your filters to find what you are looking for.</p>
        </div>
      ) : (
        <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border/50 uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-5">ID & Status</th>
                  <th className="px-6 py-5">Location</th>
                  <th className="px-6 py-5">Assigned To</th>
                  <th className="px-6 py-5">Date</th>
                  <th className="px-6 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {reports.map((report, i) => (
                  <tr
                    key={report.id}
                    className="hover:bg-muted/30 transition-colors animate-in fade-in slide-in-from-bottom-2 cursor-pointer"
                    style={{ animationDelay: `${i * 30}ms` }}
                    onClick={() => setMapReport(report)}
                  >
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-2 items-start">
                        <span className="font-mono font-black text-foreground text-base">#{report.id}</span>
                        <Badge className={`${getStatusColor(report.status)} uppercase tracking-wider text-[10px] font-black px-2.5 py-1 rounded-md`}>
                          {getStatusIcon(report.status)}{report.status}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1.5 max-w-[250px]">
                        <span className="font-bold text-foreground truncate flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate">{report.address || "No address provided"}</span>
                        </span>
                        <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded inline-block w-max">
                          {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        {report.assignedOfficer ? (
                          <>
                            <div className="w-9 h-9 rounded-full bg-secondary/20 text-secondary-foreground flex items-center justify-center font-black text-sm shrink-0">
                              {report.assignedOfficer.name.charAt(0)}
                            </div>
                            <span className="font-bold text-foreground">{report.assignedOfficer.name}</span>
                          </>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-black uppercase tracking-wider">
                            Unassigned
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1 text-foreground/80">
                        <span className="font-bold flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                          {format(new Date(report.createdAt), "MMM d, yyyy")}
                        </span>
                        <span className="text-xs text-muted-foreground font-medium ml-6">{format(new Date(report.createdAt), "h:mm a")}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="font-bold rounded-xl text-primary hover:bg-primary/10"
                          onClick={(e) => { e.stopPropagation(); setMapReport(report); }}
                        >
                          <Map className="w-4 h-4 mr-1" /> Map
                        </Button>
                        <Button
                          variant={report.assignedOfficer ? "outline" : "default"}
                          size="sm"
                          className={`font-bold rounded-xl ${!report.assignedOfficer ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20" : "border-border hover:border-primary hover:bg-primary/5 hover:text-primary"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReportId(report.id);
                            setSelectedOfficerId(report.assignedOfficerId?.toString() || "");
                            setReassignModalOpen(true);
                          }}
                        >
                          {report.assignedOfficer ? "Reassign" : "Dispatch"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="font-bold rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteReportId(report.id); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Map Modal */}
      <Dialog open={!!mapReport} onOpenChange={(open) => { if (!open) setMapReport(null); }}>
        <DialogContent className="sm:max-w-2xl rounded-[2rem] p-0 border-border/50 shadow-2xl overflow-hidden">
          <DialogHeader className="px-8 pt-8 pb-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl font-black font-display tracking-tight flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                Report #{mapReport?.id} — Location
              </DialogTitle>
            </div>
            {mapReport?.address && (
              <p className="text-muted-foreground font-medium mt-1">{mapReport.address}</p>
            )}
          </DialogHeader>

          <div className="h-[380px] w-full relative">
            {mapReport && (
              <iframe
                key={mapReport.id}
                title="Report Location"
                src={osmEmbedUrl(mapReport.latitude, mapReport.longitude)}
                className="w-full h-full border-0"
                loading="lazy"
              />
            )}
            {mapReport && (
              <div className="absolute bottom-4 left-4 right-4 bg-background/95 backdrop-blur-md rounded-xl border border-border/50 px-4 py-3 flex items-center gap-3 shadow-lg">
                <div className="flex flex-col flex-1">
                  <span className="text-xs font-mono font-bold text-foreground">
                    {mapReport.latitude.toFixed(5)}, {mapReport.longitude.toFixed(5)}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">Udupi District, Karnataka</span>
                </div>
                <Badge className={`${getStatusColor(mapReport.status)} uppercase tracking-wider text-[10px] font-black px-2.5 py-1 rounded-md shrink-0`}>
                  {getStatusIcon(mapReport.status)}{mapReport.status}
                </Badge>
              </div>
            )}
          </div>

          <div className="px-8 py-5 flex gap-3 border-t border-border/50 bg-muted/20">
            <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => setMapReport(null)}>
              Close
            </Button>
            {mapReport && (
              <a href={osmNavUrl(mapReport.latitude, mapReport.longitude)} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button className="w-full rounded-xl font-bold h-11 bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Map className="w-4 h-4 mr-2" /> Open Navigation
                </Button>
              </a>
            )}
            {mapReport && (
              <Button
                variant="outline"
                className="rounded-xl font-bold h-11 border-border hover:border-primary hover:bg-primary/5 hover:text-primary"
                onClick={() => {
                  setSelectedReportId(mapReport.id);
                  setSelectedOfficerId(mapReport.assignedOfficerId?.toString() || "");
                  setMapReport(null);
                  setReassignModalOpen(true);
                }}
              >
                <Anchor className="w-4 h-4 mr-2" /> Dispatch Officer
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteReportId !== null} onOpenChange={(open) => { if (!open) setDeleteReportId(null); }}>
        <DialogContent className="sm:max-w-sm rounded-[2rem] p-8 border-border/50 shadow-2xl">
          <DialogHeader className="mb-2">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight">Delete Report #{deleteReportId}?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground font-medium py-2">
            This will permanently remove the report and all its data. This action cannot be undone.
          </p>
          <DialogFooter className="mt-6 gap-3 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setDeleteReportId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl font-bold h-12 px-6"
              onClick={() => deleteReportId && deleteMutation.mutate(deleteReportId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign Modal */}
      <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem] p-8 border-border/50 shadow-2xl">
          <DialogHeader className="mb-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Anchor className="w-6 h-6" />
            </div>
            <DialogTitle className="text-3xl font-black font-display tracking-tight">Dispatch Officer</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <label className="text-sm font-bold text-foreground mb-3 block">Select Officer for Report #{selectedReportId}</label>
            <Select value={selectedOfficerId} onValueChange={setSelectedOfficerId}>
              <SelectTrigger className="w-full h-14 bg-muted/50 border-border/50 rounded-xl focus:ring-primary text-base font-medium">
                <SelectValue placeholder="Choose an officer..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] rounded-xl border-border/50 shadow-xl">
                {officers.map((off) => (
                  <SelectItem key={off.id} value={off.id.toString()} className="py-3 focus:bg-muted">
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground">{off.name}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">{off.areaName || "No specific area"} • {off.pendingCount} pending</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="mt-4 gap-3 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold h-12 px-6" onClick={() => setReassignModalOpen(false)}>Cancel</Button>
            <Button
              className="rounded-xl font-bold h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
              onClick={handleReassign}
              disabled={!selectedOfficerId || reassignMutation.isPending}
            >
              {reassignMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
