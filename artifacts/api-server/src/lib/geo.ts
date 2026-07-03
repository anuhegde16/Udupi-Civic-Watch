import { db, officersTable } from "@workspace/db";
import type { Officer } from "@workspace/db";
import { isNull } from "drizzle-orm";
import geofencesData from "../data/geofences.json";

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
function pointInPolygon(lat: number, lng: number, ring: [number, number][]): boolean {
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
  const officers = await db.select().from(officersTable).where(isNull(officersTable.deletedAt));

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

  // Final fallback: no ward/district polygon matched this point. Rather than
  // picking an arbitrary officer (previously `officers[0]` with no ORDER BY,
  // i.e. undefined DB order), deterministically assign to the officer whose
  // ward is geographically closest to the report's coordinates.
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

  return officers.length > 0 ? officers[0] : null;
}
