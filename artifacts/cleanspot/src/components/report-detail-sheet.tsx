import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { MapPin, Image as ImageIcon, Trash2, Mail } from "lucide-react";

export type ReportDetail = {
  id: number;
  address?: string | null;
  latitude: number;
  longitude: number;
  status: string;
  wardName?: string | null;
  officerName?: string | null;
  imageUrl?: string | null;
  cleanupImageUrl?: string | null;
  reporterEmail?: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  reported: { label: "New", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  cleaning: { label: "In Progress", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  cleaned: { label: "Cleaned", cls: "bg-primary/10 text-primary border-primary/20" },
};

function PhotoBlock({ src, label }: { src: string; label: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
      <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
        <img src={src} alt={label} className="w-full h-full object-cover" />
      </div>
    </div>
  );
}

interface ReportDetailSheetProps {
  report: ReportDetail | null;
  open: boolean;
  onClose: () => void;
}

export function ReportDetailSheet({ report, open, onClose }: ReportDetailSheetProps) {
  const meta = report ? (STATUS_META[report.status] ?? { label: report.status, cls: "" }) : null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col overflow-y-auto">
        {report && (
          <>
            {/* Header */}
            <div className="p-5 pb-4 border-b border-border/50 bg-card shrink-0">
              <SheetHeader className="mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-lg">
                    Report #{report.id}
                  </span>
                  {meta && (
                    <Badge className={`${meta.cls} border text-xs font-black uppercase tracking-wide px-2.5 py-0.5`}>
                      {meta.label}
                    </Badge>
                  )}
                </div>
                <SheetTitle className="text-base font-black text-foreground leading-snug text-left">
                  {report.address ?? `${report.latitude.toFixed(5)}° N, ${report.longitude.toFixed(5)}° E`}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-3 space-y-1.5 text-sm">
                {report.wardName && (
                  <div className="flex items-center gap-2 text-muted-foreground font-medium">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span><span className="font-black text-foreground">Ward:</span> {report.wardName}</span>
                  </div>
                )}
                {report.officerName && (
                  <div className="flex items-center gap-2 text-muted-foreground font-medium">
                    <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-[10px] font-black text-muted-foreground">👤</span>
                    <span><span className="font-black text-foreground">Officer:</span> {report.officerName}</span>
                  </div>
                )}
                {report.reporterEmail && (
                  <div className="flex items-center gap-2 text-muted-foreground font-medium">
                    <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="font-black text-foreground">Reporter:</span>
                    <a href={`mailto:${report.reporterEmail}`} className="text-primary hover:underline truncate text-sm">
                      {report.reporterEmail}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground font-medium">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs">{report.latitude.toFixed(5)}° N, {report.longitude.toFixed(5)}° E</span>
                </div>
              </div>
            </div>

            {/* Photos */}
            <div className="flex-1 p-5 space-y-5">
              {report.imageUrl ? (
                <PhotoBlock src={report.imageUrl} label="Waste Report Photo" />
              ) : (
                <div className="w-full aspect-[4/3] rounded-2xl bg-muted/60 flex flex-col items-center justify-center gap-2 border border-dashed border-border/60">
                  <Trash2 className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground font-medium">No photo submitted</p>
                </div>
              )}

              {report.cleanupImageUrl && (
                <PhotoBlock src={report.cleanupImageUrl} label="Cleanup Confirmation Photo" />
              )}

              {!report.imageUrl && !report.cleanupImageUrl && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mt-1">
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>No photos attached to this report.</span>
                </div>
              )}

              <a
                href={`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}&zoom=17`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border/60 text-sm font-bold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" /> Open in Map
              </a>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
