import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Camera, MapPin, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
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
      <div className="max-w-md mx-auto w-full flex flex-col items-center justify-center text-center pt-12 pb-8 px-4 h-full">
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-primary mb-6">
          <CheckCircle2 className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Reported Successfully!</h2>
        <p className="text-gray-600 mb-8 max-w-sm">
          Thank you for helping keep our community clean. Your report has been sent to the city sanitation team.
        </p>
        
        <div className="bg-gray-50 rounded-xl p-6 w-full mb-8 border border-gray-100">
          <p className="text-sm text-gray-500 font-medium mb-1 uppercase tracking-wider">Report ID</p>
          <p className="text-3xl font-mono font-bold text-gray-900">#{createdId}</p>
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
    <div className="max-w-md mx-auto w-full pb-10 pt-2">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">New Report</h1>
        <p className="text-gray-600">Spot some waste? Let us know where it is.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Photo Section */}
        <div className="space-y-3">
          <Label className="text-base font-semibold text-gray-900 flex items-center gap-2">
            1. Take a Photo
            {isUploading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
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
              className="w-full h-48 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-100 hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <Camera className="w-10 h-10 mb-3 text-gray-400" />
              <span className="font-medium text-gray-700">Tap to open camera</span>
            </button>
          ) : (
            <div className="relative w-full h-64 rounded-2xl overflow-hidden shadow-sm border border-gray-200">
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Retake Photo
                </Button>
              </div>
            </div>
          )}
        </div>
        
        {/* Location Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold text-gray-900">2. Location</Label>
            {!isLocating && (
              <Button type="button" variant="ghost" size="sm" onClick={getLocation} className="h-8 text-primary hover:text-primary hover:bg-primary/10">
                <MapPin className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </Button>
            )}
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden min-h-[140px] flex items-center justify-center relative">
            {isLocating ? (
              <div className="flex flex-col items-center text-gray-500 p-6">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                <span className="font-medium">Finding your location...</span>
              </div>
            ) : locationError ? (
              <div className="flex flex-col items-center text-center text-gray-500 p-6">
                <MapPin className="w-8 h-8 text-red-400 mb-2" />
                <span className="text-red-500 font-medium mb-3">{locationError}</span>
                <Button type="button" variant="outline" size="sm" onClick={getLocation}>Try Again</Button>
              </div>
            ) : location ? (
              <div className="w-full h-[200px] relative">
                <iframe
                  title="Location Map"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.008},${location.lat - 0.006},${location.lng + 0.008},${location.lat + 0.006}&layer=mapnik&marker=${location.lat},${location.lng}`}
                  className="w-full h-full border-0"
                  loading="lazy"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-3 py-2 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-mono text-gray-700">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
                  <span className="text-xs text-gray-500 ml-auto">Udupi District, Karnataka</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        
        {/* Details Section */}
        <div className="space-y-3">
          <Label htmlFor="description" className="text-base font-semibold text-gray-900">
            3. Additional Details <span className="text-gray-400 font-normal">(Optional)</span>
          </Label>
          <Textarea 
            id="description"
            placeholder="e.g. Broken glass on the sidewalk, large mattress..." 
            className="resize-none min-h-[100px] rounded-xl bg-white focus-visible:ring-primary text-base p-4"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="pt-4 pb-12">
          <Button 
            type="submit" 
            size="lg" 
            className="w-full h-16 text-lg font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all shadow-primary/25 disabled:opacity-70 disabled:shadow-none"
            disabled={!location || isLocating || isUploading || createReport.isPending}
          >
            {createReport.isPending ? (
              <Loader2 className="w-6 h-6 mr-2 animate-spin" />
            ) : (
              "Submit Report"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
