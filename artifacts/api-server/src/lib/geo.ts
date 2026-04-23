import { db, officersTable } from "@workspace/db";
import type { Officer } from "@workspace/db";

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

export async function findOfficerForLocation(
  lat: number,
  lng: number
): Promise<Officer | null> {
  const officers = await db.select().from(officersTable);

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
