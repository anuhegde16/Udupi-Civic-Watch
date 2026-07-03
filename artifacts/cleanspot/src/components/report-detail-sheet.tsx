import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MapPin, Image as ImageIcon, Trash2, Mail, Loader2, CheckCircle2, Clock, Archive } from "lucide-react";
import { format } from "date-fns";
import { useImageLightbox } from "@/components/image-lightbox";

export type ReportDetail = {
  id: number;
  address?: string | null;
  latitude: number;
  longitude: number;
  status: string;
  wardName?: string | null;
  officerName?: string | null;
  imageUrl?: string | null;
  imageUrls?: { url: string; uploadedAt: string }[] | null;
  cleanupImageUrl?: string | null;
  cleanupImageUrls?: { url: string; uploadedAt: string }[] | null;
  reporterEmail?: string | null;
  createdAt?: string | null;
  deletedAt?: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  reported: { label: "New", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  cleaning: { label: "In Progress", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  cleaned: { label: "Cleaned", cls: "bg-primary/10 text-primary border-primary/20" },
};

function PhotoBlock({ src, label, onClick }: { src: string; label: string; onClick: () => void }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
      <button
        type="button"
        onClick={onClick}
        className="block w-full aspect-[4/3] rounded-2xl overflow-hidden bg-muted cursor-zoom-in"
        aria-label={`View ${label} full screen`}
      >
        <img src={src} alt={label} className="w-full h-full object-cover" />
      </button>
    </div>
  );
}

interface ReportDetailSheetProps {
  report: ReportDetail | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (reportId: number, newStatus: "cleaning" | "cleaned") => Promise<void>;
  isUpdating?: boolean;
  onArchive?: (reportId: number) => void;
  isArchiving?: boolean;
}

export function ReportDetailSheet({ report, open, onClose, onStatusChange, isUpdating, onArchive, isArchiving }: ReportDetailSheetProps) {
  const { lightbox, open: openLightbox } = useImageLightbox();
  const meta = report ? (STATUS_META[report.status] ?? { label: report.status, cls: "" }) : null;

  const canAdvance = report && onStatusChange && report.status !== "cleaned";
  const nextStatus: "cleaning" | "cleaned" | null =
    report?.status === "reported" ? "cleaning" : report?.status === "cleaning" ? "cleaned" : null;

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
                {report.createdAt && (
                  <div className="flex items-center gap-2 text-muted-foreground font-medium">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span><span className="font-black text-foreground">Reported:</span> {format(new Date(report.createdAt), "MMM d, h:mm a")}</span>
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
              {(() => {
                const reportPhotos =
                  report.imageUrls && report.imageUrls.length > 0
                    ? report.imageUrls.map((p) => p.url)
                    : report.imageUrl
                    ? [report.imageUrl]
                    : [];
                return reportPhotos.length > 0 ? (
                  reportPhotos.map((src, i) => (
                    <PhotoBlock
                      key={src}
                      src={src}
                      label={reportPhotos.length > 1 ? `Waste Report Photo ${i + 1}` : "Waste Report Photo"}
                      onClick={() => openLightbox(reportPhotos, i)}
                    />
                  ))
                ) : (
                  <div className="w-full aspect-[4/3] rounded-2xl bg-muted/60 flex flex-col items-center justify-center gap-2 border border-dashed border-border/60">
                    <Trash2 className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground font-medium">No photo submitted</p>
                  </div>
                );
              })()}

              {(() => {
                const cleanupPhotos =
                  report.cleanupImageUrls && report.cleanupImageUrls.length > 0
                    ? report.cleanupImageUrls.map((p) => p.url)
                    : report.cleanupImageUrl
                    ? [report.cleanupImageUrl]
                    : [];
                return cleanupPhotos.map((src, i) => (
                  <PhotoBlock
                    key={src}
                    src={src}
                    label={cleanupPhotos.length > 1 ? `Cleanup Confirmation Photo ${i + 1}` : "Cleanup Confirmation Photo"}
                    onClick={() => openLightbox(cleanupPhotos, i)}
                  />
                ));
              })()}

              {!(report.imageUrls?.length || report.imageUrl) && !(report.cleanupImageUrls?.length || report.cleanupImageUrl) && (
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

              {/* Status action for panchayat_admin */}
              {canAdvance && nextStatus && (
                <div className="border-t border-border/50 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Update Status
                  </p>
                  <Button
                    className={`w-full rounded-xl h-11 font-black text-sm ${
                      nextStatus === "cleaning"
                        ? "bg-blue-500 hover:bg-blue-600 text-white"
                        : "bg-primary hover:bg-primary/90 text-primary-foreground"
                    }`}
                    disabled={isUpdating}
                    onClick={() => onStatusChange(report.id, nextStatus)}
                  >
                    {isUpdating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : nextStatus === "cleaning" ? (
                      <Clock className="w-4 h-4 mr-2" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    {nextStatus === "cleaning" ? "Mark as In Progress" : "Mark as Cleaned"}
                  </Button>
                </div>
              )}

              {report.status === "cleaned" && onStatusChange && (
                <div className="border-t border-border/50 pt-4 flex items-center gap-2 text-xs text-primary font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>This report has been cleaned.</span>
                </div>
              )}

              {onArchive && !report.deletedAt && (
                <div className="border-t border-border/50 pt-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full rounded-xl h-11 font-bold text-sm border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-700"
                        disabled={isArchiving}
                      >
                        {isArchiving ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Archive className="w-4 h-4 mr-2" />
                        )}
                        Archive Report
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-[2rem] p-8">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-black text-2xl">Archive this report?</AlertDialogTitle>
                        <AlertDialogDescription className="text-base text-muted-foreground mt-3">
                          Report #{report.id} will be moved to the archive and hidden from the dashboard, map, and stats. It is not deleted and can still be viewed in the Archived view.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="mt-6 gap-2">
                        <AlertDialogCancel className="rounded-xl font-bold h-11">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-slate-700 hover:bg-slate-800 rounded-xl font-black h-11"
                          onClick={() => onArchive(report.id)}
                        >
                          Yes, archive
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

              {report.deletedAt && (
                <div className="border-t border-border/50 pt-4 flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <Archive className="w-4 h-4 shrink-0" />
                  <span>This report is archived.</span>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
      {lightbox}
    </Sheet>
  );
}
