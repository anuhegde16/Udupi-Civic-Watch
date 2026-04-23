import { useRoute } from "wouter";
import { useTrackReport } from "@workspace/api-client-react";
import { Loader2, Search, CheckCircle2, Clock, HardHat, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function Track() {
  const [, params] = useRoute("/track/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: report, isLoading, error } = useTrackReport(id, { 
    query: { 
      enabled: !!id,
      refetchInterval: 10000 // Poll every 10s for updates
    } 
  });

  if (!id) {
    return (
      <div className="max-w-md mx-auto w-full pt-12 flex flex-col items-center text-center px-4">
        <Search className="w-12 h-12 text-gray-300 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Tracking Link</h2>
        <p className="text-gray-500">The report ID provided is invalid.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto w-full pt-20 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="mt-4 font-medium text-gray-600">Loading report status...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-md mx-auto w-full pt-12 flex flex-col items-center text-center px-4">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Report Not Found</h2>
        <p className="text-gray-500">We couldn't find a report with ID #{id}.</p>
      </div>
    );
  }

  const steps = [
    { 
      id: 'reported', 
      label: 'Report Received', 
      icon: Clock,
      date: report.createdAt,
      isCompleted: true,
      isActive: report.status === 'reported'
    },
    { 
      id: 'cleaning', 
      label: 'Cleaning in Progress', 
      icon: HardHat,
      date: report.status !== 'reported' ? report.updatedAt : null,
      isCompleted: report.status === 'cleaning' || report.status === 'cleaned',
      isActive: report.status === 'cleaning'
    },
    { 
      id: 'cleaned', 
      label: 'Cleaned', 
      icon: CheckCircle2,
      date: report.status === 'cleaned' ? report.updatedAt : null,
      isCompleted: report.status === 'cleaned',
      isActive: report.status === 'cleaned'
    }
  ];

  return (
    <div className="max-w-md mx-auto w-full pb-10 pt-2 px-2">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Report Status</h1>
          <span className="bg-gray-100 text-gray-700 text-sm font-mono font-bold px-3 py-1 rounded-lg">#{id}</span>
        </div>
        <p className="text-gray-600">Track the progress of your civic report.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8 relative overflow-hidden mb-8">
        {/* Progress Line */}
        <div className="absolute left-[44px] md:left-[48px] top-12 bottom-12 w-0.5 bg-gray-100 rounded-full" />
        
        <div className="absolute left-[44px] md:left-[48px] top-12 w-0.5 bg-primary rounded-full transition-all duration-500 ease-in-out" 
          style={{ 
            height: report.status === 'reported' ? '0%' : 
                    report.status === 'cleaning' ? '50%' : '100%' 
          }} 
        />

        <div className="space-y-10 relative z-10">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className={`flex gap-5 ${step.isActive ? '' : step.isCompleted ? 'opacity-80' : 'opacity-40 grayscale'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-4 outline outline-4 outline-white ${
                  step.isActive ? 'bg-primary border-primary/20 text-white shadow-lg shadow-primary/30' : 
                  step.isCompleted ? 'bg-primary border-white text-white' : 
                  'bg-gray-50 border-gray-100 text-gray-400'
                } transition-all duration-300`}>
                  <Icon className={`w-5 h-5 ${step.isActive ? 'animate-in fade-in zoom-in' : ''}`} />
                </div>
                
                <div className="flex flex-col justify-center pt-1">
                  <h3 className={`font-bold text-lg leading-none mb-1.5 ${step.isActive ? 'text-gray-900' : step.isCompleted ? 'text-gray-800' : 'text-gray-400'}`}>
                    {step.label}
                  </h3>
                  {step.date ? (
                    <p className="text-sm text-gray-500 font-medium">
                      {format(new Date(step.date), "MMM d, h:mm a")}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">Pending</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {report.status === 'cleaned' && report.cleanupImageUrl && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              Cleanup Photo
            </h3>
          </div>
          <div className="aspect-[4/3] w-full bg-gray-50 relative">
            <img 
              src={report.cleanupImageUrl} 
              alt="Cleanup result" 
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
}
