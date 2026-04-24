import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Camera, MapPin, Loader2, CheckCircle2, ArrowRight, Info, Navigation, Hand } from "lucide-react";
import { useCreateReport, useUploadImage } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { MapPicker } from "@/components/map-picker";

export default function Report() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<"form" | "success">("form");
  const [createdId, setCreatedId] = useState<number | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [location, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMode, setLocationMode] = useState<"auto" | "manual">("auto");

  const [description, setDescription] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const createReport = useCreateReport();
  const uploadImage = useUploadImage();

  const UDUPI_CENTER = { lat: 13.3409, lng: 74.7421 };

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      setIsLocating(false);
      setLocationMode("manual");
      setGeoLocation((cur) => cur ?? UDUPI_CENTER);
      toast({ title: "GPS not available", description: "Drag the pin on the map to mark the exact location.", variant: "destructive" });
      return;
    }

    let resolved = false;

    // Hard fallback: if the browser never calls back (e.g. iframe sandbox), bail after 5s
    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setIsLocating(false);
        setLocationMode("manual");
        setGeoLocation((cur) => cur ?? UDUPI_CENTER);
        toast({ title: "Location unavailable", description: "Could not get your GPS location. Drag the pin on the map to the correct spot.", variant: "destructive" });
      }
    }, 5000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimer);
        setGeoLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationMode("auto");
        setIsLocating(false);
      },
      (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimer);
        setIsLocating(false);
        setLocationMode("manual");
        setGeoLocation((cur) => cur ?? UDUPI_CENTER);
        const msg = err.code === 1
          ? "Location permission denied. Please allow location access or drag the pin to mark the spot."
          : "Could not get your location. Drag the pin on the map to the correct spot.";
        toast({ title: "Location unavailable", description: msg, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setImagePreview(event.target?.result as string);
    reader.readAsDataURL(file);
    try {
      setIsUploading(true);
      const dr = new FileReader();
      dr.readAsDataURL(file);
      dr.onload = () => {
        uploadImage.mutate(
          { data: { dataUrl: dr.result as string } },
          {
            onSuccess: (data) => { setImageUrl(data.url); setIsUploading(false); },
            onError: (err) => {
              toast({ title: "Upload failed", description: err.message, variant: "destructive" });
              setIsUploading(false);
              setImagePreview(null);
            },
          }
        );
      };
    } catch {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      toast({ title: "Location required", description: "Please set a location on the map before submitting.", variant: "destructive" });
      return;
    }
    createReport.mutate(
      { data: { latitude: location.lat, longitude: location.lng, imageUrl, description: description || undefined } },
      {
        onSuccess: (data) => {
          setCreatedId(data.id);
          setStep("success");
          try {
            const recent = JSON.parse(localStorage.getItem("recent_reports") || "[]");
            localStorage.setItem("recent_reports", JSON.stringify([...recent, data.id].slice(-5)));
          } catch {}
        },
        onError: (err) => toast({ title: "Failed to submit", description: err.message, variant: "destructive" }),
      }
    );
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
        </div>
        <div className="flex flex-col gap-3 w-full">
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
            Take a Photo
            {isUploading && <Loader2 className="w-4 h-4 animate-spin text-primary ml-auto" />}
          </Label>
          <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          {!imagePreview ? (
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
          ) : (
            <div className="relative w-full h-64 rounded-2xl overflow-hidden shadow-sm border border-border group">
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} className="font-bold rounded-xl">
                  <Camera className="w-4 h-4 mr-2" /> Retake Photo
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Location */}
        <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-lg font-black text-foreground flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">2</span>
              Location
            </Label>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2 p-1 bg-muted rounded-xl">
            <button
              type="button"
              onClick={() => { setLocationMode("auto"); getLocation(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${locationMode === "auto" ? "bg-card shadow text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Navigation className="w-4 h-4" />
              Use My Location
            </button>
            <button
              type="button"
              onClick={() => {
                setLocationMode("manual");
                // Drop a marker at current location or Udupi center so it's immediately draggable
                if (!location) setGeoLocation(UDUPI_CENTER);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${locationMode === "manual" ? "bg-card shadow text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Hand className="w-4 h-4" />
              Place on Map
            </button>
          </div>

          {/* Map container */}
          <div className="rounded-2xl overflow-hidden border border-border shadow-inner bg-muted" style={{ height: "280px" }}>
            {isLocating ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                <span className="font-bold">Finding your location...</span>
              </div>
            ) : (
              <MapPicker value={location} onChange={setGeoLocation} height="280px" />
            )}
          </div>

          {locationMode === "manual" && location && (
            <p className="text-sm text-center text-muted-foreground font-medium flex items-center justify-center gap-2 animate-in fade-in duration-300">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              Drag the pin to the exact waste location. You can also tap anywhere to move it.
            </p>
          )}

          {location && (
            <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-mono font-bold text-foreground">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
                <span className="text-xs text-muted-foreground font-medium">Udupi District, Karnataka — pin is draggable</span>
              </div>
              {locationMode === "auto" && (
                <Button type="button" variant="ghost" size="sm" onClick={getLocation} className="ml-auto h-8 text-primary hover:bg-primary/10 font-bold rounded-lg text-xs">
                  Refresh
                </Button>
              )}
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
            disabled={!location || isLocating || isUploading || createReport.isPending}
          >
            {createReport.isPending ? (
              <Loader2 className="w-6 h-6 mr-2 animate-spin" />
            ) : (
              <span className="flex items-center">Submit Report <ArrowRight className="ml-2 w-6 h-6" /></span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
