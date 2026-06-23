import { useRoute, useLocation } from "wouter";
import { useState, useRef } from "react";
import { useGetReport, useUpdateReport, useUploadImage, getGetOfficerReportsQueryKey, getGetReportQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Clock, ArrowLeft, Camera, CheckCircle2, HardHat, FileWarning, Info, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ReportLocationMap } from "@/components/report-location-map";

export default function OfficerReportDetail() {
  const [, params] = useRoute("/officer/report/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const { data: report, isLoading } = useGetReport(id, { query: { queryKey: getGetReportQueryKey(id), enabled: !!id } });
  const updateReport = useUpdateReport();
  const uploadImage = useUploadImage();
  
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground h-full animate-in fade-in duration-500">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="font-bold text-lg text-foreground">Loading report details...</p>
      </div>
    );
  }

  const handleStatusChange = (status: "reported" | "cleaning" | "cleaned", cleanupImageUrl?: string) => {
    updateReport.mutate(
      { id, data: { status, cleanupImageUrl } },
      {
        onSuccess: (updatedReport) => {
          toast({ title: "Status Updated", description: `Report is now marked as ${status}` });
          // Patch local cache
          queryClient.setQueryData(getGetReportQueryKey(id), updatedReport);
          if (user?.officerId) {
            queryClient.invalidateQueries({ queryKey: getGetOfficerReportsQueryKey(user.officerId) });
          }
        },
        onError: (err) => {
          toast({ title: "Update failed", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setIsUploading(true);
      const dataUrlReader = new FileReader();
      dataUrlReader.readAsDataURL(file);
      dataUrlReader.onload = async () => {
        const dataUrl = dataUrlReader.result as string;
        uploadImage.mutate(
          { data: { dataUrl } },
          {
            onSuccess: (data) => {
              setIsUploading(false);
              // Auto-mark as cleaned when photo is uploaded
              handleStatusChange("cleaned", data.url);
            },
            onError: (err) => {
              toast({ title: "Upload failed", description: err.message, variant: "destructive" });
              setIsUploading(false);
            }
          }
        );
      };
    } catch (err) {
      console.error(err);
      setIsUploading(false);
      toast({ title: "Error", description: "Failed to read file", variant: "destructive" });
    }
  };

  const getStatusBadge = () => {
    switch (report.status) {
      case 'reported': return <Badge className="bg-destructive text-destructive-foreground px-4 py-1.5 text-sm font-black uppercase tracking-wider"><FileWarning className="w-4 h-4 mr-2"/> New Report</Badge>;
      case 'cleaning': return <Badge className="bg-secondary text-secondary-foreground px-4 py-1.5 text-sm font-black uppercase tracking-wider"><HardHat className="w-4 h-4 mr-2"/> In Progress</Badge>;
      case 'cleaned': return <Badge className="bg-primary text-primary-foreground px-4 py-1.5 text-sm font-black uppercase tracking-wider"><CheckCircle2 className="w-4 h-4 mr-2"/> Cleaned</Badge>;
      default: return null;
    }
  };

  const osmUrl = `https://www.google.com/maps?q=${report.latitude},${report.longitude}`;

  return (
    <div className="max-w-3xl mx-auto w-full pb-10 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <Button variant="outline" size="icon" onClick={() => window.history.back()} className="rounded-full h-12 w-12 border-border/50 hover:bg-muted shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-foreground tracking-tight">Report #{report.id}</h1>
            <p className="text-muted-foreground font-medium">Assigned task in your coastal sector</p>
          </div>
          <div className="self-start sm:self-auto">
            {getStatusBadge()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Left Col - Images */}
        <div className="space-y-6">
          <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden group relative">
            <div className="absolute top-4 left-4 z-10">
              <Badge className="bg-background/80 backdrop-blur-md text-foreground border-border/50 font-bold uppercase tracking-wider text-xs">Original Photo</Badge>
            </div>
            <div className="aspect-[4/3] bg-muted w-full relative">
              {report.imageUrl ? (
                <img src={report.imageUrl} alt="Waste report" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Camera className="w-12 h-12 mb-3 opacity-50" />
                  <p className="font-medium">No photo provided</p>
                </div>
              )}
            </div>
          </div>

          {report.status === 'cleaned' && report.cleanupImageUrl && (
            <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden group relative animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="absolute top-4 left-4 z-10">
                <Badge className="bg-green-500 text-white border-transparent font-bold uppercase tracking-wider text-xs shadow-lg shadow-green-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Cleaned Up
                </Badge>
              </div>
              <div className="aspect-[4/3] bg-muted w-full relative">
                <img src={report.cleanupImageUrl} alt="Cleaned up" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
            </div>
          )}
        </div>

        {/* Right Col - Details & Actions */}
        <div className="space-y-6">
          {/* Location Map Preview */}
          <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden flex flex-col">
            <div className="relative w-full rounded-t-3xl overflow-hidden">
              <ReportLocationMap latitude={report.latitude} longitude={report.longitude} height="220px" />
            </div>
            
            <div className="p-6">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Location Details</p>
              <div className="flex items-start gap-3 text-foreground font-bold text-lg mb-4">
                <MapPin className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                <p className="leading-snug">{report.address || `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`}</p>
              </div>
              
              <div className="flex flex-col gap-1 mb-6">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Reported At</p>
                <div className="flex items-center gap-2 text-foreground font-medium bg-muted/50 p-3 rounded-xl">
                  <Clock className="w-5 h-5 text-primary shrink-0" />
                  <p>{format(new Date(report.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
                </div>
              </div>

              <a href={osmUrl} target="_blank" rel="noopener noreferrer" className="block w-full">
                <Button variant="outline" className="w-full h-12 font-bold rounded-xl border-primary/20 text-primary hover:bg-primary/5 group">
                  Open in Maps
                  <ArrowUpRight className="w-4 h-4 ml-2 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </a>
            </div>
          </div>

          {report.description && (
            <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-6">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Description from Citizen</p>
              <div className="relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-secondary rounded-full" />
                <p className="text-foreground pl-4 font-medium italic leading-relaxed">"{report.description}"</p>
              </div>
            </div>
          )}

          {/* Action Area */}
          <div className="bg-card rounded-3xl shadow-sm border border-border/50 p-6 space-y-4">
            <h3 className="font-black text-lg text-foreground mb-4">Officer Actions</h3>
            
            {report.status === 'reported' && (
              <Button 
                size="lg" 
                className="w-full h-14 text-lg font-bold rounded-xl bg-secondary hover:bg-secondary/90 text-secondary-foreground shadow-lg shadow-secondary/20 transition-all hover:-translate-y-1"
                onClick={() => handleStatusChange("cleaning")}
                disabled={updateReport.isPending}
              >
                {updateReport.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>
                    <HardHat className="w-5 h-5 mr-2" /> Mark as In Progress
                  </>
                )}
              </Button>
            )}

            {(report.status === 'reported' || report.status === 'cleaning') && (
              <div className="pt-2">
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <Button 
                  size="lg" 
                  className="w-full h-14 text-lg font-black rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:-translate-y-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || updateReport.isPending}
                >
                  {isUploading ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Uploading Photo...</>
                  ) : (
                    <><Camera className="w-5 h-5 mr-2" /> Snap Cleanup Photo & Resolve</>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground font-medium mt-3">
                  Taking a photo of the cleaned area will automatically resolve this report.
                </p>
              </div>
            )}

            {report.status === 'cleaned' && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-primary font-bold">Great job!</p>
                  <p className="text-sm text-foreground/70 font-medium mt-1">This report is fully resolved. Your work helps keep Udupi's coast clean for everyone.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
