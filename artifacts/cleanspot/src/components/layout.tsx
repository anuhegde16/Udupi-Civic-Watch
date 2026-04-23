import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, UserCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isAdmin, isOfficer, logout } = useAuth();
  const [location] = useLocation();

  const isPublicRoute = location === "/" || location === "/report" || location.startsWith("/track");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-50">
      <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={isOfficer ? "/officer/dashboard" : isAdmin ? "/admin/dashboard" : "/"} className="text-xl font-bold tracking-tight flex items-center gap-2">
            <span className="bg-white text-primary w-8 h-8 rounded-full flex items-center justify-center text-lg">C</span>
            CleanSpot
          </Link>

          {isAuthenticated ? (
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium hidden md:inline-block opacity-90">{user?.name}</span>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white rounded-full">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] sm:w-[320px] bg-white border-l-0">
                  <div className="flex flex-col h-full mt-6">
                    <div className="flex items-center gap-3 px-2 mb-8">
                      <UserCircle className="h-10 w-10 text-primary" />
                      <div>
                        <p className="font-semibold text-gray-900">{user?.name}</p>
                        <p className="text-sm text-gray-500 capitalize">{user?.role}</p>
                      </div>
                    </div>
                    
                    <nav className="flex flex-col gap-2 flex-1">
                      {isAdmin && (
                        <>
                          <Link href="/admin/dashboard" className="px-4 py-3 rounded-xl hover:bg-gray-100 font-medium text-gray-700 transition-colors">Dashboard</Link>
                          <Link href="/admin/reports" className="px-4 py-3 rounded-xl hover:bg-gray-100 font-medium text-gray-700 transition-colors">All Reports</Link>
                          <Link href="/admin/officers" className="px-4 py-3 rounded-xl hover:bg-gray-100 font-medium text-gray-700 transition-colors">Officers</Link>
                        </>
                      )}
                      {isOfficer && (
                        <>
                          <Link href="/officer/dashboard" className="px-4 py-3 rounded-xl hover:bg-gray-100 font-medium text-gray-700 transition-colors">My Reports</Link>
                        </>
                      )}
                    </nav>

                    <div className="pt-6 border-t mt-auto">
                      <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => logout()}>
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
                <Button variant="ghost" className="text-white hover:bg-white/20 hover:text-white font-medium">Officer Login</Button>
              </Link>
            ) : null
          )}
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 md:py-8 flex flex-col">
        {children}
      </main>
    </div>
  );
}
