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

  // Build a lookup: zone name → first exterior ring (GeoJSON [lon,lat] pairs)
  const zoneRings = new Map<string, [number, number][]>();
  for (const feature of geofencesData.features) {
    if (feature.geometry.type === "Polygon") {
      const name = (feature.properties as { name?: string })?.name;
      if (name) {
        zoneRings.set(name, feature.geometry.coordinates[0] as [number, number][]);
      }
    }
  }

  // Find an officer whose named zone polygon contains the report point
  for (const officer of officers) {
    if (officer.areaName) {
      const ring = zoneRings.get(officer.areaName);
      if (ring && pointInPolygon(lat, lng, ring)) {
        return officer;
      }
    }
  }

  // Fallback: assign to the first available officer
  return officers.length > 0 ? officers[0] : null;
}
