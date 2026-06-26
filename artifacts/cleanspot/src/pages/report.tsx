import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, MapPin, Loader2, CheckCircle2, ArrowRight, Info, Navigation, AlertTriangle, Hand, Mail, Bell, LayoutGrid, X, Plus } from "lucide-react";
import { useCreateReport, useUploadImage, customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { MapPicker } from "@/components/map-picker";
import geofencesData from "@/data/geofences.json";
import { saveReport } from "@/hooks/use-saved-reports";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NotificationCTABanner } from "@/components/notification-cta-banner";
import { compressImage } from "@/lib/compress-image";
import { format } from "date-fns";

// Ray-casting point-in-polygon. Ring is GeoJSON [lon, lat] pairs.
function pointInPolygon(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isWithinServiceArea(lat: number, lng: number): boolean {
  for (const feature of geofencesData.features) {
    if (feature.geometry.type === "Polygon") {
      const ring = feature.geometry.coordinates[0] as [number, number][];
      if (pointInPolygon(lat, lng, ring)) return true;
    }
  }
  return false;
}

type PhotoEntry = { id: string; preview: string; url: string; uploadedAt: string };
const MAX_CITIZEN_PHOTOS = 2;

export default function Report() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<"form" | "success">("form");
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [assignedWardName, setAssignedWardName] = useState<string | null>(null);

  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [location, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMode, setLocationMode] = useState<"auto" | "manual">("auto");

  const [description, setDescription] = useState("");

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [reporterEmail, setReporterEmail] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const createReport = useCreateReport();
  const uploadImage = useUploadImage();

  const { data: testModeData } = useQuery({
    queryKey: ["test-mode"],
    queryFn: () => customFetch<{ testMode: boolean }>("/api/admin/test-mode"),
    refetchInterval: 10000,
  });
  const testMode = testModeData?.testMode ?? false;

  const geofenceRing = useMemo<[number, number][] | undefined>(() => {
    const first = geofencesData.features[0];
    if (first?.geometry.type === "Polygon") {
      return first.geometry.coordinates[0] as [number, number][];
    }
    return undefined;
  }, []);

  const outsideFence = useMemo(() => {
    if (!location) return false;
    return !isWithinServiceArea(location.lat, location.lng);
  }, [location?.lat, location?.lng]);

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      setIsLocating(false);
      toast({ title: "GPS not available", description: "This device does not support GPS. Location is required to submit a report.", variant: "destructive" });
      return;
    }

    let resolved = false;

    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setIsLocating(false);
        toast({ title: "Location unavailable", description: "Could not get your GPS location. Please ensure location permission is granted and try again.", variant: "destructive" });
      }
    }, 5000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimer);
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoLocation(coords);
        setGpsCoords(coords);
        setIsLocating(false);
      },
      (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimer);
        setIsLocating(false);
        if (testMode) {
          setLocationMode("manual");
          toast({ title: "GPS unavailable — using manual placement", description: "Test mode active: drag the pin to set the report location." });
        } else {
          const msg = err.code === 1
            ? "Location permission denied. Please allow location access and tap Refresh to try again."
            : "Could not get your GPS location. Please ensure location permission is granted and try again.";
          toast({ title: "Location unavailable", description: msg, variant: "destructive" });
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (photos.length >= MAX_CITIZEN_PHOTOS) return;

    const photoId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      setIsUploading(true);
      const compressed = await compressImage(file);
      setPhotos(prev => [...prev, { id: photoId, preview: compressed, url: "", uploadedAt: "" }]);

      uploadImage.mutate(
        { data: { dataUrl: compressed } },
        {
          onSuccess: (data) => {
            setPhotos(prev => prev.map(p =>
              p.id === photoId ? { ...p, url: data.url, uploadedAt: data.uploadedAt } : p
            ));
            setIsUploading(false);
          },
          onError: (err) => {
            setPhotos(prev => prev.filter(p => p.id !== photoId));
            toast({ title: "Upload failed", description: err.message, variant: "destructive" });
            setIsUploading(false);
          },
        }
      );
    } catch {
      setIsUploading(false);
      toast({ title: "Error", description: "Failed to process image. Please try again.", variant: "destructive" });
    }
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const doSubmit = (email?: string) => {
    setEmailDialogOpen(false);
    if (!location) return;
    const imageUrls = photos.filter(p => p.url).map(p => ({ url: p.url, uploadedAt: p.uploadedAt }));
    createReport.mutate(
      {
        data: {
          latitude: location.lat,
          longitude: location.lng,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          description: description || undefined,
          reporterEmail: email || undefined,
        },
      },
      {
        onSuccess: (data) => {
          setCreatedId(data.id);
          setAssignedWardName(data.assignedOfficer?.wardName ?? null);
          setStep("success");
          saveReport(data.id);
        },
        onError: (err) => toast({ title: "Failed to submit", description: err.message, variant: "destructive" }),
      }
    );
  };

  const allPhotosUploaded = photos.length > 0 && photos.every(p => p.url !== "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (photos.length === 0) {
      toast({ title: "Photo required", description: "Please take a photo of the waste before submitting.", variant: "destructive" });
      return;
    }
    if (!allPhotosUploaded) {
      toast({ title: "Upload in progress", description: "Please wait for all photos to finish uploading.", variant: "destructive" });
      return;
    }
    if (!location) {
      toast({ title: "Location required", description: "GPS location is required. Please allow location access and try again.", variant: "destructive" });
      return;
    }
    if (outsideFence && !testMode) {
      toast({ title: "Outside service area", description: "Please move the pin inside the Saligrama service boundary.", variant: "destructive" });
      return;
    }
    setReporterEmail("");
    setEmailDialogOpen(true);
  };

  if (step === "success") {
    return (
      <div className="max-w-md mx-auto w-full flex flex-col items-center justify-center text-center pt-12 pb-8 px-4 h-full animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6 shadow-xl shadow-primary/20">
          <CheckCircle2 className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-black text-foreground mb-2">Reported Successfully!</h2>
        <p className="text-muted-foreground mb-8 max-w-sm font-medium leading-relaxed">
          Thank you. You've just helped prevent more waste from reaching the Arabian Sea. The municipal team has been notified.
        </p>
        <div className="bg-card rounded-2xl p-6 w-full mb-8 border border-border/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/5 rounded-bl-full" />
          <p className="text-sm text-muted-foreground font-bold mb-1 uppercase tracking-wider">Report ID</p>
          <p className="text-4xl font-mono font-black text-foreground">#{createdId}</p>
          {assignedWardName && (
            <div className="mt-3 flex items-center gap-2 pt-3 border-t border-border/50">
              <LayoutGrid className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-bold text-foreground">Ward: <span className="text-primary">{assignedWardName}</span></span>
            </div>
          )}
        </div>
        <NotificationCTABanner variant="citizen" reportId={createdId ?? undefined} />
        <div className="flex flex-col gap-3 w-full mt-4">
          <Button size="lg" className="w-full text-lg h-14 rounded-xl" onClick={() => setLocation(`/track/${createdId}`)}>
            Track Progress
          </Button>
          <Button variant="outline" size="lg" className="w-full text-lg h-14 rounded-xl" onClick={() => setLocation("/")}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto w-full pb-10 pt-4 animate-in fade-in duration-500">
      <div className="mb-8 bg-card rounded-3xl p-6 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full" />
        <h1 className="text-3xl font-black text-foreground mb-2 tracking-tight">New Report</h1>
        <p className="text-muted-foreground font-medium">Spotted waste on our coast? Every report helps protect Udupi's beaches.</p>
        <div className="mt-4 p-3 bg-secondary/10 rounded-xl border border-secondary/20 flex items-start gap-3">
          <Info className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
          <p className="text-sm text-secondary-foreground font-medium">1 cigarette butt poisons 1,000 litres of seawater. Every small piece matters.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Photo */}
        <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-sm space-y-4">
          <Label className="text-lg font-black text-foreground flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">1</span>
            Take Photos
            {isUploading && <Loader2 className="w-4 h-4 animate-spin text-primary ml-auto" />}
          </Label>

          {/* Camera-only file input — no gallery access for citizens */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          {/* Empty state */}
          {photos.length === 0 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-48 border-2 border-dashed border-border rounded-2xl bg-muted/50 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted hover:border-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 group"
            >
              <div className="w-14 h-14 rounded-full bg-background border border-border flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                <Camera className="w-6 h-6 text-foreground/70" />
              </div>
              <span className="font-bold text-foreground">Tap to open camera</span>
              <span className="text-sm mt-1">Clear photos help dispatch the right equipment</span>
            </button>
          )}

          {/* Photo thumbnails grid */}
          {photos.length > 0 && (
            <div className={`grid gap-3 ${photos.length === MAX_CITIZEN_PHOTOS ? "grid-cols-2" : "grid-cols-2"}`}>
              {photos.map((photo) => (
                <div key={photo.id} className="relative rounded-2xl overflow-hidden bg-muted aspect-[4/3] group border border-border/50">
                  <img src={photo.preview} alt="Waste photo" className="w-full h-full object-cover" />
                  {/* Uploading overlay */}
                  {!photo.url && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                    </div>
                  )}
                  {/* Timestamp badge */}
                  {photo.uploadedAt && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                      <p className="text-white text-[10px] font-medium text-center">
                        {format(new Date(photo.uploadedAt), "h:mm a, MMM d")}
                      </p>
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-red-500/90 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label="Remove photo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Add another photo slot */}
              {photos.length < MAX_CITIZEN_PHOTOS && !isUploading && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-[4/3] border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:bg-primary/5 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  <Plus className="w-6 h-6 mb-1" />
                  <span className="text-xs font-bold">Add Photo</span>
                  <span className="text-[10px] text-muted-foreground/70 mt-0.5">{photos.length}/{MAX_CITIZEN_PHOTOS}</span>
                </button>
              )}
            </div>
          )}

          {/* Tip */}
          <div className="flex items-start gap-2.5 bg-primary/5 border border-primary/10 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground font-medium leading-relaxed">
              <span className="font-bold text-foreground">Tip:</span> You can upload a maximum of 2 photos. For larger waste areas, try one wide shot and one close-up for better clarity.
            </p>
          </div>
        </div>

        {/* Location */}
        <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-lg font-black text-foreground flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">2</span>
              Location
            </Label>
            {testMode && (
              <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setLocationMode("auto")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${locationMode === "auto" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Navigation className="w-3.5 h-3.5" /> GPS
                </button>
                <button
                  type="button"
                  onClick={() => setLocationMode("manual")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${locationMode === "manual" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Hand className="w-3.5 h-3.5" /> Manual
                </button>
              </div>
            )}
          </div>

          {(!testMode || locationMode === "auto") ? (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Navigation className="w-4 h-4 text-primary shrink-0" />
              <span>Location is detected automatically using your phone's GPS</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <Hand className="w-4 h-4 shrink-0" />
              <span>Drag the pin or tap the map to set the exact waste location</span>
            </div>
          )}

          <div className="rounded-2xl overflow-hidden border border-border shadow-inner bg-muted" style={{ height: "300px" }}>
            {isLocating ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                <span className="font-bold">Finding your location...</span>
              </div>
            ) : (
              <MapPicker
                value={location}
                onChange={setGeoLocation}
                height="300px"
                geofenceRing={geofenceRing}
                outsideFence={outsideFence}
                readonly={!testMode || locationMode === "auto"}
                userLocation={gpsCoords}
              />
            )}
          </div>

          {outsideFence && location && !testMode && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700">Outside service area</p>
                <p className="text-xs text-red-600 mt-0.5">This location is outside the Saligrama service boundary. Move the pin inside the highlighted zone to submit.</p>
              </div>
            </div>
          )}

          {location && !outsideFence && (
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-mono font-bold text-foreground">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
                <span className="text-xs text-muted-foreground font-medium">Saligrama, Udupi District — GPS location</span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={getLocation} className="ml-auto h-8 text-primary hover:bg-primary/10 font-bold rounded-lg text-xs">
                Refresh
              </Button>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-sm space-y-4">
          <Label htmlFor="description" className="text-lg font-black text-foreground flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">3</span>
            Additional Details <span className="text-muted-foreground font-medium text-sm ml-1">(Optional)</span>
          </Label>
          <Textarea
            id="description"
            placeholder="What kind of waste is it? Is it near the water? Any landmarks nearby?"
            className="resize-none min-h-[120px] rounded-2xl bg-muted/50 border-border focus-visible:ring-primary focus-visible:ring-offset-2 text-base p-4 placeholder:text-muted-foreground/60"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="pt-4 pb-12 sticky bottom-4 z-20">
          <Button
            type="submit"
            size="lg"
            className="w-full h-16 text-xl font-black rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 transition-all hover:-translate-y-1 disabled:opacity-70 disabled:shadow-none disabled:transform-none disabled:cursor-not-allowed"
            disabled={photos.length === 0 || !allPhotosUploaded || !location || isLocating || isUploading || createReport.isPending || (outsideFence && !testMode)}
          >
            {createReport.isPending ? (
              <Loader2 className="w-6 h-6 mr-2 animate-spin" />
            ) : isUploading ? (
              <span className="flex items-center"><Loader2 className="ml-2 w-5 h-5 mr-2 animate-spin" /> Uploading...</span>
            ) : outsideFence && !testMode ? (
              <span className="flex items-center"><AlertTriangle className="ml-2 w-5 h-5 mr-2" /> Outside Service Area</span>
            ) : (
              <span className="flex items-center">Submit Report <ArrowRight className="ml-2 w-6 h-6" /></span>
            )}
          </Button>
        </div>
      </form>

      {/* Email opt-in dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={(open) => { if (!open && !createReport.isPending) setEmailDialogOpen(false); }}>
        <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden gap-0">
          <div className="bg-primary/5 border-b border-primary/10 px-6 pt-6 pb-5">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-xl font-black">Get updates on your complaint</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground font-medium leading-relaxed">
                Add your email and we'll notify you when cleaning starts and when the waste is removed. Completely optional.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="your@email.com"
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSubmit(reporterEmail.trim() || undefined); } }}
                className="pl-9 h-12 rounded-xl text-base"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button
                className="w-full h-12 text-base font-bold rounded-xl"
                onClick={() => doSubmit(reporterEmail.trim() || undefined)}
                disabled={createReport.isPending}
              >
                {createReport.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Notify Me
              </Button>
              <Button
                variant="ghost"
                className="w-full h-10 text-sm font-medium rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => doSubmit(undefined)}
                disabled={createReport.isPending}
              >
                Skip — submit without email
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Your email is used only for updates on this complaint and is not shared with anyone.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
