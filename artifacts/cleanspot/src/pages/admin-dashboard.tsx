import { useGetReportsSummary, useListOfficers } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Loader2, Users, FileWarning, CheckCircle2, Clock, Activity, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function AdminDashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetReportsSummary();
  const { data: officersData, isLoading: isLoadingOfficers } = useListOfficers();

  if (isLoadingSummary || isLoadingOfficers) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="mt-4 font-medium text-gray-500">Loading command center...</p>
      </div>
    );
  }

  const officers = officersData?.officers || [];

  const StatCard = ({ title, value, icon: Icon, colorClass, desc }: any) => (
    <Card className="p-6 border-0 shadow-sm rounded-3xl relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10 transition-transform group-hover:scale-110 ${colorClass}`} />
      <div className="relative z-10 flex flex-col h-full">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${colorClass} bg-opacity-10 text-${colorClass.replace('bg-', '')}`}>
          <Icon className="w-6 h-6" />
        </div>
        <p className="text-4xl font-black text-gray-900 mb-1">{value}</p>
        <p className="font-bold text-gray-700">{title}</p>
        {desc && <p className="text-sm text-gray-500 mt-1 font-medium">{desc}</p>}
      </div>
    </Card>
  );

  return (
    <div className="pb-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Command Center</h1>
        <p className="text-gray-600 font-medium">City-wide sanitation overview.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard 
          title="Total Reports" 
          value={summary?.total || 0} 
          icon={Activity} 
          colorClass="bg-blue-500" 
          desc={`${summary?.last7d || 0} this week`}
        />
        <StatCard 
          title="Needs Attention" 
          value={summary?.reported || 0} 
          icon={FileWarning} 
          colorClass="bg-red-500" 
        />
        <StatCard 
          title="In Progress" 
          value={summary?.cleaning || 0} 
          icon={Clock} 
          colorClass="bg-yellow-500" 
        />
        <StatCard 
          title="Cleaned" 
          value={summary?.cleaned || 0} 
          icon={CheckCircle2} 
          colorClass="bg-green-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Active Officers
            </h2>
            <Link href="/admin/officers" className="text-primary font-bold text-sm hover:underline flex items-center">
              Manage Roster <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4">Officer Name</th>
                    <th className="px-6 py-4">Area</th>
                    <th className="px-6 py-4 text-center">Pending Tasks</th>
                    <th className="px-6 py-4 text-center">Total Resolved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {officers.slice(0, 5).map(officer => (
                    <tr key={officer.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">
                        {officer.name}
                        <div className="text-xs font-normal text-gray-500">{officer.email}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-700">
                        {officer.areaName || "Unassigned"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${officer.pendingCount > 5 ? 'bg-red-100 text-red-700' : officer.pendingCount > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                          {officer.pendingCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-primary">
                        {officer.reportCount - officer.pendingCount}
                      </td>
                    </tr>
                  ))}
                  {officers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 font-medium">
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
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Quick Actions
          </h2>
          
          <div className="grid gap-3">
            <Link href="/admin/reports">
              <div className="bg-white border border-gray-200 p-5 rounded-2xl hover:border-primary hover:shadow-md transition-all cursor-pointer group flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors">Review All Reports</h3>
                  <p className="text-sm text-gray-500 mt-1">Filter, assign, and manage civic reports</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors" />
              </div>
            </Link>
            
            <Link href="/admin/officers">
              <div className="bg-white border border-gray-200 p-5 rounded-2xl hover:border-primary hover:shadow-md transition-all cursor-pointer group flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors">Add New Officer</h3>
                  <p className="text-sm text-gray-500 mt-1">Expand your sanitation team roster</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors" />
              </div>
            </Link>
          </div>
          
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mt-4">
            <h3 className="font-bold text-primary mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4" /> System Status
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed font-medium">
              Last 24 hours saw <span className="font-black text-primary">{summary?.last24h || 0}</span> new reports. 
              Current completion rate is <span className="font-black text-primary">
                {summary?.total ? Math.round((summary.cleaned / summary.total) * 100) : 0}%
              </span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
