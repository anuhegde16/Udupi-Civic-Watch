import { useGetReportsSummary, useListOfficers } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Loader2, Users, FileWarning, CheckCircle2, Clock, Activity, ArrowRight, Anchor } from "lucide-react";
import { Link } from "wouter";

export default function AdminDashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetReportsSummary();
  const { data: officersData, isLoading: isLoadingOfficers } = useListOfficers();

  if (isLoadingSummary || isLoadingOfficers) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="font-bold text-lg text-foreground">Loading command center...</p>
      </div>
    );
  }

  const officers = officersData?.officers || [];

  const StatCard = ({ title, value, icon: Icon, colorClass, desc }: any) => (
    <Card className="p-6 border-border/50 shadow-sm rounded-3xl relative overflow-hidden group hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-bl-[100px] opacity-10 transition-transform duration-500 group-hover:scale-125 ${colorClass}`} />
      <div className="relative z-10 flex flex-col h-full">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${colorClass} bg-opacity-10 text-${colorClass.replace('bg-', '')} shadow-inner`}>
          <Icon className="w-7 h-7" />
        </div>
        <p className="text-5xl font-black text-foreground mb-2 font-display">{value}</p>
        <p className="font-bold text-foreground/80 text-lg">{title}</p>
        {desc && <p className="text-sm text-muted-foreground mt-2 font-medium">{desc}</p>}
      </div>
    </Card>
  );

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      <div className="mb-8 bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-[120px] pointer-events-none" />
        <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">Command Center</h1>
        <p className="text-muted-foreground font-medium text-lg">City-wide coastal sanitation overview.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard 
          title="Total Reports" 
          value={summary?.total || 0} 
          icon={Activity} 
          colorClass="bg-blue-500 text-blue-500" 
          desc={`${summary?.last7d || 0} new this week`}
        />
        <StatCard 
          title="Needs Attention" 
          value={summary?.reported || 0} 
          icon={FileWarning} 
          colorClass="bg-destructive text-destructive" 
        />
        <StatCard 
          title="In Progress" 
          value={summary?.cleaning || 0} 
          icon={Clock} 
          colorClass="bg-secondary text-secondary-foreground" 
        />
        <StatCard 
          title="Cleaned" 
          value={summary?.cleaned || 0} 
          icon={CheckCircle2} 
          colorClass="bg-primary text-primary" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Users className="w-5 h-5" />
              </div>
              Active Officers
            </h2>
            <Link href="/admin/officers" className="text-primary font-bold text-sm hover:underline flex items-center bg-primary/5 px-4 py-2 rounded-xl transition-colors hover:bg-primary/10">
              Manage Roster <ArrowRight className="w-4 h-4 ml-1.5" />
            </Link>
          </div>

          <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border/50 uppercase tracking-wider text-xs">
                  <tr>
                    <th className="px-6 py-5">Officer Name</th>
                    <th className="px-6 py-5">Area</th>
                    <th className="px-6 py-5 text-center">Pending Tasks</th>
                    <th className="px-6 py-5 text-center">Total Resolved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {officers.slice(0, 5).map(officer => (
                    <tr key={officer.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-5 font-bold text-foreground text-base">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-secondary/20 text-secondary-foreground flex items-center justify-center text-xs">
                            {officer.name.charAt(0)}
                          </div>
                          <div>
                            {officer.name}
                            <div className="text-xs font-medium text-muted-foreground">{officer.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 font-medium text-foreground/80">
                        {officer.areaName || "Unassigned"}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-xs font-bold ${officer.pendingCount > 5 ? 'bg-destructive/10 text-destructive' : officer.pendingCount > 0 ? 'bg-secondary/20 text-secondary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          {officer.pendingCount}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center font-black text-primary text-lg">
                        {officer.reportCount - officer.pendingCount}
                      </td>
                    </tr>
                  ))}
                  {officers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground font-medium">
                        No officers active in the system.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-black text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center text-secondary-foreground">
              <Activity className="w-5 h-5" />
            </div>
            Quick Actions
          </h2>
          
          <div className="grid gap-4">
            <Link href="/admin/reports">
              <div className="bg-card border border-border/50 p-6 rounded-3xl hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors">Review All Reports</h3>
                  <p className="text-sm text-muted-foreground mt-1 font-medium">Filter, assign, and manage civic reports</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                </div>
              </div>
            </Link>
            
            <Link href="/admin/officers">
              <div className="bg-card border border-border/50 p-6 rounded-3xl hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors">Add New Officer</h3>
                  <p className="text-sm text-muted-foreground mt-1 font-medium">Expand your sanitation team roster</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                </div>
              </div>
            </Link>
          </div>
          
          <div className="bg-primary border border-primary text-primary-foreground rounded-3xl p-8 mt-6 relative overflow-hidden shadow-xl shadow-primary/20">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-[100px]" />
            <h3 className="font-black text-xl mb-3 flex items-center gap-2">
              <Anchor className="w-6 h-6" /> Coast Status
            </h3>
            <p className="text-primary-foreground/90 leading-relaxed font-medium text-lg">
              Last 24 hours saw <span className="font-black text-white bg-white/20 px-2 py-0.5 rounded-md">{summary?.last24h || 0}</span> new reports. 
              Current completion rate is <span className="font-black text-white bg-white/20 px-2 py-0.5 rounded-md ml-1">
                {summary?.total ? Math.round((summary.cleaned / summary.total) * 100) : 0}%
              </span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
