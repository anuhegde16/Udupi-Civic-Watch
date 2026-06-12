import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, Waves, Anchor, Home, Camera, Search, ShieldCheck, Lock } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isAdmin, isOfficer, isPanchayatAdmin, logout } = useAuth();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      <div className="fixed inset-0 bg-texture-noise z-[-1]" />

      {/* Official govt. identity bar */}
      <div className="bg-primary/95 text-primary-foreground/80 text-[11px] font-medium py-1.5 px-4 text-center tracking-wide border-b border-white/10 hidden md:block">
        Government of Karnataka &nbsp;·&nbsp; Udupi District Administration &nbsp;·&nbsp; Swachh Bharat Mission
      </div>

      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-primary/10 shadow-sm shadow-primary/5">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href={isOfficer ? "/officer/dashboard" : isAdmin ? "/admin/dashboard" : isPanchayatAdmin ? "/master/dashboard" : "/"}
            className="flex items-center gap-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground group-hover:scale-105 transition-transform shadow-md shadow-primary/20">
              <Waves className="w-5 h-5" />
            </div>
            <div className="flex flex-col leading-none gap-px">
              <span className="text-base font-black text-primary tracking-tight">Udupi Civic Watch</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden sm:block">
                Udupi District Administration
              </span>
              <span className="text-[9px] text-muted-foreground/45 font-medium tracking-wide hidden sm:block">
                by Trip Nirvigna
              </span>
            </div>
          </Link>

          {/* Menu — always visible, content changes based on auth */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-foreground hover:bg-primary/5 hover:text-primary rounded-full">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            {isAuthenticated ? (
              /* Authenticated staff menu */
              <SheetContent side="right" className="w-[280px] sm:w-[320px] bg-background border-l-primary/10">
                <div className="flex flex-col h-full mt-6">
                  <div className="flex items-center gap-3 px-2 mb-2">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Anchor className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground font-display text-lg leading-none">{user?.name}</p>
                      <p className="text-sm text-foreground/60 capitalize font-medium mt-1">{user?.role}</p>
                    </div>
                  </div>
                  <div className="px-2 mb-6">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Udupi District Administration
                    </p>
                    <p className="text-[9px] text-muted-foreground/45 font-medium tracking-wide mt-0.5">
                      by Trip Nirvigna
                    </p>
                  </div>

                  <nav className="flex flex-col gap-1 flex-1">
                    {isAdmin && (
                      <>
                        <Link href="/admin/dashboard" onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">Dashboard</Link>
                        <Link href="/admin/reports" onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">All Reports</Link>
                        <Link href="/admin/officers" onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">Officers</Link>
                      </>
                    )}
                    {isPanchayatAdmin && (
                      <>
                        <Link href="/master/dashboard" onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">My Panchayat</Link>
                        <Link href="/master/analytics" onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">Analytics</Link>
                      </>
                    )}
                    {isOfficer && (
                      <Link href="/officer/dashboard" onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">My Area</Link>
                    )}
                  </nav>

                  <div className="pt-6 border-t border-primary/10 mt-auto">
                    <Button
                      variant="outline"
                      className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 rounded-xl h-12"
                      onClick={() => { logout(); closeMenu(); }}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            ) : (
              /* Public citizen menu */
              <SheetContent side="right" className="w-[280px] sm:w-[300px] bg-background border-l-primary/10">
                <div className="flex flex-col h-full mt-6">
                  <div className="flex items-center gap-3 px-2 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20">
                      <Waves className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-black text-foreground text-base leading-none">Udupi Civic Watch</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Citizen Menu</p>
                      <p className="text-[9px] text-muted-foreground/45 font-medium tracking-wide mt-0.5">by Trip Nirvigna</p>
                    </div>
                  </div>

                  <nav className="flex flex-col gap-1 flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-4 mb-2">Navigation</p>

                    <Link href="/" onClick={closeMenu} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-colors ${location === "/" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
                      <Home className="w-4 h-4" />
                      Home
                    </Link>
                    <Link href="/report" onClick={closeMenu} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-colors ${location === "/report" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
                      <Camera className="w-4 h-4" />
                      Report Waste
                    </Link>
                    <Link href="/track" onClick={closeMenu} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-colors ${location.startsWith("/track") ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}>
                      <Search className="w-4 h-4" />
                      Track a Report
                    </Link>
                  </nav>

                  {/* Discreet staff access — at the bottom, small */}
                  <div className="pt-4 border-t border-border/50 mt-4 space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest px-4 mb-2">Staff Access</p>
                    <Link href="/staff/login" onClick={closeMenu} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors text-sm font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Field Officer Login
                    </Link>
                    <Link href="/master/login" onClick={closeMenu} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors text-sm font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Panchayat Admin Login
                    </Link>
                    <Link href="/admin/login" onClick={closeMenu} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm font-medium">
                      <Lock className="w-3.5 h-3.5" />
                      Control Center Login
                    </Link>
                  </div>
                </div>
              </SheetContent>
            )}
          </Sheet>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 md:py-8 flex flex-col z-10 relative">
        {children}
      </main>

      <footer className="border-t border-border/50 bg-card/50 py-4 px-4 text-center space-y-1">
        <p className="text-xs text-muted-foreground font-medium">
          Udupi Civic Watch &nbsp;·&nbsp; Udupi District Administration &nbsp;·&nbsp; Government of Karnataka &nbsp;·&nbsp; Swachh Bharat Mission
        </p>
        <p className="text-[10px] text-muted-foreground/50 font-medium tracking-wide">
          Powered by Trip Nirvigna
        </p>
      </footer>
    </div>
  );
}
