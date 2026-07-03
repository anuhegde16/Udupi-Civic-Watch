import { useEffect, useState } from "react";
import { formatRelativeUpdated } from "@/lib/relative-time";

export function useRelativeTime(date: Date): string {
  const [label, setLabel] = useState(() => formatRelativeUpdated(date));

  useEffect(() => {
    setLabel(formatRelativeUpdated(date));
    const interval = setInterval(() => {
      setLabel(formatRelativeUpdated(date));
    }, 60_000);
    return () => clearInterval(interval);
  }, [date]);

  return label;
}
