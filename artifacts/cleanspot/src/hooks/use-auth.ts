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

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    isOfficer: user?.role === "officer",
    isAdmin: user?.role === "admin",
    logout,
  };
}
