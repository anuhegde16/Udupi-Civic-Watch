import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Camera, CheckCircle2, ChevronDown, MoveHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

/** Cards shown on a phone before "Show more" (the grid on larger screens shows all). */
const PHONE_INITIAL_CARDS = 3;

interface CleanupPair {
  id: number;
  panchayat: string | null;
  address: string | null;
  cleanedAt: string;
  daysToClean: number;
  beforeUrl: string;
  afterUrl: string;
}

async function fetchPairs(): Promise<CleanupPair[]> {
  const res = await fetch(`${BASE_URL}/api/reports/public/before-after`);
  if (!res.ok) return [];
  return res.json();
}

/** Ask the server for a smaller copy of a stored photo (about 80 KB instead of 500 KB). */
function smallPhoto(url: string): string {
  if (!url.includes("/api/uploads/files/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}w=800`;
}

/** First two parts of the address, e.g. "Kaup Beach Road, Kaup". */
function placeLabel(pair: CleanupPair): string {
  const parts = (pair.address ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length) return parts.join(", ");
  return pair.panchayat ?? "Udupi District";
}

function cleanedIn(days: number): string {
  if (days <= 0) return "Cleaned the same day";
  if (days === 1) return "Cleaned in 1 day";
  return `Cleaned in ${days} days`;
}

/**
 * One drag-to-compare photo.
 *
 * The photo area uses pointer events with `touch-action: pan-y`, so on a phone
 * a sideways finger drag moves the slider while an up/down drag still scrolls
 * the page. A visually hidden range input keeps it usable with a keyboard or
 * screen reader.
 */
function CompareSlider({ pair }: { pair: CleanupPair }) {
  const [pos, setPos] = useState(50);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const place = placeLabel(pair);

  const moveTo = (clientX: number) => {
    const box = boxRef.current;
    if (!box) return;
    const { left, width } = box.getBoundingClientRect();
    if (width <= 0) return;
    setPos(Math.min(100, Math.max(0, ((clientX - left) / width) * 100)));
  };

  return (
    <div
      ref={boxRef}
      className="relative aspect-[4/3] w-full cursor-ew-resize select-none overflow-hidden bg-muted focus-within:ring-2 focus-within:ring-primary"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) moveTo(e.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <img
        src={smallPhoto(pair.afterUrl)}
        alt={`${place} after cleanup`}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <img
        src={smallPhoto(pair.beforeUrl)}
        alt={`${place} before cleanup`}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-primary/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground backdrop-blur-sm">
        After
      </span>

      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.45)]" />
        <div className="absolute top-1/2 -ml-6 -mt-6 flex h-12 w-12 items-center justify-center rounded-full border border-border/50 bg-white text-primary shadow-lg">
          <MoveHorizontal className="h-5 w-5" />
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(pos)}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label={`Compare before and after, ${place}`}
        className="sr-only"
      />
    </div>
  );
}

/**
 * Home-page gallery of recent cleanups: a before/after photo you can drag to
 * compare. Shows nothing until there is at least one cleanup with both photos.
 * On a phone it is one card per row (so a sideways drag never fights a
 * sideways scroll) and starts with three cards.
 */
export function BeforeAfterGallery() {
  const [showAll, setShowAll] = useState(false);
  const { data } = useQuery<CleanupPair[]>({
    queryKey: ["public-before-after"],
    queryFn: fetchPairs,
    staleTime: 5 * 60 * 1000,
  });

  if (!data || data.length === 0) return null;

  const hiddenOnPhone = data.length - PHONE_INITIAL_CARDS;

  return (
    <section className="mb-16">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-foreground">Cleaned up, and here's the proof</h2>
            <p className="text-muted-foreground mt-1">Real spots reported by citizens and cleared by our field teams. Drag the photo to compare.</p>
          </div>
          <Link href="/report">
            <Button variant="outline" size="sm" className="rounded-xl shrink-0 ml-4 mt-1">
              <Camera className="w-3.5 h-3.5 mr-2" />
              Report
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {data.map((pair, i) => (
            <article
              key={pair.id}
              className={`overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm ${
                i >= PHONE_INITIAL_CARDS && !showAll ? "hidden md:block" : ""
              }`}
            >
              <CompareSlider pair={pair} />
              <div className="space-y-2 p-4">
                <p className="truncate font-bold text-foreground">{placeLabel(pair)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    {cleanedIn(pair.daysToClean)}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatDistanceToNow(new Date(pair.cleanedAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {hiddenOnPhone > 0 && !showAll && (
          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl font-bold md:hidden"
            onClick={() => setShowAll(true)}
          >
            Show {hiddenOnPhone} more
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </section>
  );
}
