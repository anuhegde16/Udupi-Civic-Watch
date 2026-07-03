import { format } from "date-fns";

export function formatRelativeUpdated(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;

  return format(date, "HH:mm");
}
