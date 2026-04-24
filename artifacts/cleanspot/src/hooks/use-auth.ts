import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";

export function useAuth() {
  const { data: user, isLoading, error } = useGetMe({ query: { retry: false } });
  const logoutMutation = useLogout();
  const [, setLocation] = useLocation();

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
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
