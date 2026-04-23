import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Camera, MapPin, Loader2, CheckCircle2, ArrowRight, Info } from "lucide-react";
import { useCreateReport, useUploadImage } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export default function Report() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [step, setStep] = useState<"form" | "success">("form");
  const [createdId, setCreatedId] = useState<number | null>(null);
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [location, setGeoLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  
  const [description, setDescription] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const createReport = useCreateReport();
  const uploadImage = useUploadImage();
  
  useEffect(() => {
    // Auto-detect location on mount
    getLocation();
  }, []);
  
  const getLocation = () => {
    setIsLocating(true);
    setLocationError(null);
    
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      setIsLocating(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setIsLocating(false);
      },
      (error) => {
        console.error("Error getting location", error);
        setLocationError("Could not get your location. Please ensure location services are enabled.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    // Upload
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
              setImageUrl(data.url);
              setIsUploading(false);
            },
            onError: (err) => {
              toast({ title: "Upload failed", description: err.message || "Could not upload image", variant: "destructive" });
              setIsUploading(false);
              setImagePreview(null);
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
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!location) {
      toast({ title: "Location required", description: "Please allow location access to submit a report.", variant: "destructive" });
      return;
    }
    
    createReport.mutate(
      {
        data: {
          latitude: location.lat,
          longitude: location.lng,
          imageUrl: imageUrl,
          description: description || undefined
        }
      },
      {
        onSuccess: (data) => {
          setCreatedId(data.id);
          setStep("success");
          
          // Save to local storage to show on home page recent reports
          try {
            const recent = JSON.parse(localStorage.getItem('recent_reports') || '[]');
            localStorage.setItem('recent_reports', JSON.stringify([...recent, data.id].slice(-5)));
          } catch(e) {}
        },
        onError: (err) => {
          toast({ title: "Failed to submit", description: err.message || "An error occurred", variant: "destructive" });
        }
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
          Thank you. You've just helped prevent more waste from entering the Arabian Sea. The municipal team has been notified.
        </p>
        
        <div className="bg-card rounded-2xl p-6 w-full mb-8 border border-border/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/5 rounded-bl-full" />
          <p className="text-sm text-muted-foreground font-bold mb-1 uppercase tracking-wider">Report ID</p>
          <p className="text-4xl font-mono font-black text-foreground">#{createdId}</p>
        </div>
        
        <div className="flex flex-col gap-3 w-full">
          <Button size="lg" className="w-full text-lg h-14 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 font-bold" onClick={() => setLocation(`/track/${createdId}`)}>
            Track Progress
          </Button>
          <Button variant="outline" size="lg" className="w-full text-lg h-14 rounded-xl font-bold hover:bg-muted" onClick={() => setLocation("/")}>
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
        <p className="text-muted-foreground font-medium">Spotted waste on our coast? Every report helps us protect Udupi's beaches.</p>
        
        <div className="mt-4 p-3 bg-secondary/10 rounded-xl border border-secondary/20 flex items-start gap-3">
          <Info className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
          <p className="text-sm text-secondary-foreground font-medium">Did you know? 1 cigarette butt poisons 1,000 litres of seawater. Every small piece matters.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Photo Section */}
        <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-sm space-y-4">
          <Label className="text-lg font-black text-foreground flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm">1</span>
            Take a Photo
            {isUploading && <Loader2 className="w-4 h-4 animate-spin text-primary ml-auto" />}
          </Label>
          
          <input 
            type="file" 
            accept="image/*" 
            capture="environment"
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          
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
              <span className="text-sm mt-1">Clear photos help us dispatch the right equipment</span>
            </button>
          ) : (
            <div className="relative w-full h-64 rounded-2xl overflow-hidden shadow-sm border border-border group">
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={() => fileInputRef.current?.click()}
                  className="font-bold rounded-xl"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Retake Photo
                </Button>
              </div>
            </div>
          )}
        </div>
        
        {/* Location Section */}
        <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-lg font-black text-foreground flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm">2</span>
              Location
            </Label>
            {!isLocating && (
              <Button type="button" variant="ghost" size="sm" onClick={getLocation} className="h-8 text-primary hover:text-primary hover:bg-primary/10 font-bold rounded-lg">
                <MapPin className="w-4 h-4 mr-1.5" />
                Refresh
              </Button>
            )}
          </div>
          
          <div className="bg-muted border border-border rounded-2xl overflow-hidden min-h-[160px] flex items-center justify-center relative shadow-inner">
            {isLocating ? (
              <div className="flex flex-col items-center text-muted-foreground p-6">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                <span className="font-bold">Finding your location...</span>
              </div>
            ) : locationError ? (
              <div className="flex flex-col items-center text-center text-muted-foreground p-6">
                <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-3">
                  <MapPin className="w-6 h-6" />
                </div>
                <span className="text-destructive font-bold mb-3">{locationError}</span>
                <Button type="button" variant="outline" size="sm" onClick={getLocation} className="font-bold">Try Again</Button>
              </div>
            ) : location ? (
              <div className="w-full h-[220px] relative">
                <iframe
                  title="Location Map"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.008},${location.lat - 0.006},${location.lng + 0.008},${location.lat + 0.006}&layer=mapnik&marker=${location.lat},${location.lng}`}
                  className="w-full h-full border-0 grayscale-[0.2] contrast-125 sepia-[0.2]"
                  loading="lazy"
                />
                <div className="absolute bottom-3 left-3 right-3 bg-background/95 backdrop-blur-md rounded-xl border border-border/50 px-4 py-3 flex items-center gap-3 shadow-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-mono font-bold text-foreground">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
                    <span className="text-xs text-muted-foreground font-medium">Udupi District, Karnataka</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        
        {/* Details Section */}
        <div className="bg-card rounded-3xl p-6 border border-border/50 shadow-sm space-y-4">
          <Label htmlFor="description" className="text-lg font-black text-foreground flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm">3</span>
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
              <span className="flex items-center">
                Submit Report <ArrowRight className="ml-2 w-6 h-6" />
              </span>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
