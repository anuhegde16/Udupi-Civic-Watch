import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children, roles }: { children: React.ReactNode, roles?: ("admin" | "officer")[] }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        // Redirect to the appropriate login portal based on required roles
        const loginPath = roles?.includes("admin") && !roles.includes("officer")
          ? "/admin/login"
          : "/staff/login";
        setLocation(loginPath);
      } else if (roles && user?.role && !roles.includes(user.role)) {
        setLocation(user.role === "admin" ? "/admin/dashboard" : "/officer/dashboard");
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

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  if (roles && user?.role && !roles.includes(user.role)) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
