/**
 * Temporary placeholder shown after login for the new Udupi hierarchy roles
 * (supervisor, health_inspector, environmental_engineer, community_mobiliser).
 * Task #265 will replace this with fully-featured dashboards.
 */
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { LogOut, Clock } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";

const ROLE_LABELS: Record<string, string> = {
  supervisor:              "Supervisor",
  health_inspector:        "Health Inspector",
  environmental_engineer:  "Environmental Engineer",
  community_mobiliser:     "Community Mobiliser",
  commissioner:            "Commissioner",
};

export default function HierarchyPlaceholder() {
  const { user } = useAuth();
  const logout = useLogout();
  const [, setLocation] = useLocation();

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => setLocation("/staff/login", { replace: true }),
    });
  }

  const roleLabel = user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "Staff";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-8 py-6 bg-green-700 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 opacity-80" />
            <span className="text-xs font-semibold uppercase tracking-widest opacity-80">
              {roleLabel}
            </span>
          </div>
          <h1 className="text-xl font-bold leading-tight">Udupi Civic Watch</h1>
          <p className="text-xs opacity-70 mt-0.5">Staff Portal</p>
        </div>
        <div className="px-8 py-8 text-center space-y-4">
          <p className="text-sm font-semibold text-foreground">
            Welcome, {user?.name ?? "Staff Member"}
          </p>
          <p className="text-xs text-muted-foreground">
            Your <span className="font-medium">{roleLabel}</span> dashboard is being set up.
            It will be available shortly.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-2"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
        <div className="px-8 pb-6 text-center text-xs text-muted-foreground">
          Udupi District Administration &copy; 2025
        </div>
      </div>
    </div>
  );
}
