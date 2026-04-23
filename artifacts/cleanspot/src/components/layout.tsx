import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, Waves, Anchor, Ship } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isAdmin, isOfficer, logout } = useAuth();
  const [location] = useLocation();

  const isPublicRoute = location === "/" || location === "/report" || location.startsWith("/track");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      {/* Texture noise overlay */}
      <div className="fixed inset-0 bg-texture-noise z-[-1]" />
      
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-primary/10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={isOfficer ? "/officer/dashboard" : isAdmin ? "/admin/dashboard" : "/"} className="text-xl font-bold tracking-tight flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground group-hover:scale-110 transition-transform shadow-md shadow-primary/20">
              <Waves className="w-4 h-4" />
            </div>
            <span className="text-primary font-display font-bold">CleanSpot <span className="text-secondary">Udupi</span></span>
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
                    <div className="flex items-center gap-3 px-2 mb-8">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Anchor className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground font-display text-lg leading-none">{user?.name}</p>
                        <p className="text-sm text-foreground/60 capitalize font-medium mt-1">{user?.role}</p>
                      </div>
                    </div>
                    
                    <nav className="flex flex-col gap-2 flex-1">
                      {isAdmin && (
                        <>
                          <Link href="/admin/dashboard" className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors flex items-center gap-2">
                            Dashboard
                          </Link>
                          <Link href="/admin/reports" className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors flex items-center gap-2">
                            All Reports
                          </Link>
                          <Link href="/admin/officers" className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors flex items-center gap-2">
                            Officers
                          </Link>
                        </>
                      )}
                      {isOfficer && (
                        <>
                          <Link href="/officer/dashboard" className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors flex items-center gap-2">
                            My Area
                          </Link>
                        </>
                      )}
                    </nav>

                    <div className="pt-6 border-t border-primary/10 mt-auto">
                      <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 rounded-xl h-12" onClick={() => logout()}>
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
                <Button variant="ghost" className="text-foreground hover:bg-primary/5 hover:text-primary font-medium rounded-full px-5">Staff Login</Button>
              </Link>
            ) : null
          )}
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 md:py-8 flex flex-col z-10 relative">
        {children}
      </main>
    </div>
  );
}
