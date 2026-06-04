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

export function isWithinServiceArea(lat: number, lng: number): boolean {
  for (const feature of geofencesData.features) {
    if (feature.geometry.type === "Polygon") {
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

  let bestOfficer: Officer | null = null;
  let bestDist = Infinity;

  for (const officer of officers) {
    if (
      officer.centerLat != null &&
      officer.centerLng != null &&
      officer.radiusKm != null
    ) {
      const dist = haversineKm(lat, lng, officer.centerLat, officer.centerLng);
      if (dist <= officer.radiusKm && dist < bestDist) {
        bestDist = dist;
        bestOfficer = officer;
      }
    }
  }

  // If no officer found by area, assign to the first officer
  if (!bestOfficer && officers.length > 0) {
    bestOfficer = officers[0];
  }

  return bestOfficer;
}
