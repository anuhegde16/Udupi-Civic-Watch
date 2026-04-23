import { useAuth } from "@/hooks/use-auth";
import { useGetOfficerReports } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useState } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, FileWarning, Search, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type StatusFilter = "all" | "reported" | "cleaning" | "cleaned";

export default function OfficerDashboard() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>("all");
  
  const { data, isLoading } = useGetOfficerReports(user?.officerId || 0, 
    { status: filter === "all" ? undefined : filter },
    { query: { enabled: !!user?.officerId } }
  );

  const reports = data?.reports || [];
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reported': return 'bg-red-100 text-red-800 border-red-200';
      case 'cleaning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cleaned': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'reported': return 'New';
      case 'cleaning': return 'In Progress';
      case 'cleaned': return 'Cleaned';
      default: return status;
    }
  };

  return (
    <div className="w-full pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">My Area</h1>
          <p className="text-gray-600 font-medium">
            {reports.length} reports in {user?.officerId ? 'your assigned zone' : 'total'}
          </p>
        </div>
      </div>

      <Tabs defaultValue="all" onValueChange={(v) => setFilter(v as StatusFilter)} className="mb-6">
        <TabsList className="bg-white border shadow-sm rounded-xl p-1 h-auto flex flex-wrap max-w-full overflow-x-auto w-full md:w-auto md:inline-flex">
          <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white py-2.5 px-4 flex-1 md:flex-none">All</TabsTrigger>
          <TabsTrigger value="reported" className="rounded-lg data-[state=active]:bg-red-500 data-[state=active]:text-white py-2.5 px-4 flex-1 md:flex-none">New</TabsTrigger>
          <TabsTrigger value="cleaning" className="rounded-lg data-[state=active]:bg-yellow-500 data-[state=active]:text-white py-2.5 px-4 flex-1 md:flex-none">In Progress</TabsTrigger>
          <TabsTrigger value="cleaned" className="rounded-lg data-[state=active]:bg-green-500 data-[state=active]:text-white py-2.5 px-4 flex-1 md:flex-none">Cleaned</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="font-medium">Loading assigned reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-3xl flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">No reports found</h3>
          <p className="text-gray-500">
            {filter === "all" ? "Your area is completely clean right now." : `No ${filter} reports found.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <Link key={report.id} href={`/officer/report/${report.id}`}>
              <Card className="overflow-hidden hover:shadow-md transition-shadow border-gray-200 cursor-pointer h-full flex flex-col group">
                <div className="aspect-video w-full bg-gray-100 relative">
                  {report.imageUrl ? (
                    <img 
                      src={report.imageUrl} 
                      alt="Waste report" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <FileWarning className="w-12 h-12" />
                    </div>
                  )}
                  
                  <div className="absolute top-3 left-3 flex gap-2">
                    <Badge className={`${getStatusColor(report.status)} border shadow-sm px-2.5 py-1 text-xs font-bold uppercase tracking-wider`}>
                      {getStatusLabel(report.status)}
                    </Badge>
                  </div>
                  
                  <div className="absolute top-3 right-3">
                    <div className="bg-black/70 backdrop-blur-md text-white text-xs font-bold font-mono px-2 py-1 rounded-md shadow-sm">
                      #{report.id}
                    </div>
                  </div>
                </div>
                
                <div className="p-5 flex-1 flex flex-col">
                  <p className="font-semibold text-gray-900 mb-3 line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                    {report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}
                  </p>
                  
                  <div className="mt-auto space-y-2">
                    {report.description && (
                      <p className="text-sm text-gray-500 line-clamp-1 italic">"{report.description}"</p>
                    )}
                    
                    <div className="flex items-center text-xs text-gray-500 font-medium pt-2 border-t border-gray-100">
                      <Clock className="w-3.5 h-3.5 mr-1.5" />
                      {format(new Date(report.createdAt), "MMM d, h:mm a")}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
