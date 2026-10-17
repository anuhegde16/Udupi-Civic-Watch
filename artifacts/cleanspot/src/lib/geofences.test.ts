import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_WARD_NAMES,
  PANCHAYATS,
  PANCHAYAT_NAMES,
  WARD_PANCHAYAT,
  getWardLabel,
  getWardNames,
  loadGeoScope,
  loadPanchayat,
  panchayatsNearPoint,
} from "./geofences";

const masterPath = resolve(__dirname, "../../../api-server/src/data/geofences.json");
const geoDir = resolve(__dirname, "../data/geo");
const master = JSON.parse(readFileSync(masterPath, "utf-8")) as {
  features: { properties: { name: string; type: string; panchayat: string; wardName?: string } }[];
};

describe("ward data split", () => {
  it("per-panchayat files re-join into exactly the master file (same features, same order)", async () => {
    const all = await loadGeoScope("all");
    expect(all).toEqual(master.features);
  });

  it("every panchayat file is listed in the index and vice versa", () => {
    const files = readdirSync(geoDir).filter((f) => f.endsWith(".json") && f !== "index.json").sort();
    expect(PANCHAYATS.map((p) => `${p.slug}.json`).sort()).toEqual(files);
  });

  it("index ward lists and counts match the data", () => {
    for (const p of PANCHAYATS) {
      const wards = master.features.filter((f) => f.properties.panchayat === p.name && f.properties.type === "ward");
      expect(p.wardCount).toBe(wards.length);
      expect(getWardNames(p.name)).toEqual(wards.map((f) => f.properties.name));
    }
    expect(ALL_WARD_NAMES.length).toBe(master.features.filter((f) => f.properties.type === "ward").length);
  });

  it("every panchayat has exactly one outline", () => {
    for (const name of PANCHAYAT_NAMES) {
      const outlines = master.features.filter((f) => f.properties.panchayat === name && f.properties.type === "district");
      expect(outlines).toHaveLength(1);
    }
  });

  it("ward lookups agree with the data", () => {
    for (const f of master.features.filter((x) => x.properties.type === "ward")) {
      expect(WARD_PANCHAYAT[f.properties.name]).toBeTruthy();
    }
    expect(getWardLabel("Udupi Ward 1")).toBe(master.features.find((f) => f.properties.name === "Udupi Ward 1")?.properties.wardName);
  });

  it("every polygon sits inside its panchayat's bounding box", async () => {
    for (const p of PANCHAYATS) {
      const feats = await loadPanchayat(p.name);
      for (const f of feats) {
        for (const [lon, lat] of f.geometry.coordinates[0]) {
          expect(lat).toBeGreaterThanOrEqual(p.bbox[0] - 1e-5);
          expect(lon).toBeGreaterThanOrEqual(p.bbox[1] - 1e-5);
          expect(lat).toBeLessThanOrEqual(p.bbox[2] + 1e-5);
          expect(lon).toBeLessThanOrEqual(p.bbox[3] + 1e-5);
        }
      }
    }
  });

  it("bounding-box lookup finds the panchayat for a point inside it, and nothing far away", () => {
    // Udupi Ward 1 area / Saligrama / Kundapura / Karkala town centres
    expect(panchayatsNearPoint(13.3409, 74.7421)).toContain("Udupi");
    expect(panchayatsNearPoint(13.4945, 74.7158)).toContain("Saligrama");
    expect(panchayatsNearPoint(13.6232, 74.6869)).toContain("Kundapura");
    expect(panchayatsNearPoint(13.2133, 74.9946)).toContain("Karkala");
    expect(panchayatsNearPoint(12.9, 77.6)).toEqual([]); // Bengaluru
  });

  it("loads each panchayat once and reuses it", async () => {
    const a = await loadPanchayat("Karkala");
    const b = await loadPanchayat("Karkala");
    expect(a).toBe(b);
  });
});
