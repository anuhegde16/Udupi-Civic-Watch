import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading, error } = useGetMe({ query: { retry: false } });
  const logoutMutation = useLogout();
  const [, setLocation] = useLocation();

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        // Clear ALL cached query data so stale user info is gone immediately
        queryClient.clear();
        setLocation("/");
      },
    });
  };

  const role = user?.role ?? "";

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    isOfficer: role === "officer" || role === "field_officer",
    isAdmin: role === "admin" || role === "control_center",
    isControlCenter: role === "admin" || role === "control_center",
    isPanchayatAdmin: role === "panchayat_admin",
    isFieldOfficer: role === "officer" || role === "field_officer",
    logout,
  };
}
