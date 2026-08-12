import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { AuthGuard } from "@/components/auth-guard";

import Home from "@/pages/home";
import Report from "@/pages/report";
import Track from "@/pages/track";
import TrackSearch from "@/pages/track-search";
import Login from "@/pages/login";
import OfficerDashboard from "@/pages/officer-dashboard";
import OfficerReportDetail from "@/pages/officer-report-detail";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminOfficers from "@/pages/admin-officers";
import AdminReports from "@/pages/admin-reports";
import MasterDashboard from "@/pages/master-dashboard";
import MasterReports from "@/pages/master-reports";
import MasterAnalytics from "@/pages/master-analytics";
import ControlCenterAnalytics from "@/pages/control-center-analytics";
import NotificationsPage from "@/pages/notifications";
import SupervisorDashboard from "@/pages/supervisor-dashboard";
import HealthInspectorDashboard from "@/pages/health-inspector-dashboard";
import EnvEngineerDashboard from "@/pages/env-engineer-dashboard";
import CommunityMobiliserDashboard from "@/pages/community-mobiliser-dashboard";
import CommissionerDashboard from "@/pages/commissioner-dashboard";
import ChangePassword from "@/pages/change-password";
import Activate from "@/pages/activate";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/report" component={Report} />
        <Route path="/track" component={TrackSearch} />
        <Route path="/track/:id" component={Track} />
        <Route path="/login">{() => <Login />}</Route>
        <Route path="/staff/login">{() => <Login portalType="staff" />}</Route>
        <Route path="/admin/login">{() => <Login portalType="admin" />}</Route>
        <Route path="/master/login">{() => <Login portalType="master" />}</Route>
        <Route path="/supervisory/login">{() => <Login portalType="supervisory" />}</Route>
        <Route path="/community-mobiliser/login">{() => <Login portalType="community-mobiliser" />}</Route>
        <Route path="/supervisor/login">{() => { window.location.replace("/staff/login"); return null; }}</Route>
        <Route path="/health-inspector/login">{() => <Login portalType="health-inspector" />}</Route>
        <Route path="/env-engineer/login">{() => <Login portalType="env-engineer" />}</Route>
        <Route path="/commissioner/login">{() => { window.location.replace("/master/login"); return null; }}</Route>
        
        {/* Protected Officer Routes */}
        <Route path="/officer/dashboard">
          <AuthGuard roles={["officer", "field_officer", "admin", "control_center"]}>
            <OfficerDashboard />
          </AuthGuard>
        </Route>
        <Route path="/officer/report/:id">
          <AuthGuard roles={["officer", "field_officer", "admin", "control_center"]}>
            <OfficerReportDetail />
          </AuthGuard>
        </Route>
        <Route path="/supervisor/report/:id">
          <AuthGuard roles={["supervisor"]}>
            <OfficerReportDetail />
          </AuthGuard>
        </Route>

        {/* Protected Panchayat Admin Routes */}
        <Route path="/master/dashboard">
          <AuthGuard roles={["panchayat_admin"]}>
            <MasterDashboard />
          </AuthGuard>
        </Route>
        <Route path="/master/reports">
          <AuthGuard roles={["panchayat_admin"]}>
            <MasterReports />
          </AuthGuard>
        </Route>
        <Route path="/master/analytics">
          <AuthGuard roles={["panchayat_admin"]}>
            <MasterAnalytics />
          </AuthGuard>
        </Route>

        {/* Commissioner dashboard */}
        <Route path="/commissioner/dashboard">
          <AuthGuard roles={["commissioner"]}>
            <CommissionerDashboard />
          </AuthGuard>
        </Route>

        {/* Udupi hierarchy role dashboards */}
        <Route path="/supervisor/dashboard">
          <AuthGuard roles={["supervisor"]}>
            <SupervisorDashboard />
          </AuthGuard>
        </Route>
        <Route path="/health-inspector/dashboard">
          <AuthGuard roles={["health_inspector"]}>
            <HealthInspectorDashboard />
          </AuthGuard>
        </Route>
        <Route path="/env-engineer/dashboard">
          <AuthGuard roles={["environmental_engineer"]}>
            <EnvEngineerDashboard />
          </AuthGuard>
        </Route>
        <Route path="/community-mobiliser/dashboard">
          <AuthGuard roles={["community_mobiliser"]}>
            <CommunityMobiliserDashboard />
          </AuthGuard>
        </Route>

        {/* Protected Admin Routes (Control Center) */}
        <Route path="/admin/dashboard">
          <AuthGuard roles={["admin", "control_center"]}>
            <AdminDashboard />
          </AuthGuard>
        </Route>
        <Route path="/admin/officers">
          <AuthGuard roles={["admin", "control_center"]}>
            <AdminOfficers />
          </AuthGuard>
        </Route>
        <Route path="/admin/reports">
          <AuthGuard roles={["admin", "control_center"]}>
            <AdminReports />
          </AuthGuard>
        </Route>
        <Route path="/admin/analytics">
          <AuthGuard roles={["admin", "control_center"]}>
            <ControlCenterAnalytics />
          </AuthGuard>
        </Route>

        <Route path="/notifications">
          <AuthGuard roles={["officer", "field_officer", "admin", "control_center", "panchayat_admin"]}>
            <NotificationsPage />
          </AuthGuard>
        </Route>

        {/* Forced password-change for seeded hierarchy accounts */}
        <Route path="/change-password">
          <AuthGuard roles={["supervisor", "health_inspector", "environmental_engineer", "commissioner", "community_mobiliser", "panchayat_admin", "officer", "field_officer", "admin", "control_center"]}>
            <ChangePassword />
          </AuthGuard>
        </Route>

        {/* One-time account activation for new hierarchy staff (no auth required) */}
        <Route path="/activate">
          <Activate />
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
