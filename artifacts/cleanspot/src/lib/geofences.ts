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

import { useEffect, useState } from "react";
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coordinates: any;
  };
}

export interface PanchayatMeta {
  name: string;
  slug: string;
  wardCount: number;
  /** [south, west, north, east] in degrees */
  bbox: [number, number, number, number];
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

/** Concatenated features (in index order) if every requested panchayat is already loaded. */
function peek(names: string[]): GeoFeature[] | null {
  const out: GeoFeature[] = [];
  for (const n of PANCHAYAT_NAMES) {
    if (!names.includes(n)) continue;
    const f = cache.get(n);
    if (!f) return null;
    out.push(...f);
  }
  return out;
}

export async function loadGeoScope(scope: GeoScope): Promise<GeoFeature[]> {
  const names = resolveNames(scope);
  await Promise.all(names.map(loadPanchayat));
  return peek(names) ?? EMPTY;
}

export interface UseGeofences {
  features: GeoFeature[];
  /** true once every requested panchayat has loaded (or there was nothing to load) */
  ready: boolean;
  error: boolean;
}

/**
 * React hook: boundary features for the given panchayats ("all" = every panchayat).
 * Returns instantly when the data was loaded before, otherwise loads it and re-renders.
 */
export function useGeofences(scope: GeoScope): UseGeofences {
  const names = resolveNames(scope);
  const key = names.join("|");

  const [state, setState] = useState<UseGeofences>(() => {
    const hit = names.length === 0 ? EMPTY : peek(names);
    return { features: hit ?? EMPTY, ready: hit !== null, error: false };
  });

  useEffect(() => {
    let cancelled = false;
    const hit = names.length === 0 ? EMPTY : peek(names);
    if (hit) {
      setState((s) => (s.ready && s.features === hit ? s : { features: hit, ready: true, error: false }));
      return;
    }
    setState({ features: EMPTY, ready: false, error: false });
    loadGeoScope(names)
      .then((features) => {
        if (!cancelled) setState({ features, ready: true, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ features: EMPTY, ready: false, error: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
