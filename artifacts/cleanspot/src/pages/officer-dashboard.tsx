import { useAuth } from "@/hooks/use-auth";
import { useGetOfficerReports } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useState } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, FileWarning, Search, Loader2, Info } from "lucide-react";
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
      case 'reported': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'cleaning': return 'bg-secondary/10 text-secondary-foreground border-secondary/20';
      case 'cleaned': return 'bg-primary/10 text-primary border-primary/20';
      default: return 'bg-muted text-muted-foreground border-border';
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
    <div className="w-full pb-10 animate-in fade-in duration-500">
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 w-40 h-40 bg-secondary/5 rounded-bl-[100px] pointer-events-none" />
        <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">My Zone</h1>
        <p className="text-muted-foreground font-medium text-lg">
          {reports.length} reports in {user?.officerId ? 'your assigned coastal sector' : 'total'}
        </p>
        
        <div className="mt-6 p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/80 font-medium">Your work matters. Over 5 tonnes of plastic waste is generated weekly along Udupi's coast. Every cleanup protects local livelihoods and marine life.</p>
        </div>
      </div>

      <Tabs defaultValue="all" onValueChange={(v) => setFilter(v as StatusFilter)} className="mb-8">
        <TabsList className="bg-background/50 backdrop-blur-sm border border-border shadow-sm rounded-2xl p-1.5 h-auto flex flex-wrap max-w-full overflow-x-auto w-full md:w-auto md:inline-flex">
          <TabsTrigger value="all" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5 px-6 font-bold text-sm flex-1 md:flex-none transition-all">All Tasks</TabsTrigger>
          <TabsTrigger value="reported" className="rounded-xl data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground py-2.5 px-6 font-bold text-sm flex-1 md:flex-none transition-all">New</TabsTrigger>
          <TabsTrigger value="cleaning" className="rounded-xl data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground py-2.5 px-6 font-bold text-sm flex-1 md:flex-none transition-all">In Progress</TabsTrigger>
          <TabsTrigger value="cleaned" className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2.5 px-6 font-bold text-sm flex-1 md:flex-none transition-all">Cleaned</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="font-bold text-lg">Loading assigned reports...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-24 px-4 text-center shadow-sm">
          <div className="w-20 h-20 bg-muted/50 rounded-full flex items-center justify-center mb-6">
            <Search className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-2xl font-black text-foreground mb-2">No reports found</h3>
          <p className="text-muted-foreground font-medium text-lg">
            {filter === "all" ? "Your coastal zone is clear right now. Great job!" : `No ${filter} reports found.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report, i) => (
            <Link key={report.id} href={`/officer/report/${report.id}`}>
              <Card className="overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all border-border/50 cursor-pointer h-full flex flex-col group rounded-3xl animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="aspect-[4/3] w-full bg-muted relative overflow-hidden">
                  {report.imageUrl ? (
                    <img 
                      src={report.imageUrl} 
                      alt="Waste report" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <FileWarning className="w-12 h-12 opacity-50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <div className="absolute top-4 left-4 flex gap-2">
                    <Badge className={`${getStatusColor(report.status)} border shadow-sm px-3 py-1.5 text-xs font-black uppercase tracking-wider backdrop-blur-md`}>
                      {getStatusLabel(report.status)}
                    </Badge>
                  </div>
                  
                  <div className="absolute top-4 right-4">
                    <div className="bg-black/70 backdrop-blur-md text-white text-xs font-black font-mono px-3 py-1.5 rounded-lg shadow-sm">
                      #{report.id}
                    </div>
                  </div>
                </div>
                
                <div className="p-6 flex-1 flex flex-col bg-card">
                  <p className="font-bold text-foreground text-lg mb-3 line-clamp-2 leading-snug group-hover:text-primary transition-colors flex items-start gap-2">
                    <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>{report.address || `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}</span>
                  </p>
                  
                  <div className="mt-auto space-y-3">
                    {report.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 italic font-medium bg-muted/50 p-3 rounded-xl">"{report.description}"</p>
                    )}
                    
                    <div className="flex items-center text-xs text-muted-foreground font-bold pt-3 border-t border-border/50">
                      <Clock className="w-4 h-4 mr-2" />
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
