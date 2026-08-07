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
  properties: { name?: string; type?: string; panchayat?: string; [key: string]: unknown };
  geometry: { type: string; coordinates: unknown };
}

interface GeofenceCollection {
  type: "FeatureCollection";
  features: GeofenceFeature[];
}

function rebuildForPanchayat(
  data: GeofenceCollection,
  panchayatName: string
): GeofenceFeature {
  const wardFeatures = data.features.filter(
    (f) => f.properties?.type === "ward" && f.properties?.panchayat === panchayatName
  );
  const districtFeature = data.features.find(
    (f) => f.properties?.type === "district" && f.properties?.panchayat === panchayatName
  );

  if (wardFeatures.length === 0) {
    throw new Error(`No ward features found for panchayat "${panchayatName}"`);
  }
  if (!districtFeature) {
    throw new Error(`No district feature found for panchayat "${panchayatName}"`);
  }

  console.log(`  Unioning ${wardFeatures.length} ward polygons for ${panchayatName}...`);

  const wardPolygons = wardFeatures.map((f) =>
    turf.polygon(f.geometry.coordinates as number[][][])
  );

  let unioned = wardPolygons[0] as unknown as UnionedFeature;
  for (let i = 1; i < wardPolygons.length; i++) {
    const result = turf.union(turf.featureCollection([unioned, wardPolygons[i]] as never));
    if (!result) {
      throw new Error(
        `Union failed when merging ward index ${i} (${wardFeatures[i].properties.name})`
      );
    }
    unioned = result as unknown as UnionedFeature;
  }

  console.log(`  Union geometry type: ${unioned.geometry.type}`);
  if (unioned.geometry.type === "MultiPolygon") {
    const parts = unioned.geometry.coordinates as unknown[];
    console.log(
      `  WARNING: union produced a MultiPolygon with ${parts.length} parts.`
    );
  }

  return {
    type: "Feature",
    properties: { ...districtFeature.properties },
    geometry: unioned.geometry as GeofenceFeature["geometry"],
  };
}

function main() {
  const raw = readFileSync(geofencesPath, "utf-8");
  const data: GeofenceCollection = JSON.parse(raw);

  // Discover all unique panchayat names that have both wards and a district
  const panchayatNames = [
    ...new Set(
      data.features
        .filter((f) => f.properties?.panchayat)
        .map((f) => f.properties!.panchayat as string)
    ),
  ];

  console.log(`Rebuilding district boundaries for: ${panchayatNames.join(", ")}`);

  const newDistrictsByPanchayat: Record<string, GeofenceFeature> = {};
  for (const name of panchayatNames) {
    newDistrictsByPanchayat[name] = rebuildForPanchayat(data, name);
  }

  // Replace district features in place; preserve ordering
  const newFeatures = data.features.map((f) => {
    if (f.properties?.type === "district" && f.properties?.panchayat) {
      const panchayat = f.properties.panchayat as string;
      return newDistrictsByPanchayat[panchayat] ?? f;
    }
    return f;
  });

  const newData: GeofenceCollection = { ...data, features: newFeatures };
  writeFileSync(geofencesPath, JSON.stringify(newData, null, 2) + "\n", "utf-8");
  console.log(`Wrote regenerated district boundaries to ${geofencesPath}`);
}

main();
