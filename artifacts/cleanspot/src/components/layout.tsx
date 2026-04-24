import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, Waves, Anchor } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isAdmin, isOfficer, logout } = useAuth();
  const [location] = useLocation();

  const isPublicRoute = location === "/" || location === "/report" || location.startsWith("/track");

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
            href={isOfficer ? "/officer/dashboard" : isAdmin ? "/admin/dashboard" : "/"}
            className="flex items-center gap-3 group"
          >
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground group-hover:scale-105 transition-transform shadow-md shadow-primary/20">
              <Waves className="w-5 h-5" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-black text-primary tracking-tight">CleanSpot Udupi</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest hidden sm:block">
                Udupi District Municipality
              </span>
            </div>
          </Link>

          {isAuthenticated ? (
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium hidden md:inline-block text-foreground/80">{user?.name}</span>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-foreground hover:bg-primary/5 hover:text-primary rounded-full">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
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
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 mb-6">
                      Udupi District Municipality
                    </p>

                    <nav className="flex flex-col gap-2 flex-1">
                      {isAdmin && (
                        <>
                          <Link href="/admin/dashboard" className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">Dashboard</Link>
                          <Link href="/admin/reports" className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">All Reports</Link>
                          <Link href="/admin/officers" className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">Officers</Link>
                        </>
                      )}
                      {isOfficer && (
                        <Link href="/officer/dashboard" className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">My Area</Link>
                      )}
                    </nav>

                    <div className="pt-6 border-t border-primary/10 mt-auto">
                      <Button
                        variant="outline"
                        className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 rounded-xl h-12"
                        onClick={() => logout()}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          ) : (
            isPublicRoute ? (
              <Link href="/login">
                <Button variant="ghost" className="text-foreground hover:bg-primary/5 hover:text-primary font-medium rounded-full px-5">
                  Staff Login
                </Button>
              </Link>
            ) : null
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 md:py-8 flex flex-col z-10 relative">
        {children}
      </main>

      <footer className="border-t border-border/50 bg-card/50 py-4 px-4 text-center">
        <p className="text-xs text-muted-foreground font-medium">
          CleanSpot &nbsp;·&nbsp; Udupi District Administration &nbsp;·&nbsp; Government of Karnataka &nbsp;·&nbsp; Swachh Bharat Mission
        </p>
      </footer>
    </div>
  );
}
