export type DashboardRole =
  | "admin"
  | "control_center"
  | "officer"
  | "field_officer"
  | "panchayat_admin"
  | "commissioner"
  | "supervisor"
  | "health_inspector"
  | "environmental_engineer"
  | "community_mobiliser";

const DASHBOARD_PATHS: Record<DashboardRole, string> = {
  admin: "/admin/dashboard",
  control_center: "/admin/dashboard",
  officer: "/officer/dashboard",
  field_officer: "/officer/dashboard",
  panchayat_admin: "/master/dashboard",
  commissioner: "/commissioner/dashboard",
  supervisor: "/supervisor/dashboard",
  health_inspector: "/health-inspector/dashboard",
  environmental_engineer: "/env-engineer/dashboard",
  community_mobiliser: "/community-mobiliser/dashboard",
};

const DASHBOARD_LABELS: Record<DashboardRole, string> = {
  admin: "Dashboard",
  control_center: "Dashboard",
  officer: "My Area",
  field_officer: "My Area",
  panchayat_admin: "My Panchayat",
  commissioner: "My Dashboard",
  supervisor: "My Dashboard",
  health_inspector: "My Dashboard",
  environmental_engineer: "My Dashboard",
  community_mobiliser: "My Dashboard",
};

export function getDashboardPath(role?: string | null): string | null {
  if (!role) return null;
  return DASHBOARD_PATHS[role as DashboardRole] ?? null;
}

export function getDashboardLabel(role?: string | null): string {
  if (!role) return "My Dashboard";
  return DASHBOARD_LABELS[role as DashboardRole] ?? "My Dashboard";
}

export function getAnalyticsPath(role?: string | null): string | null {
  const dashboardPath = getDashboardPath(role);
  if (!dashboardPath) return null;

  switch (role) {
    case "admin":
    case "control_center":
      return "/admin/analytics";
    case "panchayat_admin":
      return "/master/analytics";
    case "commissioner":
    case "environmental_engineer":
    case "health_inspector":
    case "supervisor":
    case "community_mobiliser":
    case "officer":
    case "field_officer":
      return `${dashboardPath}?view=analytics`;
    default:
      return null;
  }
}