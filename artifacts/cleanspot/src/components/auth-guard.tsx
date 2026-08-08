import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const ROLE_ALIASES: Record<string, string[]> = {
  admin: ["admin", "control_center"],
  control_center: ["admin", "control_center"],
  officer: ["officer", "field_officer"],
  field_officer: ["officer", "field_officer"],
  // panchayat_admin and commissioner are now independent roles
  panchayat_admin: ["panchayat_admin"],
  commissioner: ["commissioner"],
};

function expandRoles(roles: string[]): string[] {
  const expanded = new Set<string>();
  for (const r of roles) {
    (ROLE_ALIASES[r] ?? [r]).forEach((a) => expanded.add(a));
  }
  return [...expanded];
}

function dashboardFor(role: string): string {
  if (role === "admin" || role === "control_center") return "/admin/dashboard";
  if (role === "panchayat_admin") return "/master/dashboard";
  if (role === "commissioner") return "/commissioner/dashboard";
  if (role === "supervisor") return "/supervisor/dashboard";
  if (role === "health_inspector") return "/health-inspector/dashboard";
  if (role === "environmental_engineer") return "/env-engineer/dashboard";
  if (role === "community_mobiliser") return "/community-mobiliser/dashboard";
  return "/officer/dashboard";
}

export function AuthGuard({ children, roles }: { children: React.ReactNode, roles?: string[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const allowedRoles = roles ? expandRoles(roles) : undefined;

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        const loginPath =
          roles?.some((r) => r === "admin" || r === "control_center") && !roles?.some((r) => r === "officer" || r === "field_officer" || r === "panchayat_admin")
            ? "/admin/login"
            : roles?.some((r) => r === "panchayat_admin")
            ? "/master/login"
            : roles?.some((r) => r === "commissioner")
            ? "/commissioner/login"
            : roles?.some((r) => r === "health_inspector" || r === "environmental_engineer")
            ? "/supervisory/login"
            : "/staff/login";
        setLocation(loginPath, { replace: true });
      } else if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
        setLocation(dashboardFor(user.role), { replace: true });
      }
    }
  }, [isLoading, isAuthenticated, user, roles, setLocation]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) return null;

  return <>{children}</>;
}
