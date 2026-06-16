import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Clock, HardHat, CheckCircle2, Loader2, ArrowRight, Trash2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrackReport } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { loadSavedReports, clearSavedReports, type SavedReport } from "@/hooks/use-saved-reports";

const STATUS_CONFIG = {
  reported: { label: "Reported", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
  cleaning: { label: "Cleaning", icon: HardHat, color: "text-blue-600 bg-blue-50 border-blue-200" },
  cleaned: { label: "Cleaned", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
} as const;

function ReportRow({ report }: { report: SavedReport }) {
  const { data, isLoading } = useTrackReport(report.id);

  const status = data?.status as keyof typeof STATUS_CONFIG | undefined;
  const cfg = status ? STATUS_CONFIG[status] : null;
  const Icon = cfg?.icon;

  return (
    <Link href={`/track/${report.id}`} className="block group">
      <div className="flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-muted/40 hover:bg-muted/70 border border-border/40 hover:border-border/70 transition-all">
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-sm shrink-0">
          #{report.id}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-sm truncate">Report #{report.id}</p>
          <p className="text-xs text-muted-foreground font-medium">
            {formatDistanceToNow(new Date(report.submittedAt), { addSuffix: true })}
          </p>
        </div>

        <div className="shrink-0">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : cfg && Icon ? (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.color}`}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground font-medium">Unknown</span>
          )}
        </div>

        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}

export function MyReports() {
  const [reports, setReports] = useState<SavedReport[]>([]);

  useEffect(() => {
    setReports(loadSavedReports());
  }, []);

  if (reports.length === 0) return null;

  function handleClear() {
    clearSavedReports();
    setReports([]);
  }

  return (
    <section className="mb-16">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-foreground">My Reports</h2>
              <p className="text-sm text-muted-foreground font-medium">
                {reports.length} report{reports.length !== 1 ? "s" : ""} submitted from this device
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl text-xs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Clear
          </Button>
        </div>

        <div className="space-y-2">
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </div>
      </div>
    </section>
  );
}
