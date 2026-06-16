const STORAGE_KEY = "recent_reports";
const MAX_SAVED = 20;

export interface SavedReport {
  id: number;
  submittedAt: string;
}

function normalise(raw: unknown): SavedReport[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "number") {
        return { id: item, submittedAt: new Date().toISOString() };
      }
      if (item && typeof item === "object" && "id" in item) {
        return { id: Number(item.id), submittedAt: String((item as Record<string, unknown>).submittedAt ?? new Date().toISOString()) };
      }
      return null;
    })
    .filter((x): x is SavedReport => x !== null && !isNaN(x.id));
}

export function loadSavedReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalise(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveReport(id: number): void {
  try {
    const existing = loadSavedReports().filter((r) => r.id !== id);
    const updated: SavedReport[] = [
      { id, submittedAt: new Date().toISOString() },
      ...existing,
    ].slice(0, MAX_SAVED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

export function clearSavedReports(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
