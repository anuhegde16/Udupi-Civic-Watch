import { useRoute, useLocation } from "wouter";
import { useState, useRef, useMemo } from "react";
import { useGetReport, useUpdateReport, useUploadImage, getGetOfficerReportsQueryKey, getGetReportQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Clock, ArrowLeft, Camera, CheckCircle2, HardHat, FileWarning, Info, ArrowUpRight, X, Plus, Images } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ReportLocationMap } from "@/components/report-location-map";
import { compressImage } from "@/lib/compress-image";
import { getRandomMotivationalQuote } from "@/lib/motivational-quotes";
import { useImageLightbox } from "@/components/image-lightbox";

type CleanupPhoto = { id: string; preview: string; url: string; uploadedAt: string };
const MAX_CLEANUP_PHOTOS = 5;

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
  const [cleanupPhotos, setCleanupPhotos] = useState<CleanupPhoto[]>([]);
  const resolvedQuote = useMemo(() => getRandomMotivationalQuote("fieldOfficerResolved"), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { lightbox, open: openLightbox } = useImageLightbox();

  if (isLoading || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground h-full animate-in fade-in duration-500">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="font-bold text-lg text-foreground">Loading report details...</p>
      </div>
    );
  }

  const handleStatusChange = (
    status: "reported" | "cleaning" | "cleaned",
    cleanupImageUrl?: string,
    cleanupImageUrls?: { url: string; uploadedAt: string }[]
  ) => {
    updateReport.mutate(
      { id, data: { status, cleanupImageUrl, cleanupImageUrls } },
      {
        onSuccess: (updatedReport) => {
          const quoteDescription = status === "cleaning"
            ? getRandomMotivationalQuote("fieldOfficerAccepted")
            : undefined;
          toast({
            title: "Status Updated",
            description: quoteDescription ?? `Report is now marked as ${status}`,
          });
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
    e.target.value = "";
    if (cleanupPhotos.length >= MAX_CLEANUP_PHOTOS) return;

    const photoId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      setIsUploading(true);
      const compressed = await compressImage(file);
      setCleanupPhotos(prev => [...prev, { id: photoId, preview: compressed, url: "", uploadedAt: "" }]);

      uploadImage.mutate(
        { data: { dataUrl: compressed } },
        {
          onSuccess: (data) => {
            setCleanupPhotos(prev => prev.map(p =>
              p.id === photoId ? { ...p, url: data.url, uploadedAt: data.uploadedAt } : p
            ));
            setIsUploading(false);
          },
          onError: (err) => {
            setCleanupPhotos(prev => prev.filter(p => p.id !== photoId));
            toast({ title: "Upload failed", description: err.message, variant: "destructive" });
            setIsUploading(false);
          }
        }
      );
    } catch {
      setIsUploading(false);
      toast({ title: "Error", description: "Failed to process image. Please try again.", variant: "destructive" });
    }
  };

  const removeCleanupPhoto = (id: string) => {
    setCleanupPhotos(prev => prev.filter(p => p.id !== id));
  };

  const handleSubmitCleanup = () => {
    const allUploaded = cleanupPhotos.every(p => p.url);
    if (!allUploaded || cleanupPhotos.length === 0) return;
    const urls = cleanupPhotos.map(p => ({ url: p.url, uploadedAt: p.uploadedAt }));
    handleStatusChange("cleaned", urls[0].url, urls);
  };

  const getStatusBadge = () => {
    switch (report.status) {
      case 'reported': return <Badge className="bg-destructive text-destructive-foreground px-4 py-1.5 text-sm font-black uppercase tracking-wider"><FileWarning className="w-4 h-4 mr-2"/> New Report</Badge>;
      case 'cleaning': return <Badge className="bg-secondary text-secondary-foreground px-4 py-1.5 text-sm font-black uppercase tracking-wider"><HardHat className="w-4 h-4 mr-2"/> In Progress</Badge>;
      case 'cleaned': return <Badge className="bg-primary text-primary-foreground px-4 py-1.5 text-sm font-black uppercase tracking-wider"><CheckCircle2 className="w-4 h-4 mr-2"/> Cleaned</Badge>;
      default: return null;
    }
  };

  // Build display arrays — prefer imageUrls array (filter out null/sparse entries), fall back to legacy single field
  const validImageUrls = (report.imageUrls ?? []).filter(
    (p) => !!p && typeof p.url === "string" && p.url.length > 0
  );
  const reportPhotos: { url: string; uploadedAt?: string | null }[] =
    validImageUrls.length > 0
      ? validImageUrls
      : report.imageUrl ? [{ url: report.imageUrl, uploadedAt: report.imageUploadedAt ?? null }] : [];

  const resolvedCleanupPhotos: { url: string; uploadedAt?: string | null }[] =
    (report.cleanupImageUrls && report.cleanupImageUrls.length > 0)
      ? report.cleanupImageUrls
      : report.cleanupImageUrl ? [{ url: report.cleanupImageUrl, uploadedAt: null }] : [];

  const osmUrl = `https://www.google.com/maps?q=${report.latitude},${report.longitude}`;
  const allCleanupUploaded = cleanupPhotos.length > 0 && cleanupPhotos.every(p => p.url);

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
          {/* Original report photos */}
          <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border/30">
              <Badge className="bg-background text-foreground border border-border font-bold uppercase tracking-wider text-xs">
                Original {reportPhotos.length > 1 ? `Photos (${reportPhotos.length})` : "Photo"}
              </Badge>
            </div>
            {reportPhotos.length > 0 ? (
              <div className={`grid gap-1 ${reportPhotos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {reportPhotos.map((photo, idx) => (
                  <div key={idx} className="aspect-[4/3] bg-muted relative group">
                    <button
                      type="button"
                      onClick={() => openLightbox(reportPhotos.map((p) => p.url), idx)}
                      className="absolute inset-0 w-full h-full cursor-zoom-in"
                      aria-label={`View report photo ${idx + 1} full screen`}
                    >
                      <img
                        src={photo.url}
                        alt={`Report photo ${idx + 1} of ${reportPhotos.length}`}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </button>
                    {reportPhotos.length > 1 && (
                      <div className="absolute top-0 left-0 bg-black/60 px-2 py-1 rounded-br-lg">
                        <p className="text-white text-[10px] font-bold tracking-wide">
                          Photo {idx + 1} of {reportPhotos.length}
                        </p>
                      </div>
                    )}
                    {photo.uploadedAt && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                        <p className="text-white text-[10px] font-medium text-center">
                          {format(new Date(photo.uploadedAt), "h:mm a, MMM d")}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="aspect-[4/3] bg-muted flex flex-col items-center justify-center text-muted-foreground">
                <Camera className="w-12 h-12 mb-3 opacity-50" />
                <p className="font-medium">No photo provided</p>
              </div>
            )}
          </div>

          {/* Resolved cleanup photos */}
          {report.status === 'cleaned' && resolvedCleanupPhotos.length > 0 && (
            <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border/30">
                <Badge className="bg-green-500 text-white border-transparent font-bold uppercase tracking-wider text-xs shadow-lg shadow-green-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Cleaned Up {resolvedCleanupPhotos.length > 1 ? `(${resolvedCleanupPhotos.length})` : ""}
                </Badge>
              </div>
              <div className={`grid gap-1 ${resolvedCleanupPhotos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {resolvedCleanupPhotos.map((photo, idx) => (
                  <div key={idx} className="aspect-[4/3] bg-muted relative group">
                    <button
                      type="button"
                      onClick={() => openLightbox(resolvedCleanupPhotos.map((p) => p.url), idx)}
                      className="absolute inset-0 w-full h-full cursor-zoom-in"
                      aria-label={`View cleanup photo ${idx + 1} full screen`}
                    >
                      <img
                        src={photo.url}
                        alt={`Cleanup photo ${idx + 1}`}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    </button>
                    {photo.uploadedAt && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                        <p className="text-white text-[10px] font-medium text-center">
                          {format(new Date(photo.uploadedAt), "h:mm a, MMM d")}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
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

              {reportPhotos.length > 0 && reportPhotos[0].uploadedAt && (
                <div className="flex flex-col gap-1 mb-6">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Photo Uploaded At</p>
                  <div className="flex items-center gap-2 text-foreground font-medium bg-muted/50 p-3 rounded-xl">
                    <Camera className="w-5 h-5 text-primary shrink-0" />
                    <p>{format(new Date(reportPhotos[0].uploadedAt), "MMM d, yyyy 'at' h:mm a")}</p>
                  </div>
                </div>
              )}

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
              <div className="pt-2 space-y-3">
                {/* Hidden file input — no capture attr so gallery + camera both work for officers */}
                <input 
                  type="file" 
                  accept="image/*"
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />

                {/* Staged cleanup photos */}
                {cleanupPhotos.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Cleanup Photos ({cleanupPhotos.length}/{MAX_CLEANUP_PHOTOS})
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {cleanupPhotos.map((photo) => (
                        <div key={photo.id} className="relative rounded-xl overflow-hidden bg-muted aspect-square group">
                          <img src={photo.preview} alt="Cleanup" className="w-full h-full object-cover" />
                          {!photo.url && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="w-5 h-5 animate-spin text-white" />
                            </div>
                          )}
                          {photo.uploadedAt && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5">
                              <p className="text-white text-[9px] font-medium text-center">
                                {format(new Date(photo.uploadedAt), "h:mm a")}
                              </p>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeCleanupPhoto(photo.id)}
                            className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-red-500/90 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}

                      {/* Add more slot */}
                      {cleanupPhotos.length < MAX_CLEANUP_PHOTOS && !isUploading && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:bg-primary/5 transition-all"
                        >
                          <Plus className="w-5 h-5" />
                          <span className="text-[10px] font-bold mt-0.5">Add</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Add first photo button */}
                {cleanupPhotos.length === 0 && (
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="w-full h-14 text-base font-bold rounded-xl border-primary/30 text-primary hover:bg-primary/5"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Uploading...</>
                    ) : (
                      <><Images className="w-5 h-5 mr-2" /> Add Cleanup Photos</>
                    )}
                  </Button>
                )}

                {/* Submit cleanup */}
                {cleanupPhotos.length > 0 && (
                  <Button 
                    size="lg" 
                    className="w-full h-14 text-lg font-black rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:-translate-y-1"
                    onClick={handleSubmitCleanup}
                    disabled={!allCleanupUploaded || isUploading || updateReport.isPending}
                  >
                    {updateReport.isPending || isUploading ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {isUploading ? "Uploading..." : "Saving..."}</>
                    ) : (
                      <><CheckCircle2 className="w-5 h-5 mr-2" /> Mark as Cleaned</>
                    )}
                  </Button>
                )}

                <p className="text-center text-xs text-muted-foreground font-medium">
                  You can upload up to {MAX_CLEANUP_PHOTOS} photos from your camera or gallery. Submitting will resolve this report.
                </p>
              </div>
            )}

            {report.status === 'cleaned' && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3 animate-in fade-in duration-700">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-primary font-bold">Great job!</p>
                  <p className="text-sm text-foreground/70 font-medium mt-1 italic">&#8220;{resolvedQuote}&#8221;</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {lightbox}
    </div>
  );
}
