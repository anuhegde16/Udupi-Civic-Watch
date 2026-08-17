import { useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export type { DateRange };

/** Returns ISO strings for the selected range, suitable for ?from=...&to=... API params. */
export function dateRangeToParams(
  range: DateRange | undefined,
): { from?: string; to?: string } {
  if (!range?.from) return {};
  const from = new Date(range.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(range.to ?? range.from);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

const PRESETS = [
  { label: "Today", from: 0, to: 0 },
  { label: "Yesterday", from: 1, to: 1 },
  { label: "Last 7 days", from: 6, to: 0 },
  { label: "Last 30 days", from: 29, to: 0 },
  { label: "Last 60 days", from: 59, to: 0 },
  { label: "Last 90 days", from: 89, to: 0 },
  { label: "Last year", from: 364, to: 0 },
  { label: "This month", from: -1, to: 0 },
] as const;

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const pickingEndRef = useRef(false);
  const isActive = !!value?.from;

  return (
    <div className={className}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (!o && pickingEndRef.current) return;
          setOpen(o);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted/60 border-border/60 text-foreground"
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isActive
                ? value!.to &&
                  format(value!.to, "d MMM") !== format(value!.from!, "d MMM")
                  ? `${format(value!.from!, "d MMM")} – ${format(value!.to, "d MMM")}`
                  : format(value!.from!, "d MMM yyyy")
                : "All dates"}
            </span>
            {isActive && (
              <span
                role="button"
                aria-label="Clear date filter"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                }}
                className="ml-0.5 hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* Quick presets */}
          <div className="flex items-center gap-1.5 p-2.5 border-b border-border/50 flex-wrap">
            {PRESETS.map(({ label, from, to }) => (
              <button
                key={label}
                type="button"
                className="text-xs font-bold px-2.5 py-1 rounded-lg bg-muted hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap"
                onClick={() => {
                  const now = new Date();
                  let f: Date, t: Date;
                  if (label === "This month") {
                    f = new Date(now.getFullYear(), now.getMonth(), 1);
                    t = now;
                  } else {
                    f = new Date(now);
                    f.setDate(now.getDate() - from);
                    t = new Date(now);
                    t.setDate(now.getDate() - to);
                  }
                  onChange({ from: f, to: t });
                  if (t <= f || label === "Today" || label === "Yesterday") setOpen(false);
                }}
              >
                {label}
              </button>
            ))}
            {isActive && (
              <button
                type="button"
                className="text-xs font-bold px-2.5 py-1 rounded-lg text-destructive bg-destructive/5 hover:bg-destructive/10 transition-colors"
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
          <Calendar
            mode="range"
            selected={value}
            onSelect={(range) => {
              onChange(range);
              if (range?.from && !range?.to) {
                pickingEndRef.current = true;
              } else {
                pickingEndRef.current = false;
                if (range?.from && range?.to) setOpen(false);
              }
            }}
            disabled={{ after: new Date() }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
