import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogOut, Menu, Waves, Anchor, Home, Camera, Search, ShieldCheck, Lock, FlaskConical, Bell, BellRing, Download, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { NotificationBell } from "@/components/notification-bell";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { getAnalyticsPath, getDashboardLabel, getDashboardPath } from "@/lib/role-navigation";

// BeforeInstallPromptEvent is not in standard TS DOM lib
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ── Push Permission Modal ─────────────────────────────────────────────────────
function PushPermissionModal() {
  const { isAuthenticated } = useAuth();
  const { supported, permission, isSubscribed, isLoading, subscribe } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !supported || permission === "denied" || isSubscribed) return;
    const decided = localStorage.getItem("push-permission-decided");
    if (decided) return;

    // Show after a short delay so the page settles first
    timerRef.current = setTimeout(() => setOpen(true), 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAuthenticated, supported, permission, isSubscribed]);

  const handleEnable = async () => {
    await subscribe();
    localStorage.setItem("push-permission-decided", "granted");
    setOpen(false);
  };

  const handleSkip = () => {
    localStorage.setItem("push-permission-decided", "skipped");
    setOpen(false);
  };

  if (!isAuthenticated) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm rounded-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="items-center text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <BellRing className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold">Stay in the loop</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Enable push notifications to receive instant alerts when new waste reports are assigned to your area — even when this tab is closed.
          </DialogDescription>
        </DialogHeader>

        <ul className="text-sm text-muted-foreground space-y-2 mt-1">
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold mt-0.5">✓</span>
            New report assigned to your area
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold mt-0.5">✓</span>
            Status update alerts
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold mt-0.5">✓</span>
            Works even when the browser is closed
          </li>
        </ul>

        <DialogFooter className="flex-col gap-2 mt-2 sm:flex-col">
          <Button
            className="w-full rounded-xl h-11"
            onClick={handleEnable}
            disabled={isLoading}
          >
            <Bell className="h-4 w-4 mr-2" />
            Enable Notifications
          </Button>
          <Button
            variant="ghost"
            className="w-full rounded-xl text-muted-foreground text-sm"
            onClick={handleSkip}
            disabled={isLoading}
          >
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PWA Install Banner ────────────────────────────────────────────────────────
function PwaInstallBanner() {
  const { isAuthenticated } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("pwa-install-dismissed") === "1");
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Already running as installed PWA
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
    ) {
      setIsStandalone(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Only show on mobile-ish viewports
  const isMobile =
    typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  if (!isAuthenticated || isStandalone || dismissed || !deferredPrompt || !isMobile) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      localStorage.setItem("pwa-install-dismissed", "1");
    }
    setDismissed(true);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="bg-primary text-primary-foreground px-4 py-2.5 flex items-center gap-3">
      <Download className="h-4 w-4 shrink-0" />
      <p className="text-sm flex-1 font-medium">
        Install the app for faster access and offline support.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs px-3 bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
          onClick={handleInstall}
        >
          Install
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-primary-foreground hover:bg-white/20"
          onClick={handleDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────
export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isAdmin, isOfficer, isPanchayatAdmin, logout } = useAuth();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const dashboardPath = getDashboardPath(user?.role);
  const dashboardLabel = getDashboardLabel(user?.role);
  const analyticsPath = getAnalyticsPath(user?.role);

  const { data: testModeData } = useQuery({
    queryKey: ["test-mode"],
    queryFn: () => customFetch<{ testMode: boolean }>("/api/admin/test-mode"),
    refetchInterval: 10000,
  });
  const testModeActive = testModeData?.testMode ?? false;

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
            href={isAuthenticated && dashboardPath ? dashboardPath : "/"}
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
              <span className="text-[9px] font-medium tracking-wide hidden sm:block opacity-[0.95] text-[#212a2bde]">
                by Trip Nirvigna
              </span>
            </div>
          </Link>

          {/* Notification bell + Menu */}
          <div className="flex items-center gap-1">
            <NotificationBell />
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
                     {dashboardPath && (
                       <Link href={dashboardPath} onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-bold text-foreground transition-colors">
                         {dashboardLabel}
                       </Link>
                     )}
                     {analyticsPath && (
                       <Link href={analyticsPath} onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">
                         Analytics
                       </Link>
                     )}
                    {isAdmin && (
                      <>
                        <Link href="/admin/reports" onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">All Reports</Link>
                        <Link href="/admin/officers" onClick={closeMenu} className="px-4 py-3 rounded-xl hover:bg-primary/5 font-medium text-foreground transition-colors">Officers</Link>
                      </>
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
                <div className="flex flex-col h-full mt-6 overflow-y-auto">
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
                    <Link href="/community-mobiliser/login" onClick={closeMenu} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors text-sm font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Community Mobiliser Login
                    </Link>
                    <Link href="/health-inspector/login" onClick={closeMenu} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors text-sm font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Health Inspector Login
                    </Link>
                    <Link href="/env-engineer/login" onClick={closeMenu} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors text-sm font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Environmental Engineer Login
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
        </div>
      </header>

      {/* PWA install prompt — mobile only, authenticated users */}
      <PwaInstallBanner />

      {testModeActive && (
        <div className="bg-amber-400 text-amber-950 text-sm font-bold text-center py-2 px-4 flex items-center justify-center gap-2 z-40">
          <FlaskConical className="w-4 h-4 shrink-0" />
          TEST MODE ACTIVE — Location &amp; restrictions are relaxed for testing
        </div>
      )}

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

      {/* One-time push notification permission modal */}
      <PushPermissionModal />
    </div>
  );
}
