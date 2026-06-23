import { useAuth } from "@/hooks/use-auth";
import { getGreeting } from "@/lib/greeting";
import { useGetOfficerReports, useGetOfficer, getGetOfficerReportsQueryKey, getGetOfficerQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  Clock,
  FileWarning,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wrench,
  LayoutList,
  ArrowUpDown,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OfficerZoneMap } from "@/components/officer-zone-map";
import { NotificationCTABanner } from "@/components/notification-cta-banner";

type StatusFilter = "all" | "reported" | "cleaning" | "cleaned";
type SortOption = "newest" | "oldest" | "status";

export default function OfficerDashboard() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");

  const officerId = user?.officerId || 0;

  const { data: allData, isLoading } = useGetOfficerReports(
    officerId,
    {},
    { query: { queryKey: getGetOfficerReportsQueryKey(officerId), enabled: !!officerId, staleTime: 60_000 } },
  );

  const { data: officerData } = useGetOfficer(officerId, {
    query: { queryKey: getGetOfficerQueryKey(officerId), enabled: !!officerId, staleTime: 5 * 60_000 },
  });

  const allReports = allData?.reports || [];

  const stats = useMemo(() => {
    const total = allReports.length;
    const newCount = allReports.filter((r) => r.status === "reported").length;
    const inProgress = allReports.filter((r) => r.status === "cleaning").length;
    const cleaned = allReports.filter((r) => r.status === "cleaned").length;
    const pct = total > 0 ? Math.round((cleaned / total) * 100) : 0;
    return { total, newCount, inProgress, cleaned, pct };
  }, [allReports]);

  const filteredReports = useMemo(() => {
    let list = allReports;

    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.address?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q),
      );
    }

    if (sort === "newest") {
      list = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } else if (sort === "oldest") {
      list = [...list].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    } else if (sort === "status") {
      const order: Record<string, number> = { reported: 0, cleaning: 1, cleaned: 2 };
      list = [...list].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    }

    return list;
  }, [allReports, statusFilter, search, sort]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "reported":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "cleaning":
        return "bg-secondary/10 text-secondary-foreground border-secondary/20";
      case "cleaned":
        return "bg-primary/10 text-primary border-primary/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "reported":
        return "New";
      case "cleaning":
        return "In Progress";
      case "cleaned":
        return "Cleaned";
      default:
        return status;
    }
  };

  const hasGeo = officerData?.areaName != null;

  const statCards: { label: string; value: number; icon: React.ReactNode; color: string; bg: string; activeBg: string; filter: StatusFilter }[] = [
    {
      label: "Total",
      value: stats.total,
      icon: <LayoutList className="w-5 h-5" />,
      color: "text-foreground",
      bg: "bg-muted/60",
      activeBg: "bg-muted ring-2 ring-foreground/30",
      filter: "all",
    },
    {
      label: "New",
      value: stats.newCount,
      icon: <AlertCircle className="w-5 h-5" />,
      color: "text-destructive",
      bg: "bg-destructive/8",
      activeBg: "bg-destructive/20 ring-2 ring-destructive/40",
      filter: "reported",
    },
    {
      label: "In Progress",
      value: stats.inProgress,
      icon: <Wrench className="w-5 h-5" />,
      color: "text-orange-500",
      bg: "bg-orange-50",
      activeBg: "bg-orange-100 ring-2 ring-orange-400/40",
      filter: "cleaning",
    },
    {
      label: "Cleaned",
      value: stats.cleaned,
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: "text-primary",
      bg: "bg-primary/8",
      activeBg: "bg-primary/20 ring-2 ring-primary/40",
      filter: "cleaned",
    },
  ];

  return (
    <div className="w-full pb-10 animate-in fade-in duration-500 space-y-6">
      <NotificationCTABanner variant="officer" />
      {/* Header */}
      <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-bl-[100px] pointer-events-none" />
        <p className="text-sm font-medium text-muted-foreground mb-1">
          {getGreeting(user?.name)}
        </p>
        <h1 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-1">
          My Zone
        </h1>
        <p className="text-muted-foreground font-medium">
          {officerData?.areaName
            ? `Ward: ${officerData.areaName}${officerData.panchayatName ? ` — ${officerData.panchayatName} Panchayat` : ""}`
            : "Your assigned area"}
        </p>

        {/* Stats strip */}
        {isLoading ? (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-muted/40 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              {statCards.map((s) => {
                const isActive = statusFilter === s.filter;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setStatusFilter(isActive ? "all" : s.filter)}
                    className={`${isActive ? s.activeBg : s.bg} rounded-2xl px-4 py-3 flex items-center gap-3 transition-all duration-150 hover:brightness-95 active:scale-95 cursor-pointer text-left w-full`}
                    title={isActive ? "Show all reports" : `Filter by: ${s.label}`}
                  >
                    <div className={`${s.color} shrink-0`}>{s.icon}</div>
                    <div>
                      <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-muted-foreground font-semibold leading-tight">
                        {s.label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Completion progress bar */}
            {stats.total > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                    Zone completion
                  </span>
                  <span className="text-xs font-black text-primary">{stats.pct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700"
                    style={{ width: `${stats.pct}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Zone Map */}
      {!isLoading && hasGeo && (
        <OfficerZoneMap
          reports={allReports}
          areaName={officerData!.areaName || "My Zone"}
        />
      )}

      {/* Filters row: search + sort + status tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by address or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-border/60 bg-card h-11 text-sm font-medium"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-[148px] rounded-xl border-border/60 bg-card h-11 text-sm font-bold shrink-0 gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="status">By status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <TabsList className="bg-background/50 backdrop-blur-sm border border-border shadow-sm rounded-2xl p-1.5 h-auto flex flex-wrap max-w-full overflow-x-auto w-full">
            <TabsTrigger
              value="all"
              className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2 px-5 font-bold text-sm flex-1 transition-all"
            >
              All ({stats.total})
            </TabsTrigger>
            <TabsTrigger
              value="reported"
              className="rounded-xl data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground py-2 px-5 font-bold text-sm flex-1 transition-all"
            >
              New ({stats.newCount})
            </TabsTrigger>
            <TabsTrigger
              value="cleaning"
              className="rounded-xl data-[state=active]:bg-orange-500 data-[state=active]:text-white py-2 px-5 font-bold text-sm flex-1 transition-all"
            >
              Progress ({stats.inProgress})
            </TabsTrigger>
            <TabsTrigger
              value="cleaned"
              className="rounded-xl data-[state=active]:bg-primary/20 data-[state=active]:text-primary py-2 px-5 font-bold text-sm flex-1 transition-all"
            >
              Cleaned ({stats.cleaned})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Report cards */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="font-bold text-lg">Loading assigned reports…</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-[2.5rem] flex flex-col items-center justify-center py-20 px-4 text-center shadow-sm">
          <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-black text-foreground mb-1">No reports found</h3>
          <p className="text-muted-foreground font-medium">
            {search
              ? `No results for "${search}"`
              : statusFilter === "all"
              ? "Your zone is clear — great work!"
              : `No ${getStatusLabel(statusFilter).toLowerCase()} reports.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredReports.map((report, i) => (
            <Link key={report.id} href={`/officer/report/${report.id}`}>
              <Card
                className="overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all border-border/50 cursor-pointer h-full flex flex-col group rounded-3xl animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="aspect-[4/3] w-full bg-muted relative overflow-hidden">
                  {report.imageUrl ? (
                    <img
                      src={report.imageUrl}
                      alt="Waste report"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <FileWarning className="w-12 h-12 opacity-50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="absolute top-3 left-3">
                    <Badge
                      className={`${getStatusColor(report.status)} border shadow-sm px-2.5 py-1 text-xs font-black uppercase tracking-wider backdrop-blur-md`}
                    >
                      {getStatusLabel(report.status)}
                    </Badge>
                  </div>

                  <div className="absolute top-3 right-3">
                    <div className="bg-black/70 backdrop-blur-md text-white text-xs font-black font-mono px-2.5 py-1 rounded-lg shadow-sm">
                      #{report.id}
                    </div>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col bg-card">
                  <p className="font-bold text-foreground text-base mb-2 line-clamp-2 leading-snug group-hover:text-primary transition-colors flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>
                      {report.address ||
                        `${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}`}
                    </span>
                  </p>

                  <div className="mt-auto space-y-2">
                    {report.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 italic font-medium bg-muted/50 p-2.5 rounded-xl">
                        "{report.description}"
                      </p>
                    )}
                    <div className="flex items-center text-xs text-muted-foreground font-bold pt-2.5 border-t border-border/50">
                      <Clock className="w-3.5 h-3.5 mr-1.5" />
                      {format(new Date(report.createdAt), "MMM d, h:mm a")}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
