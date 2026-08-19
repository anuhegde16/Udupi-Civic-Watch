import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Camera, Anchor, Waves, Users, ShieldCheck, HeartHandshake, AlertCircle, Sparkles, MapPin, Droplets, Fish, ShieldAlert, Sun } from "lucide-react";

export default function About() {
  useEffect(() => {
    const previousTitle = document.title;
    const existingDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = existingDescription?.content;
    const description = existingDescription ?? document.createElement("meta");

    if (!existingDescription) {
      description.name = "description";
      document.head.appendChild(description);
    }

    document.title = "About Udupi Civic Watch | Cleaner Coasts, Stronger Communities";
    description.content = "Learn how Udupi Civic Watch brings citizens, sanitation workers, local bodies, and administrators together to reduce waste and protect Udupi's coast.";

    return () => {
      document.title = previousTitle;
      if (existingDescription) {
        existingDescription.content = previousDescription ?? "";
      } else {
        description.remove();
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-background selection:bg-primary/20 selection:text-primary">
      {/* Hero Section */}
      <section className="relative w-full rounded-[2rem] overflow-hidden min-h-[70vh] flex flex-col justify-end p-6 md:p-12 mb-16 shadow-2xl">
        <img 
          src="/hero-coast.png" 
          alt="Plastic waste scattered along a beach beside the Arabian Sea"
          className="absolute inset-0 w-full h-full object-cover"
          data-testid="about-hero-image"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/60 to-black/30 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        
        <div className="relative z-10 max-w-4xl space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 backdrop-blur-md border border-primary/20 text-primary text-sm font-bold tracking-wide shadow-sm" data-testid="about-badge">
            <Waves className="w-4 h-4" />
            About Udupi Civic Watch
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight text-foreground leading-[1.05]" data-testid="about-heading">
            Born from a <span className="text-primary">simple belief.</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-foreground/80 max-w-2xl leading-relaxed font-medium" data-testid="about-intro">
            Cleaner communities are created when citizens, local bodies, and administrators work together.
          </p>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="py-12 mb-16 px-6 md:px-12 relative">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="w-16 h-2 bg-secondary rounded-full mb-8"></div>
          <h2 className="text-3xl md:text-5xl font-black text-foreground leading-[1.2]" data-testid="about-mission">
            Waste management is not just about collecting garbage. It is about protecting public health, preserving our environment, safeguarding water bodies, preventing pollution, and creating a better future for the next generation.
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground font-medium" data-testid="about-mission-sub">
            Every piece of waste disposed of responsibly contributes to a cleaner and healthier Udupi.
          </p>
        </div>
      </section>

      {/* The Impact of Land Waste */}
      <section className="py-20 mb-16 bg-primary/5 border-y border-primary/10" data-testid="about-impact">
        <div className="max-w-6xl mx-auto px-6 md:px-12">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-5xl font-black text-foreground">The Journey of Land Waste</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-medium">What happens on land never stays on land. Stopping pollution at the source protects the entire ecosystem.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Drains & Waterways */}
            <div className="bg-card p-8 rounded-3xl shadow-sm border border-border flex gap-6 items-start transition-transform hover:-translate-y-1" data-testid="impact-waterways">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-sm">
                <Droplets className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-3">Drains & Waterways</h3>
                <p className="text-muted-foreground leading-relaxed font-medium">
                  When plastic litters our streets, rain can carry it into local drains and rivers. It can obstruct water flow and give land waste a direct path toward the Arabian Sea.
                </p>
              </div>
            </div>

            {/* Wildlife */}
            <div className="bg-card p-8 rounded-3xl shadow-sm border border-border flex gap-6 items-start transition-transform hover:-translate-y-1" data-testid="impact-wildlife">
              <div className="w-12 h-12 rounded-2xl bg-secondary/15 text-secondary-foreground flex items-center justify-center shrink-0 shadow-sm">
                <Fish className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-3">Marine & Coastal Wildlife</h3>
                <p className="text-muted-foreground leading-relaxed font-medium">
                  Birds, fish, and sea turtles can mistake plastic fragments for food or become tangled in larger debris. Keeping waste off the ground helps protect the animals that call our coastline home.
                </p>
              </div>
            </div>

            {/* Public Health */}
            <div className="bg-card p-8 rounded-3xl shadow-sm border border-border flex gap-6 items-start transition-transform hover:-translate-y-1" data-testid="impact-health">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0 shadow-sm">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-3">Public Health & Sanitation</h3>
                <p className="text-muted-foreground leading-relaxed font-medium">
                  Accumulated garbage is not just an eyesore—it can clog drainage systems and contribute to stagnant, unhygienic conditions. Cleaner surroundings support healthier, more resilient communities.
                </p>
              </div>
            </div>

            {/* Shared Spaces */}
            <div className="bg-card p-8 rounded-3xl shadow-sm border border-border flex gap-6 items-start transition-transform hover:-translate-y-1" data-testid="impact-spaces">
              <div className="w-12 h-12 rounded-2xl bg-accent/40 text-accent-foreground flex items-center justify-center shrink-0 shadow-sm">
                <Sun className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-3">Beaches & Shared Spaces</h3>
                <p className="text-muted-foreground leading-relaxed font-medium">
                  Our shores and streets are where we gather, play, and connect. Responsible disposal and active citizen reporting help keep these public spaces welcoming and safe for everyone to enjoy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Story - Split Layout */}
      <section className="py-16 mb-16 rounded-[3rem] bg-card border border-border shadow-sm px-6 md:px-12 relative overflow-hidden" data-testid="about-story-section">
        <div className="absolute top-0 right-0 w-full h-full bg-texture-noise opacity-5" />
        
        <div className="relative z-10 max-w-6xl mx-auto flex flex-col lg:flex-row gap-16 items-center">
          <div className="flex-1 w-full relative">
            <div className="absolute -inset-4 bg-primary/5 rounded-[2.5rem] transform -rotate-3 transition-transform hover:rotate-0 duration-500"></div>
            <img 
              src="/plastic-water.png" 
              alt="Plastic pollution affecting water bodies" 
              className="relative rounded-[2rem] object-cover aspect-square w-full shadow-lg"
              data-testid="about-story-img"
            />
          </div>
          
          <div className="flex-1 space-y-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-2">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-foreground">A Collaborative Vision</h2>
            <div className="space-y-6 text-lg text-muted-foreground leading-relaxed font-medium">
              <p data-testid="about-conceptualization">
                Udupi Civic Sense digital application is a civic technology initiative conceptualized by Anudeep Hegde and developed in close collaboration with Udupi District Administration with the shared vision of making waste management more transparent, responsive, and community-driven.
              </p>
              <p data-testid="about-evolution">
                What began as an idea to simplify waste reporting has evolved into a collaborative civic platform that empowers citizens to actively participate in keeping their surroundings clean.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Acknowledgements Grid */}
      <section className="py-16 mb-16" data-testid="about-acknowledgements">
        <div className="max-w-6xl mx-auto px-6 md:px-12">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-black text-foreground">Our Heroes & Supporters</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">This initiative is built on the dedication of countless individuals.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Leadership */}
            <div className="bg-primary/5 p-10 rounded-[2rem] border border-primary/10 shadow-sm relative overflow-hidden group hover:bg-primary/10 transition-colors" data-testid="ack-leadership">
              <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-8 shadow-md">
                <Anchor className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-4 leading-snug">District Leadership</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">
                A special note of gratitude to Smt. Swaroopa T.K., IAS, Deputy Commissioner of Udupi District, for believing in the idea, bringing together the administration and stakeholders, and helping make its implementation on the ground possible. Her support and encouragement played an important role in transforming a concept into a working community platform.
              </p>
            </div>

            {/* Unseen Heroes */}
            <div className="bg-secondary/10 p-10 rounded-[2rem] border border-secondary/20 shadow-sm relative overflow-hidden group hover:bg-secondary/20 transition-colors" data-testid="ack-heroes">
              <div className="w-14 h-14 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center mb-8 shadow-md">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-4 leading-snug">The Unseen Heroes</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">
                Udupi Civic Watch is also a tribute to the often-unseen heroes who work tirelessly behind the scenes — sanitation workers, waste collection staff, drivers, segregation teams, Panchayat officials, and field personnel who handle challenging and demanding tasks every day to keep our communities clean and livable. Their dedication deserves our respect and gratitude.
              </p>
            </div>

            {/* Community */}
            <div className="bg-accent/30 p-10 rounded-[2rem] border border-accent/50 shadow-sm relative overflow-hidden group hover:bg-accent/50 transition-colors" data-testid="ack-community">
              <div className="w-14 h-14 rounded-2xl bg-foreground text-background flex items-center justify-center mb-8 shadow-md">
                <HeartHandshake className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-4 leading-snug">Community Partners</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">
                We also acknowledge the invaluable contribution of resident welfare groups, youth organizations, environmental volunteers, schools, NGOs, community leaders, and countless citizens who participate in clean-up drives, awareness campaigns, and sustainable waste management initiatives across the district.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Belonging Statement */}
      <section className="py-20 mb-16 relative rounded-[3rem] overflow-hidden" data-testid="about-belonging">
        <img 
          src="/clean-sand.png" 
          alt="Discarded plastic bottles and bags on beach sand"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/95 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 to-primary/60" />
        
        <div className="relative z-10 max-w-4xl mx-auto px-6 md:px-12 text-center text-primary-foreground space-y-10">
          <Users className="w-16 h-16 mx-auto opacity-80" />
          <h2 className="text-3xl md:text-5xl font-black leading-[1.3]">
            This platform does not belong to any individual or institution alone.
          </h2>
          <p className="text-xl md:text-2xl text-primary-foreground/80 font-medium leading-relaxed max-w-3xl mx-auto">
            It belongs to every citizen who reports an issue, every official who resolves a complaint, every worker who manages waste, and every volunteer who contributes to a cleaner environment.
          </p>
        </div>
      </section>

      {/* Trial Mode Warning */}
      <section className="max-w-4xl mx-auto px-6 md:px-12 mb-20" data-testid="about-trial-mode">
        <div className="bg-destructive/10 border-2 border-destructive/20 p-8 md:p-10 rounded-[2rem] flex flex-col md:flex-row gap-8 items-start shadow-sm">
          <div className="w-14 h-14 rounded-full bg-destructive/20 text-destructive flex items-center justify-center shrink-0">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Operating in Trial Mode</h2>
            <p className="text-muted-foreground text-lg leading-relaxed font-medium">
              Udupi Civic Watch is currently operating in trial mode. As we continue to improve the platform, users may occasionally experience delays, technical issues, or operational challenges. We request your patience, understanding, and feedback during this phase as we work together to build a more effective and reliable civic engagement platform.
            </p>
          </div>
        </div>
      </section>

      {/* Conclusion & CTA */}
      <section className="py-16 text-center max-w-4xl mx-auto px-6 md:px-12 space-y-10" data-testid="about-conclusion">
        <h2 className="text-3xl md:text-5xl font-black text-foreground leading-tight">
          Udupi Civic Watch is our collective effort, our shared responsibility, and our commitment towards a cleaner, greener, and more accountable Udupi.
        </h2>
        
        <div className="pt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" className="w-full sm:w-auto h-16 px-10 text-lg font-bold rounded-2xl bg-secondary hover:bg-secondary/90 text-secondary-foreground shadow-xl shadow-secondary/20 transition-transform hover:-translate-y-1">
            <Link href="/report" data-testid="about-cta-report">
              <Camera className="w-5 h-5 mr-3" />
              Report Waste
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-16 px-10 text-lg font-bold rounded-2xl border-2 hover:bg-muted transition-transform hover:-translate-y-1">
            <Link href="/" data-testid="about-cta-home">
              <MapPin className="w-5 h-5 mr-3" />
              View Map
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
