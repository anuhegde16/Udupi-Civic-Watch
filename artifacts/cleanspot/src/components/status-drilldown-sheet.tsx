import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { MapPin, FileWarning, Loader2, CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";
import { useImageLightbox } from "@/components/image-lightbox";

export type DrilldownReport = {
  id: number;
  status: string;
  address?: string | null;
  wardName?: string | null;
  supervisorName?: string | null;
  hiName?: string | null;
  imageUrl?: string | null;
  imageUrls?: { url: string }[] | null;
  createdAt: string;
  cleaningStartedAt?: string | null;
  cleanedAt?: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  reported: { label: "New", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  cleaning: { label: "In Progress", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  cleaned: { label: "Cleaned", cls: "bg-primary/10 text-primary border-primary/20" },
};

interface StatusDrilldownSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  reports: DrilldownReport[];
  isLoading: boolean;
  /** Currently active ward filter */
  wardName?: string | null;
  /** All wards available for filtering */
  availableWards?: string[];
  /** Called when the user picks a ward (null = all) */
  onWardChange?: (ward: string | null) => void;
}

function TimelineStep({
  label,
  time,
  done,
  last,
}: {
  label: string;
  time?: string | null;
  done: boolean;
  last?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2.5 ${!last ? "pb-2" : ""}`}>
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
            done
              ? "bg-primary text-primary-foreground"
              : "bg-muted border-2 border-border"
          }`}
        >
          {done ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <Circle className="w-2.5 h-2.5 text-muted-foreground opacity-40" />
          )}
        </div>
        {!last && (
          <div
            className={`w-px flex-1 mt-1 min-h-[12px] ${
              done ? "bg-primary/30" : "bg-border/50"
            }`}
          />
        )}
      </div>
      <div className="pb-1">
        <p className={`text-xs font-bold ${done ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </p>
        <p className="text-xs text-muted-foreground">
          {time ? format(new Date(time), "MMM d, h:mm a") : "—"}
        </p>
      </div>
    </div>
  );
}

export function StatusDrilldownSheet({
  open,
  onClose,
  title,
  reports,
  isLoading,
  wardName,
  availableWards,
  onWardChange,
}: StatusDrilldownSheetProps) {
  const { lightbox, open: openLightbox } = useImageLightbox();
  const showWardFilter = onWardChange && availableWards && availableWards.length > 1;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        {lightbox}

        {/* Header */}
        <div className="p-5 border-b border-border/50 bg-card shrink-0">
          <SheetHeader>
            <SheetTitle className="text-lg font-black text-foreground">{title}</SheetTitle>
          </SheetHeader>
          {!isLoading && (
            <p className="text-sm text-muted-foreground font-medium mt-0.5">
              {reports.length} complaint{reports.length !== 1 ? "s" : ""}
            </p>
          )}
          {showWardFilter && (
            <div className="mt-3">
              <select
                value={wardName ?? ""}
                onChange={(e) => onWardChange!(e.target.value || null)}
                className="w-full text-sm font-semibold rounded-xl border border-border/60 bg-muted/40 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">All wards</option>
                {availableWards!.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="font-bold text-base">Loading complaints…</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <CheckCircle2 className="w-14 h-14 text-primary opacity-30 mb-3" />
              <p className="font-black text-base text-foreground">All clear!</p>
              <p className="text-sm font-medium mt-1">No complaints in this category.</p>
            </div>
          ) : (
            reports.map((r) => {
              const thumb = r.imageUrls?.[0]?.url ?? r.imageUrl;
              const meta = STATUS_META[r.status] ?? { label: r.status, cls: "" };
              return (
                <div
                  key={r.id}
                  className="bg-card border border-border/50 rounded-2xl overflow-hidden"
                >
                  <div className="flex gap-3 p-4">
                    {/* Thumbnail */}
                    {thumb ? (
                      <button
                        type="button"
                        onClick={() => {
                          const urls = r.imageUrls?.length
                            ? r.imageUrls.map((p) => p.url)
                            : [thumb!];
                          openLightbox(urls, 0);
                        }}
                        className="w-20 h-20 shrink-0 rounded-xl overflow-hidden cursor-zoom-in bg-muted"
                      >
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="w-20 h-20 shrink-0 rounded-xl bg-muted flex items-center justify-center">
                        <FileWarning className="w-8 h-8 text-muted-foreground opacity-40" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Badge row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={`${meta.cls} border text-xs font-black uppercase tracking-wider`}
                        >
                          {meta.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">#{r.id}</span>
                        {r.wardName && (
                          <span className="text-xs font-bold text-muted-foreground">
                            {r.wardName}
                          </span>
                        )}
                      </div>

                      {/* Address */}
                      <p className="text-sm font-medium text-foreground flex items-start gap-1.5 line-clamp-2">
                        <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        {r.address || "Location unavailable"}
                      </p>

                      {/* Attribution */}
                      {(r.supervisorName || r.hiName) && (
                        <p className="text-xs text-muted-foreground font-medium">
                          {r.hiName && (
                            <span>
                              HI:{" "}
                              <span className="font-bold text-foreground">{r.hiName}</span>
                            </span>
                          )}
                          {r.hiName && r.supervisorName && (
                            <span className="mx-1 opacity-40">·</span>
                          )}
                          {r.supervisorName && (
                            <span>
                              Officer:{" "}
                              <span className="font-bold text-foreground">{r.supervisorName}</span>
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Timeline strip */}
                  <div className="px-4 pb-4 pt-1 border-t border-border/40 mt-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                      Timeline
                    </p>
                    <TimelineStep label="Reported" time={r.createdAt} done={true} />
                    <TimelineStep
                      label="Cleaning Started"
                      time={r.cleaningStartedAt}
                      done={!!r.cleaningStartedAt}
                    />
                    <TimelineStep
                      label="Cleaned"
                      time={r.cleanedAt}
                      done={!!r.cleanedAt}
                      last
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
