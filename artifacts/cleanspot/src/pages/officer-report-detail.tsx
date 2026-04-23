import { useRoute, useLocation } from "wouter";
import { useState, useRef } from "react";
import { useGetReport, useUpdateReport, useUploadImage, getGetOfficerReportsQueryKey, getGetReportQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Clock, ArrowLeft, Camera, CheckCircle2, HardHat, FileWarning } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function OfficerReportDetail() {
  const [, params] = useRoute("/officer/report/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const { data: report, isLoading } = useGetReport(id, { query: { enabled: !!id } });
  const updateReport = useUpdateReport();
  const uploadImage = useUploadImage();
  
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 h-full">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="font-medium">Loading report details...</p>
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
      case 'reported': return <Badge className="bg-red-100 text-red-800 border-red-200 px-3 py-1 text-sm"><FileWarning className="w-3.5 h-3.5 mr-1.5"/> New Report</Badge>;
      case 'cleaning': return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 px-3 py-1 text-sm"><HardHat className="w-3.5 h-3.5 mr-1.5"/> In Progress</Badge>;
      case 'cleaned': return <Badge className="bg-green-100 text-green-800 border-green-200 px-3 py-1 text-sm"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5"/> Cleaned</Badge>;
      default: return null;
    }
  };

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`;

  return (
    <div className="max-w-2xl mx-auto w-full pb-10">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="rounded-full hover:bg-gray-200">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Report #{report.id}</h1>
            {getStatusBadge()}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        {/* Original Photo */}
        <div className="aspect-video bg-gray-100 w-full relative">
          {report.imageUrl ? (
            <img src={report.imageUrl} alt="Waste report" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
              <Camera className="w-12 h-12 mb-2 opacity-50" />
              <p>No photo provided</p>
            </div>
          )}
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Location</p>
              <div className="flex items-start gap-3 text-gray-900 font-medium">
                <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p>{report.address || `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`}</p>
              </div>
            </div>
            
            <div>
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Reported At</p>
              <div className="flex items-center gap-3 text-gray-900 font-medium">
                <Clock className="w-5 h-5 text-primary shrink-0" />
                <p>{format(new Date(report.createdAt), "MMM d, yyyy 'at' h:mm a")}</p>
              </div>
            </div>
          </div>

          {report.description && (
            <div className="pt-6 border-t border-gray-100">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</p>
              <p className="text-gray-800 bg-gray-50 p-4 rounded-xl italic">"{report.description}"</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Area */}
      <div className="space-y-4">
        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="block">
          <Button variant="outline" size="lg" className="w-full h-14 text-lg font-bold rounded-2xl bg-white">
            <MapPin className="w-5 h-5 mr-2" />
            Navigate to Location
          </Button>
        </a>

        {report.status === 'reported' && (
          <Button 
            size="lg" 
            className="w-full h-14 text-lg font-bold rounded-2xl bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg shadow-yellow-500/25"
            onClick={() => handleStatusChange("cleaning")}
            disabled={updateReport.isPending}
          >
            {updateReport.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Mark as In Progress"}
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
              className="w-full h-14 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || updateReport.isPending}
            >
              {isUploading ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Uploading Photo...</>
              ) : (
                <><Camera className="w-5 h-5 mr-2" /> Snap Cleanup Photo & Resolve</>
              )}
            </Button>
          </div>
        )}

        {report.status === 'cleaned' && report.cleanupImageUrl && (
          <div className="mt-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle2 className="text-primary w-6 h-6" /> Resolution Photo
            </h3>
            <div className="rounded-3xl overflow-hidden border border-gray-200 shadow-sm">
              <img src={report.cleanupImageUrl} alt="Cleaned up" className="w-full h-auto" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
