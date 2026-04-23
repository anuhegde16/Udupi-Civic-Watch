import { useState } from "react";
import { useAdminListReports, useListOfficers, useReassignReport, getAdminListReportsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Search, FileWarning, CheckCircle2, HardHat, MapPin, UserIcon, CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AdminListReportsStatus } from "@workspace/api-client-react/src/generated/api.schemas";

export default function AdminReports() {
  const [statusFilter, setStatusFilter] = useState<AdminListReportsStatus | "all">("all");
  const [officerFilter, setOfficerFilter] = useState<string>("all");
  
  const { data: reportsData, isLoading: isLoadingReports } = useAdminListReports({
    status: statusFilter === "all" ? undefined : statusFilter as AdminListReportsStatus,
    officerId: officerFilter === "all" ? undefined : parseInt(officerFilter, 10),
    limit: 100
  });
  
  const { data: officersData } = useListOfficers();
  
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>("");
  
  const reassignMutation = useReassignReport();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleReassign = () => {
    if (!selectedReportId || !selectedOfficerId) return;
    
    reassignMutation.mutate(
      { 
        id: selectedReportId, 
        data: { officerId: parseInt(selectedOfficerId, 10) } 
      },
      {
        onSuccess: () => {
          toast({ title: "Report reassigned successfully" });
          setReassignModalOpen(false);
          // Invalidate to refresh the list
          queryClient.invalidateQueries({ queryKey: getAdminListReportsQueryKey() });
        },
        onError: (err) => {
          toast({ title: "Failed to reassign", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reported': return 'bg-red-100 text-red-800 border-red-200';
      case 'cleaning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cleaned': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'reported': return <FileWarning className="w-3.5 h-3.5 mr-1" />;
      case 'cleaning': return <HardHat className="w-3.5 h-3.5 mr-1" />;
      case 'cleaned': return <CheckCircle2 className="w-3.5 h-3.5 mr-1" />;
      default: return null;
    }
  };

  const reports = reportsData?.reports || [];
  const officers = officersData?.officers || [];

  return (
    <div className="pb-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">All Reports</h1>
        <p className="text-gray-600 font-medium">Manage and dispatch civic waste reports.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full flex flex-col md:flex-row gap-4">
          <div className="w-full md:w-64">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Filter by Status</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AdminListReportsStatus | "all")}>
              <SelectTrigger className="bg-gray-50 border-gray-200 h-11 rounded-xl focus:ring-primary">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="reported">New / Reported</SelectItem>
                <SelectItem value="cleaning">In Progress</SelectItem>
                <SelectItem value="cleaned">Cleaned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="w-full md:w-64">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Filter by Officer</label>
            <Select value={officerFilter} onValueChange={setOfficerFilter}>
              <SelectTrigger className="bg-gray-50 border-gray-200 h-11 rounded-xl focus:ring-primary">
                <SelectValue placeholder="All Officers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Officers</SelectItem>
                {officers.map(off => (
                  <SelectItem key={off.id} value={off.id.toString()}>{off.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="text-right whitespace-nowrap self-end pb-2 md:pb-0">
          <span className="text-2xl font-black text-primary">{reportsData?.total || 0}</span>
          <span className="text-gray-500 font-medium ml-2">reports found</span>
        </div>
      </div>

      {isLoadingReports ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-200 border-dashed">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="font-medium text-gray-500">Loading reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-200 border-dashed text-center px-4">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No reports matched</h3>
          <p className="text-gray-500 max-w-md">Try adjusting your filters to find what you're looking for.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">ID & Status</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Assigned To</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map(report => (
                  <tr key={report.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2 items-start">
                        <span className="font-mono font-bold text-gray-900">#{report.id}</span>
                        <Badge className={`${getStatusColor(report.status)} uppercase tracking-wider text-[10px] font-bold`}>
                          {getStatusIcon(report.status)}
                          {report.status}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 max-w-[200px]">
                        <span className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          {report.address || "No address provided"}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {report.assignedOfficer ? (
                          <>
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                              {report.assignedOfficer.name.charAt(0)}
                            </div>
                            <span className="font-bold text-gray-900">{report.assignedOfficer.name}</span>
                          </>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 text-xs font-bold">
                            Unassigned
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-gray-600">
                        <span className="font-medium flex items-center gap-1.5">
                          <CalendarIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          {format(new Date(report.createdAt), "MMM d, yyyy")}
                        </span>
                        <span className="text-xs text-gray-500">{format(new Date(report.createdAt), "h:mm a")}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="font-bold border-gray-200 hover:border-primary hover:text-primary rounded-lg"
                        onClick={() => {
                          setSelectedReportId(report.id);
                          setSelectedOfficerId(report.assignedOfficerId?.toString() || "");
                          setReassignModalOpen(true);
                        }}
                      >
                        {report.assignedOfficer ? 'Reassign' : 'Assign'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Assign Officer</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <label className="text-sm font-bold text-gray-700 mb-2 block">Select Officer for Report #{selectedReportId}</label>
            <Select value={selectedOfficerId} onValueChange={setSelectedOfficerId}>
              <SelectTrigger className="w-full h-14 bg-gray-50 border-gray-200 rounded-xl focus:ring-primary text-base">
                <SelectValue placeholder="Choose an officer..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {officers.map((off) => (
                  <SelectItem key={off.id} value={off.id.toString()} className="py-3">
                    <div className="flex flex-col">
                      <span className="font-bold">{off.name}</span>
                      <span className="text-xs text-gray-500">{off.areaName || 'No specific area'} • {off.pendingCount} pending</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl font-bold h-12" onClick={() => setReassignModalOpen(false)}>Cancel</Button>
            <Button 
              className="rounded-xl font-bold h-12" 
              onClick={handleReassign}
              disabled={!selectedOfficerId || reassignMutation.isPending}
            >
              {reassignMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
