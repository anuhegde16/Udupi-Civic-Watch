// Ward / panchayat boundary data, loaded on demand.
//
// The boundaries live in src/data/geo/:
//   index.json        - tiny list of panchayats (name, file, ward count, bounding box)
//   <slug>.json       - GeoJSON features (1 outline + the wards) for ONE panchayat
//
// Only index.json ships with the main app. Each panchayat file is a separate download
// that happens the first time something needs that panchayat, so adding more panchayats
// does not make the first page load any bigger.
//
// To add a panchayat: drop <slug>.json into src/data/geo/ and add one line to index.json.
// No code changes are needed.

import { useEffect, useReducer, useState } from "react";
import indexData from "@/data/geo/index.json";

export interface GeoFeature {
  type: "Feature";
  properties: {
    name: string;
    type: "ward" | "district" | string;
    panchayat: string;
    wardName?: string;
    [key: string]: unknown;
  };
  geometry: {
    type: string;
    /** Polygon rings as [lon, lat] pairs; ring 0 is the outer boundary. */
    coordinates: number[][][];
  };
}

export interface PanchayatMeta {
  name: string;
  slug: string;
  wardCount: number;
  /** [south, west, north, east] in degrees */
  bbox: [number, number, number, number];
  /** Every ward in this panchayat (name as used in reports/officers, optional display label). */
  wards: { name: string; label?: string }[];
}

/** Small, always-available list of panchayats, in display order. */
export const PANCHAYATS: PanchayatMeta[] = (
  indexData as { panchayats: PanchayatMeta[] }
).panchayats;

export const PANCHAYAT_NAMES: string[] = PANCHAYATS.map((p) => p.name);

export function getPanchayatMeta(name: string): PanchayatMeta | undefined {
  return PANCHAYATS.find((p) => p.name === name);
}

export function getWardCount(name: string): number {
  return getPanchayatMeta(name)?.wardCount ?? 0;
}

/** Ward names of one panchayat, e.g. "Udupi Ward 5", in the order stored in the data. */
export function getWardNames(panchayat: string): string[] {
  return getPanchayatMeta(panchayat)?.wards.map((w) => w.name) ?? [];
}

/** Every ward name across all panchayats. */
export const ALL_WARD_NAMES: string[] = PANCHAYATS.flatMap((p) => p.wards.map((w) => w.name));

/** ward name -> panchayat name (if two panchayats share a ward name the later one wins). */
export const WARD_PANCHAYAT: Record<string, string> = Object.fromEntries(
  PANCHAYATS.flatMap((p) => p.wards.map((w) => [w.name, p.name] as const)),
);

/** Optional display label (the area name, e.g. "Kola") of a ward, if it has one. */
export function getWardLabel(wardName: string): string | undefined {
  for (const p of PANCHAYATS) {
    const hit = p.wards.find((w) => w.name === wardName);
    if (hit) return hit.label;
  }
  return undefined;
}

/**
 * Panchayats whose bounding box contains the point (with a small margin). This is a
 * cheap first filter so that only the relevant panchayat file needs downloading.
 */
export function panchayatsNearPoint(lat: number, lng: number, marginDeg = 0.01): string[] {
  return PANCHAYATS.filter(
    ({ bbox: [s, w, n, e] }) =>
      lat >= s - marginDeg && lat <= n + marginDeg && lng >= w - marginDeg && lng <= e + marginDeg,
  ).map((p) => p.name);
}

// Vite turns each matching file into its own lazily-downloaded chunk.
const fileLoaders = import.meta.glob<GeoFeature[] | { features: GeoFeature[] }>(
  "../data/geo/*.json",
  { import: "default" },
);

const cache = new Map<string, GeoFeature[]>();
const inFlight = new Map<string, Promise<GeoFeature[]>>();

function loaderFor(slug: string) {
  return fileLoaders[`../data/geo/${slug}.json`];
}

export function loadPanchayat(name: string): Promise<GeoFeature[]> {
  const cached = cache.get(name);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(name);
  if (pending) return pending;

  const meta = getPanchayatMeta(name);
  const loader = meta && loaderFor(meta.slug);
  if (!meta || !loader) return Promise.resolve([]);

  const p = loader()
    .then((mod) => {
      const features = (Array.isArray(mod) ? mod : mod.features) as GeoFeature[];
      cache.set(name, features);
      inFlight.delete(name);
      return features;
    })
    .catch((err) => {
      // Allow a retry next time (e.g. the phone was briefly offline).
      inFlight.delete(name);
      throw err;
    });
  inFlight.set(name, p);
  return p;
}

export type GeoScope = "all" | string[];

function resolveNames(scope: GeoScope): string[] {
  return scope === "all" ? PANCHAYAT_NAMES : scope.filter((n) => getPanchayatMeta(n));
}

const EMPTY: GeoFeature[] = [];

// Concatenated feature lists, remembered per scope so repeated reads return the SAME array
// (React hooks and memoised calculations rely on that to avoid redoing work).
const joined = new Map<string, GeoFeature[]>();

/** Concatenated features (in index order) if every requested panchayat is already loaded. */
function peek(names: string[]): GeoFeature[] | null {
  if (names.length === 0) return EMPTY;
  const key = names.join("|");
  const hit = joined.get(key);
  if (hit) return hit;
  const out: GeoFeature[] = [];
  for (const n of PANCHAYAT_NAMES) {
    if (!names.includes(n)) continue;
    const f = cache.get(n);
    if (!f) return null;
    out.push(...f);
  }
  joined.set(key, out);
  return out;
}

export async function loadGeoScope(scope: GeoScope): Promise<GeoFeature[]> {
  const names = resolveNames(scope);
  await Promise.all(names.map(loadPanchayat));
  return peek(names) ?? EMPTY;
}

export interface UseGeofences {
  features: GeoFeature[];
  /** true once every requested panchayat has loaded (immediately when none are requested) */
  ready: boolean;
  /** true if a download failed (for example the phone went offline) */
  error: boolean;
}

/**
 * React hook: boundary features for the given panchayats ("all" = every panchayat).
 * Returns instantly when the data was loaded before, otherwise downloads it and re-renders.
 * `ready` is false from the very first render in which the scope changes, so callers never
 * mistake "not loaded yet" for "outside the service area".
 */
export function useGeofences(scope: GeoScope): UseGeofences {
  // Sorted into index order so the same set of panchayats always gives the same key.
  const names = PANCHAYAT_NAMES.filter((n) => resolveNames(scope).includes(n));
  const key = names.join("|");
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const hit = peek(names);
  const loaded = hit !== null;

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    loadGeoScope(names)
      .then(() => {
        if (!cancelled) rerender();
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded]);

  return { features: hit ?? EMPTY, ready: loaded, error: !loaded && failedKey === key };
}
