import { useRoute } from "wouter";
import { useTrackReport, getTrackReportQueryKey } from "@workspace/api-client-react";
import { Loader2, Search, CheckCircle2, Clock, HardHat, AlertCircle, Info } from "lucide-react";
import { format } from "date-fns";

export default function Track() {
  const [, params] = useRoute("/track/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: report, isLoading, error } = useTrackReport(id, { 
    query: { 
      queryKey: getTrackReportQueryKey(id),
      enabled: !!id,
      refetchInterval: 10000 // Poll every 10s for updates
    } 
  });

  if (!id) {
    return (
      <div className="max-w-md mx-auto w-full pt-12 flex flex-col items-center text-center px-4 animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
          <Search className="w-10 h-10 text-muted-foreground" />
        </div>
        <h2 className="text-3xl font-black text-foreground mb-2">Invalid Link</h2>
        <p className="text-muted-foreground font-medium">This tracking link doesn't look right.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto w-full pt-20 flex flex-col items-center justify-center animate-in fade-in duration-500">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="mt-4 font-bold text-foreground">Fetching report status...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-md mx-auto w-full pt-12 flex flex-col items-center text-center px-4 animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-3xl font-black text-foreground mb-2">Report Not Found</h2>
        <p className="text-muted-foreground font-medium">We couldn't find a report with ID #{id}.</p>
      </div>
    );
  }

  const steps = [
    { 
      id: 'reported', 
      label: 'Report Received', 
      desc: 'Our team has been notified',
      icon: Clock,
      date: report.createdAt,
      isCompleted: true,
      isActive: report.status === 'reported'
    },
    { 
      id: 'cleaning', 
      label: 'Cleaning in Progress', 
      desc: 'An officer is at the location',
      icon: HardHat,
      date: report.status !== 'reported' ? report.updatedAt : null,
      isCompleted: report.status === 'cleaning' || report.status === 'cleaned',
      isActive: report.status === 'cleaning'
    },
    { 
      id: 'cleaned', 
      label: 'Cleaned', 
      desc: 'Waste has been removed',
      icon: CheckCircle2,
      date: report.status === 'cleaned' ? report.updatedAt : null,
      isCompleted: report.status === 'cleaned',
      isActive: report.status === 'cleaned'
    }
  ];

  return (
    <div className="max-w-xl mx-auto w-full pb-10 pt-4 animate-in fade-in duration-500">
      <div className="mb-8 bg-card rounded-3xl p-6 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full" />
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-black text-foreground tracking-tight">Report Status</h1>
          <span className="bg-primary/10 text-primary text-sm font-mono font-bold px-3 py-1 rounded-lg">#{id}</span>
        </div>
        <p className="text-muted-foreground font-medium">Track the progress of your civic report.</p>
        
        {report.status !== 'cleaned' && (
          <div className="mt-4 p-3 bg-secondary/10 rounded-xl border border-secondary/20 flex items-start gap-3">
            <Info className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
            <p className="text-sm text-secondary-foreground font-medium">Udupi's coastal cleanup relies on active citizens like you. The municipal team is working to address your report.</p>
          </div>
        )}
      </div>

      <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-6 md:p-8 relative overflow-hidden mb-8">
        {/* Progress Line */}
        <div className="absolute left-[44px] md:left-[48px] top-12 bottom-12 w-1 bg-muted rounded-full" />
        
        <div className="absolute left-[44px] md:left-[48px] top-12 w-1 bg-primary rounded-full transition-all duration-1000 ease-in-out" 
          style={{ 
            height: report.status === 'reported' ? '0%' : 
                    report.status === 'cleaning' ? '50%' : '100%' 
          }} 
        />

        <div className="space-y-10 relative z-10">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className={`flex gap-5 ${step.isActive ? '' : step.isCompleted ? 'opacity-90' : 'opacity-40 grayscale'}`}>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 border-4 outline outline-4 outline-card ${
                  step.isActive ? 'bg-primary border-primary/20 text-primary-foreground shadow-lg shadow-primary/30' : 
                  step.isCompleted ? 'bg-primary border-card text-primary-foreground' : 
                  'bg-muted border-border text-muted-foreground'
                } transition-all duration-500`}>
                  <Icon className={`w-6 h-6 ${step.isActive ? 'animate-in fade-in zoom-in duration-500 delay-300' : ''}`} />
                </div>
                
                <div className="flex flex-col justify-center pt-1.5">
                  <h3 className={`font-black text-xl leading-none mb-1.5 ${step.isActive ? 'text-foreground' : step.isCompleted ? 'text-foreground/90' : 'text-muted-foreground'}`}>
                    {step.label}
                  </h3>
                  <p className={`text-sm font-medium mb-1 ${step.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {step.desc}
                  </p>
                  {step.date ? (
                    <p className="text-xs text-muted-foreground font-mono font-medium">
                      {format(new Date(step.date), "MMM d, h:mm a")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 font-mono font-medium">Pending</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {report.status === 'cleaned' && report.cleanupImageUrl && (
        <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden animate-in slide-in-from-bottom-8 fade-in duration-700">
          <div className="p-5 border-b border-border/50 bg-green-500/5">
            <h3 className="font-black text-foreground flex items-center gap-2 text-xl">
              <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              Cleanup Photo
            </h3>
          </div>
          <div className="aspect-video w-full bg-muted relative group">
            <img 
              src={report.cleanupImageUrl} 
              alt="Cleanup result" 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          </div>
        </div>
      )}
    </div>
  );
}
