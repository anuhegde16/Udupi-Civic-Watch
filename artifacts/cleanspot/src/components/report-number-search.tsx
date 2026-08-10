import { useState, useRef, useEffect } from "react";
import { Search, Loader2, X } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import type { ReportDetail } from "@/components/report-detail-sheet";

interface ReportNumberSearchProps {
  /** Called with the fetched report when found — parent opens its detail view. */
  onFound: (report: ReportDetail) => void;
  /**
   * Builds the fetch URL for a given report ID.
   * Defaults to /api/reports/:id (works for panchayat_admin and control_center).
   * Pass a custom builder for health_inspector and environmental_engineer roles.
   */
  buildUrl?: (id: number) => string;
}

const defaultBuildUrl = (id: number) => `/api/reports/${id}`;

export function ReportNumberSearch({ onFound, buildUrl = defaultBuildUrl }: ReportNumberSearchProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input whenever the popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setValue("");
        setError(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  async function handleSearch() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const id = parseInt(trimmed, 10);
    if (isNaN(id) || id <= 0) {
      setError("Please enter a valid report number.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const report = await customFetch<ReportDetail>(buildUrl(id));
      // Normalise the shape — some role-specific endpoints return `assignedOfficer`
      // nested, others return officer fields at the top level.
      const normalised: ReportDetail = {
        id: report.id,
        address: report.address ?? null,
        latitude: report.latitude,
        longitude: report.longitude,
        status: report.status,
        wardName: (report as any).assignedOfficer?.areaName ?? (report as any).wardName ?? null,
        officerName: (report as any).assignedOfficer?.name ?? (report as any).officerName ?? null,
        imageUrl: (report as any).imageUrls?.[0]?.url ?? report.imageUrl ?? null,
        imageUrls: (report as any).imageUrls ?? null,
        cleanupImageUrl: (report as any).cleanupImageUrls?.[0]?.url ?? report.cleanupImageUrl ?? null,
        cleanupImageUrls: (report as any).cleanupImageUrls ?? null,
        reporterEmail: report.reporterEmail ?? null,
        createdAt: (report as any).createdAt ?? null,
        deletedAt: (report as any).deletedAt ?? null,
      };
      setOpen(false);
      setValue("");
      setError(null);
      onFound(normalised);
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      if (status === 404) {
        setError(`Report #${id} not found or not accessible.`);
      } else if (status === 403) {
        setError(`Report #${id} is not accessible from your account.`);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
        }}
        title="Search by report number"
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/60 hover:bg-muted px-3 py-2 rounded-xl"
        aria-label="Search by report number"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Search #</span>
      </button>

      {/* Inline popover */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setValue("");
              setError(null);
            }}
          />
          <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border/60 rounded-2xl shadow-xl p-4 w-72 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Search by Report #
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setValue("");
                  setError(null);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
              className="flex gap-2"
            >
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-sm select-none">
                  #
                </span>
                <input
                  ref={inputRef}
                  type="number"
                  min="1"
                  step="1"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                  placeholder="Report number"
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border/60 bg-muted/40 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !value.trim()}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors shrink-0"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
              </button>
            </form>

            {error && (
              <p className="mt-2.5 text-xs text-destructive font-semibold leading-snug">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
