import { db, officersTable } from "@workspace/db";
import type { Officer } from "@workspace/db";
import { isNull } from "drizzle-orm";
import geofencesData from "../data/geofences.json";

// ── Internal: which panchayat does a lat/lng fall inside? ───────────────────
// Uses district-level (non-ward) polygons so it matches the service-area gate.
// Returns null when the point is outside all known municipalities.
function detectPanchayat(lat: number, lng: number): string | null {
  for (const feature of geofencesData.features) {
    const props = feature.properties as { type?: string; panchayat?: string };
    if (feature.geometry.type === "Polygon" && props.type !== "ward") {
      const ring = feature.geometry.coordinates[0] as [number, number][];
      if (pointInPolygon(lat, lng, ring)) return props.panchayat ?? null;
    }
  }
  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Ray-casting point-in-polygon. Ring coords are GeoJSON [lon, lat] pairs.
export function pointInPolygon(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]; // lon, lat
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Shortest distance (km) from a point to a polygon ring, used only as a
// tie-breaker fallback when a point falls outside every ward. In normal
// operation this should not fire: the Saligrama district boundary is
// regenerated as the exact geometric union of all ward polygons (see
// scripts/src/rebuild-district-boundary.ts), so any point inside the
// service area is inside some ward. This exists only to handle rare
// floating-point edge cases at shared ward borders deterministically,
// instead of picking an arbitrary officer.
function distanceToRingKm(lat: number, lng: number, ring: [number, number][]): number {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = distanceToSegmentKm(lat, lng, ring[j][1], ring[j][0], ring[i][1], ring[i][0]);
    if (d < min) min = d;
  }
  return min;
}

function distanceToSegmentKm(
  px: number,
  py: number,
  ay: number,
  ax: number,
  by: number,
  bx: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return haversineKm(px, py, cx, cy);
}

export function isWithinServiceArea(lat: number, lng: number): boolean {
  for (const feature of geofencesData.features) {
    const featureType = (feature.properties as { type?: string })?.type;
    // Only use district-level boundaries for service area gating (not ward sub-polygons)
    if (feature.geometry.type === "Polygon" && featureType !== "ward") {
      const ring = feature.geometry.coordinates[0] as [number, number][];
      if (pointInPolygon(lat, lng, ring)) return true;
    }
  }
  return false;
}

export async function findOfficerForLocation(
  lat: number,
  lng: number
): Promise<Officer | null> {
  // Determine which municipality this point belongs to so we never route a
  // report across panchayat boundaries (e.g. Udupi report → Saligrama officer).
  const panchayat = detectPanchayat(lat, lng);

  const allOfficers = await db.select().from(officersTable).where(isNull(officersTable.deletedAt));

  // Constrain the candidate pool to the matching panchayat.
  // If panchayat is null (e.g. point is right on a boundary), keep all officers
  // as a last resort so no report is ever stranded.
  const officers = panchayat
    ? allOfficers.filter((o) => o.panchayatName === panchayat)
    : allOfficers;

  // If no officers are configured for this panchayat yet, leave unassigned.
  if (officers.length === 0) return null;

  // Build lookups: zone name → exterior ring, and zone name → type (ward | district)
  const zoneRings = new Map<string, [number, number][]>();
  const zoneTypes = new Map<string, string>();
  for (const feature of geofencesData.features) {
    if (feature.geometry.type === "Polygon") {
      const props = feature.properties as { name?: string; type?: string };
      if (props.name) {
        zoneRings.set(props.name, feature.geometry.coordinates[0] as [number, number][]);
        zoneTypes.set(props.name, props.type ?? "district");
      }
    }
  }

  // Two-pass resolution: ward-assigned officers take priority over district-assigned ones.
  // This prevents a "Saligrama" (district) officer from shadowing a ward officer because
  // the district polygon fully contains all ward polygons.
  const wardOfficers: Officer[] = [];
  const districtOfficers: Officer[] = [];
  for (const officer of officers) {
    if (!officer.areaName) continue;
    const ring = zoneRings.get(officer.areaName);
    if (!ring || !pointInPolygon(lat, lng, ring)) continue;
    if (zoneTypes.get(officer.areaName) === "ward") {
      wardOfficers.push(officer);
    } else {
      districtOfficers.push(officer);
    }
  }

  if (wardOfficers.length > 0) return wardOfficers[0];
  if (districtOfficers.length > 0) return districtOfficers[0];

  // Final fallback: no ward/district polygon matched this point exactly.
  // Deterministically assign to the closest officer within the same panchayat
  // to handle rare floating-point edge cases at shared ward borders.
  let closestOfficer: Officer | null = null;
  let closestDistanceKm = Infinity;
  for (const officer of officers) {
    if (!officer.areaName) continue;
    const ring = zoneRings.get(officer.areaName);
    if (!ring) continue;
    const distanceKm = distanceToRingKm(lat, lng, ring);
    if (distanceKm < closestDistanceKm) {
      closestDistanceKm = distanceKm;
      closestOfficer = officer;
    }
  }
  if (closestOfficer) return closestOfficer;

  return officers[0] ?? null;
}

// ── Udupi geographic helpers (shared across routes) ──────────────────────────

export const udupiWardRings: { name: string; ring: [number, number][] }[] = (
  geofencesData.features as any[]
)
  .filter(
    (f) =>
      f.geometry.type === "Polygon" &&
      (f.properties as any)?.type === "ward" &&
      ((f.properties as any)?.name as string)?.startsWith("Udupi Ward"),
  )
  .map((f) => ({
    name: (f.properties as any).name as string,
    ring: f.geometry.coordinates[0] as [number, number][],
  }));

export const udupiBox = udupiWardRings.reduce(
  (b, { ring }) => {
    for (const [lng, lat] of ring) {
      if (lat < b.minLat) b.minLat = lat;
      if (lat > b.maxLat) b.maxLat = lat;
      if (lng < b.minLng) b.minLng = lng;
      if (lng > b.maxLng) b.maxLng = lng;
    }
    return b;
  },
  { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 },
);

/** Returns true when lat/lng falls inside any Udupi ward polygon. */
export function inUdupi(lat: number, lng: number): boolean {
  if (
    lat < udupiBox.minLat ||
    lat > udupiBox.maxLat ||
    lng < udupiBox.minLng ||
    lng > udupiBox.maxLng
  )
    return false;
  return udupiWardRings.some(({ ring }) => pointInPolygon(lat, lng, ring));
}
