import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertTriangle, MapPin, Camera, ArrowRight, Activity, Map, ArrowDown, Droplets, Fish, AlertCircle } from "lucide-react";
import { LiveWasteMap } from "@/components/live-waste-map";

export default function Home() {
  return (
    <div className="flex flex-col h-full w-full">
      {/* Hero Section */}
      <section className="relative w-full rounded-[2rem] overflow-hidden min-h-[85vh] flex flex-col justify-end p-6 md:p-12 mb-16 shadow-2xl">
        <img 
          src="/hero-coast.png" 
          alt="Arabian Sea Coast at dusk" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
        
        <div className="relative z-10 max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/90 text-sm font-medium tracking-wide">
            <Droplets className="w-4 h-4 text-secondary" />
            Protecting Udupi's Coastline
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-white leading-[1.1]">
            Our sea is <br/>
            <span className="text-secondary">drowning</span>. <br/>
            You can help.
          </h1>
          
          <p className="text-lg md:text-xl text-white/80 max-w-xl leading-relaxed font-medium">
            Udupi's beaches are the lifeblood of our community. 
            Snap a photo of waste. Drop a pin. We'll send a team to clean it up.
          </p>
          
          <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <Link href="/report" className="block">
              <Button size="lg" className="w-full sm:w-auto h-16 px-8 text-lg font-bold rounded-2xl bg-secondary hover:bg-secondary/90 text-secondary-foreground shadow-xl shadow-secondary/20 transition-all hover:-translate-y-1">
                <Camera className="w-5 h-5 mr-3" />
                Report Waste Now
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Live Waste Map */}
      <section className="mb-16">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-foreground">Active waste spots near you</h2>
              <p className="text-muted-foreground mt-1">Each pulsing dot is an unattended garbage report. Tap to see details.</p>
            </div>
            <Link href="/report">
              <Button variant="outline" size="sm" className="rounded-xl shrink-0 ml-4 mt-1">
                <Camera className="w-3.5 h-3.5 mr-2" />
                Report
              </Button>
            </Link>
          </div>
          <LiveWasteMap />
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 mb-16">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-black text-foreground">The tide is turning, but not fast enough.</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Every piece of plastic we leave on the shore ends up in the water. We need your eyes on the ground.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card p-8 rounded-3xl border border-border/50 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full transition-transform group-hover:scale-110" />
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-4xl font-black text-foreground mb-2">5<span className="text-primary text-2xl"> tonnes</span></h3>
              <p className="text-muted-foreground font-medium leading-relaxed">of plastic waste generated annually in Udupi District.</p>
            </div>
            
            <div className="bg-card p-8 rounded-3xl border border-border/50 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-bl-full transition-transform group-hover:scale-110" />
              <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary-foreground flex items-center justify-center mb-6">
                <Fish className="w-6 h-6" />
              </div>
              <h3 className="text-4xl font-black text-foreground mb-2">20<span className="text-secondary-foreground text-2xl"> years</span></h3>
              <p className="text-muted-foreground font-medium leading-relaxed">for a single plastic bag to break down in the ocean.</p>
            </div>
            
            <div className="bg-card p-8 rounded-3xl border border-border/50 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/5 rounded-bl-full transition-transform group-hover:scale-110" />
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-6">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="text-4xl font-black text-foreground mb-2">80<span className="text-destructive text-2xl">%</span></h3>
              <p className="text-muted-foreground font-medium leading-relaxed">of ocean plastic starts right here on land. We can stop it.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 mb-8 rounded-[3rem] bg-primary/5 border border-primary/10 px-6 md:px-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-texture-noise" />
        
        <div className="relative z-10 max-w-5xl mx-auto flex flex-col md:flex-row gap-12 items-center">
          <div className="flex-1 space-y-8">
            <h2 className="text-4xl md:text-5xl font-black text-foreground">How we clean it together</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">It takes less than a minute to make a difference. Our municipal officers are standing by.</p>
            
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold shrink-0">1</div>
                <div>
                  <h3 className="font-bold text-xl mb-1 text-foreground">Spot & Snap</h3>
                  <p className="text-muted-foreground">Find waste, take a clear photo. We automatically grab your GPS location.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold shrink-0">2</div>
                <div>
                  <h3 className="font-bold text-xl mb-1 text-foreground">Submit</h3>
                  <p className="text-muted-foreground">Add a quick description and hit send. The report goes straight to the nearest officer.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold shrink-0">3</div>
                <div>
                  <h3 className="font-bold text-xl mb-1 text-foreground">Track</h3>
                  <p className="text-muted-foreground">Watch the status change from "Reported" to "Cleaned" with proof photos.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 w-full grid grid-cols-2 gap-4">
            <img src="/plastic-water.png" alt="Plastic in water" className="rounded-3xl object-cover aspect-[3/4] w-full shadow-lg -translate-y-4" />
            <img src="/clean-sand.png" alt="Clean beach sand" className="rounded-3xl object-cover aspect-[3/4] w-full shadow-lg translate-y-4" />
          </div>
        </div>
      </section>
      
      <div className="mt-12 text-center text-sm text-muted-foreground pb-8">
        <p>Udupi Civic Watch • Protecting the Arabian Sea</p>
      </div>
    </div>
  );
}
