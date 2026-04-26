import { useGetReportsSummary, useListOfficers, customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import {
  Loader2, Users, FileWarning, CheckCircle2, Clock,
  Activity, ArrowRight, Anchor, TrendingUp
} from "lucide-react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const STATUS_COLORS = {
  reported: "#ef4444",
  cleaning: "#f59e0b",
  cleaned: "#22c55e",
};

function useAnalytics() {
  return useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => customFetch<{
      dailyTrend: { day: string; count: number }[];
      byStatus: { total: number; reported: number; cleaning: number; cleaned: number };
      officers: { name: string; pending: number; resolved: number }[];
    }>("/admin/reports/analytics"),
    retry: false,
  });
}

export default function AdminDashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetReportsSummary();
  const { data: officersData, isLoading: isLoadingOfficers } = useListOfficers();
  const { data: analytics, isLoading: isLoadingAnalytics } = useAnalytics();

  if (isLoadingSummary || isLoadingOfficers || isLoadingAnalytics) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="font-bold text-lg text-foreground">Loading command center...</p>
      </div>
    );
  }

  const officers = officersData?.officers || [];
  const pieData = [
    { name: "New / Reported", value: summary?.reported || 0, color: STATUS_COLORS.reported },
    { name: "In Progress", value: summary?.cleaning || 0, color: STATUS_COLORS.cleaning },
    { name: "Cleaned", value: summary?.cleaned || 0, color: STATUS_COLORS.cleaned },
  ].filter((d) => d.value > 0);

  const StatCard = ({ title, value, icon: Icon, colorClass, desc }: any) => (
    <Card className="p-6 border-border/50 shadow-sm rounded-3xl relative overflow-hidden group hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-bl-[100px] opacity-10 transition-transform duration-500 group-hover:scale-125 ${colorClass}`} />
      <div className="relative z-10 flex flex-col h-full">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${colorClass} bg-opacity-10 shadow-inner`}>
          <Icon className="w-7 h-7" />
        </div>
        <p className="text-5xl font-black text-foreground mb-2">{value}</p>
        <p className="font-bold text-foreground/80 text-lg">{title}</p>
        {desc && <p className="text-sm text-muted-foreground mt-2 font-medium">{desc}</p>}
      </div>
    </Card>
  );

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-8 bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-[120px] pointer-events-none" />
        <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">Command Center</h1>
        <p className="text-muted-foreground font-medium text-lg">District-wide sanitation overview — Udupi, Karnataka.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard title="Total Reports" value={summary?.total || 0} icon={Activity} colorClass="bg-blue-500 text-blue-500" desc={`${summary?.last7d || 0} new this week`} />
        <StatCard title="Needs Attention" value={summary?.reported || 0} icon={FileWarning} colorClass="bg-red-500 text-red-500" />
        <StatCard title="In Progress" value={summary?.cleaning || 0} icon={Clock} colorClass="bg-amber-500 text-amber-500" />
        <StatCard title="Cleaned" value={summary?.cleaned || 0} icon={CheckCircle2} colorClass="bg-green-500 text-green-500" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* Daily trend bar chart */}
        <div className="lg:col-span-2 bg-card rounded-3xl border border-border/50 shadow-sm p-6">
          <h2 className="text-xl font-black text-foreground mb-1 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> Reports — Last 14 Days
          </h2>
          <p className="text-sm text-muted-foreground font-medium mb-6">Daily submission volume</p>
          {analytics?.dailyTrend && analytics.dailyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={analytics.dailyTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
                  labelStyle={{ fontWeight: 700 }}
                  cursor={{ fill: "hsl(var(--muted))" }}
                />
                <Bar dataKey="count" name="Reports" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground font-medium text-sm">
              No reports in the last 14 days
            </div>
          )}
        </div>

        {/* Status donut */}
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6 flex flex-col">
          <h2 className="text-xl font-black text-foreground mb-1">Status Breakdown</h2>
          <p className="text-sm text-muted-foreground font-medium mb-4">Current distribution</p>
          {pieData.length > 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                    {entry.name}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground font-medium text-sm">
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* Officer performance chart */}
      {analytics?.officers && analytics.officers.length > 0 && (
        <div className="bg-card rounded-3xl border border-border/50 shadow-sm p-6 mb-10">
          <h2 className="text-xl font-black text-foreground mb-1 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Officer Performance
          </h2>
          <p className="text-sm text-muted-foreground font-medium mb-6">Pending vs resolved reports per officer</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics.officers} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
                cursor={{ fill: "hsl(var(--muted))" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 12 }} />
              <Bar dataKey="pending" name="Pending" fill={STATUS_COLORS.reported} radius={[0, 4, 4, 0]} />
              <Bar dataKey="resolved" name="Resolved" fill={STATUS_COLORS.cleaned} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bottom row: officers table + quick actions */}
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
                    <th className="px-6 py-5 text-center">Pending</th>
                    <th className="px-6 py-5 text-center">Resolved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {officers.slice(0, 5).map((officer) => (
                    <tr key={officer.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-5 font-bold text-foreground text-base">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-secondary/20 text-secondary-foreground flex items-center justify-center text-xs font-black">
                            {officer.name.charAt(0)}
                          </div>
                          <div>
                            {officer.name}
                            <div className="text-xs font-medium text-muted-foreground">{officer.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 font-medium text-foreground/80">{officer.areaName || "Unassigned"}</td>
                      <td className="px-6 py-5 text-center">
                        <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-xs font-bold ${officer.pendingCount > 5 ? "bg-red-50 text-red-600" : officer.pendingCount > 0 ? "bg-amber-50 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                          {officer.pendingCount}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center font-black text-green-600 text-lg">
                        {officer.reportCount - officer.pendingCount}
                      </td>
                    </tr>
                  ))}
                  {officers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground font-medium">No officers active in the system.</td>
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

          <div className="bg-primary text-primary-foreground rounded-3xl p-8 relative overflow-hidden shadow-xl shadow-primary/20">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-bl-[100px]" />
            <h3 className="font-black text-xl mb-3 flex items-center gap-2">
              <Anchor className="w-6 h-6" /> Coast Status
            </h3>
            <p className="text-primary-foreground/90 leading-relaxed font-medium text-lg">
              Last 24 hours saw{" "}
              <span className="font-black text-white bg-white/20 px-2 py-0.5 rounded-md">{summary?.last24h || 0}</span>{" "}
              new reports. Completion rate is{" "}
              <span className="font-black text-white bg-white/20 px-2 py-0.5 rounded-md ml-1">
                {summary?.total ? Math.round(((summary.cleaned ?? 0) / summary.total) * 100) : 0}%
              </span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
