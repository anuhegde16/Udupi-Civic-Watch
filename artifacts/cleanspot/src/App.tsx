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

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/report" component={Report} />
        <Route path="/track" component={TrackSearch} />
        <Route path="/track/:id" component={Track} />
        <Route path="/login" component={Login} />
        <Route path="/staff/login">{() => <Login portalType="staff" />}</Route>
        <Route path="/admin/login">{() => <Login portalType="admin" />}</Route>
        <Route path="/master/login">{() => <Login portalType="master" />}</Route>
        
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

        {/* Protected Panchayat Admin Routes */}
        <Route path="/master/dashboard">
          <AuthGuard roles={["panchayat_admin"]}>
            <MasterDashboard />
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
