import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as turf from "@turf/turf";

interface UnionedFeature {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const geofencesPath = resolve(
  __dirname,
  "../../artifacts/api-server/src/data/geofences.json"
);

interface GeofenceFeature {
  type: "Feature";
  properties: { name?: string; type?: string; [key: string]: unknown };
  geometry: { type: string; coordinates: unknown };
}

interface GeofenceCollection {
  type: "FeatureCollection";
  features: GeofenceFeature[];
}

function main() {
  const raw = readFileSync(geofencesPath, "utf-8");
  const data: GeofenceCollection = JSON.parse(raw);

  const wardFeatures = data.features.filter((f) => f.properties?.type === "ward");
  const districtFeature = data.features.find((f) => f.properties?.type === "district");

  if (wardFeatures.length === 0) {
    throw new Error("No ward features found in geofences.json");
  }
  if (!districtFeature) {
    throw new Error("No district feature found in geofences.json");
  }

  console.log(`Unioning ${wardFeatures.length} ward polygons...`);

  const wardPolygons = wardFeatures.map((f) =>
    turf.polygon(f.geometry.coordinates as number[][][])
  );

  let unioned = wardPolygons[0] as unknown as UnionedFeature;
  for (let i = 1; i < wardPolygons.length; i++) {
    const result = turf.union(turf.featureCollection([unioned, wardPolygons[i]] as never));
    if (!result) {
      throw new Error(`Union failed when merging ward index ${i} (${wardFeatures[i].properties.name})`);
    }
    unioned = result as unknown as UnionedFeature;
  }

  console.log("Union geometry type:", unioned.geometry.type);
  if (unioned.geometry.type === "MultiPolygon") {
    const parts = unioned.geometry.coordinates as unknown[];
    console.log(
      `WARNING: union produced a MultiPolygon with ${parts.length} parts. Wards are not fully edge-adjacent everywhere.`
    );
  }

  // Preserve original district feature properties, replace geometry only.
  const newDistrictFeature: GeofenceFeature = {
    type: "Feature",
    properties: { ...districtFeature.properties },
    geometry: unioned.geometry as GeofenceFeature["geometry"],
  };

  const newFeatures = data.features.map((f) =>
    f.properties?.type === "district" ? newDistrictFeature : f
  );

  const newData: GeofenceCollection = { ...data, features: newFeatures };

  writeFileSync(geofencesPath, JSON.stringify(newData, null, 2) + "\n", "utf-8");
  console.log(`Wrote regenerated district boundary to ${geofencesPath}`);
}

main();
