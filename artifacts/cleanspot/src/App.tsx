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
import Login from "@/pages/login";
import OfficerDashboard from "@/pages/officer-dashboard";
import OfficerReportDetail from "@/pages/officer-report-detail";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminOfficers from "@/pages/admin-officers";
import AdminReports from "@/pages/admin-reports";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/report" component={Report} />
        <Route path="/track/:id" component={Track} />
        <Route path="/login" component={Login} />
        
        {/* Protected Officer Routes */}
        <Route path="/officer/dashboard">
          <AuthGuard roles={["officer", "admin"]}>
            <OfficerDashboard />
          </AuthGuard>
        </Route>
        <Route path="/officer/report/:id">
          <AuthGuard roles={["officer", "admin"]}>
            <OfficerReportDetail />
          </AuthGuard>
        </Route>

        {/* Protected Admin Routes */}
        <Route path="/admin/dashboard">
          <AuthGuard roles={["admin"]}>
            <AdminDashboard />
          </AuthGuard>
        </Route>
        <Route path="/admin/officers">
          <AuthGuard roles={["admin"]}>
            <AdminOfficers />
          </AuthGuard>
        </Route>
        <Route path="/admin/reports">
          <AuthGuard roles={["admin"]}>
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
