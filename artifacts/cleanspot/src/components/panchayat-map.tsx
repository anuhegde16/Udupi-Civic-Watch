import { useEffect, useRef, useState } from "react";
import geofencesData from "@/data/geofences.json";

const STATUS_COLORS: Record<string, string> = {
  reported: "#ef4444",
  cleaning: "#f59e0b",
  cleaned: "#22c55e",
};

const OFFICER_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#f97316",
  "#3b82f6",
  "#10b981",
  "#ec4899",
  "#0ea5e9",
  "#eab308",
];

const FALLBACK_BOUNDS: [[number, number], [number, number]] = [
  [13.46, 74.67],
  [13.54, 74.74],
];

type WardFeature = {
  name: string;
  latlngs: [number, number][];
  bounds: [[number, number], [number, number]];
  centroid: [number, number];
};

const wardFeatures: WardFeature[] = geofencesData.features
  .filter(
    (f) =>
      f.geometry.type === "Polygon" &&
      (f.properties as any)?.type === "ward"
  )
  .map((f) => {
    const coords = f.geometry.coordinates[0] as [number, number][];
    const lats = coords.map(([, lat]) => lat);
    const lons = coords.map(([lon]) => lon);
    return {
      name: (f.properties as any)?.name ?? "Ward",
      latlngs: coords.map(([lon, lat]) => [lat, lon] as [number, number]),
      bounds: [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      centroid: [
        lats.reduce((s, v) => s + v, 0) / lats.length,
        lons.reduce((s, v) => s + v, 0) / lons.length,
      ],
    };
  });

const districtFeature = (() => {
  const f = geofencesData.features.find(
    (f) => (f.properties as any)?.type === "district"
  );
  if (!f || f.geometry.type !== "Polygon") return null;
  const coords = f.geometry.coordinates[0] as [number, number][];
  return coords.map(([lon, lat]) => [lat, lon] as [number, number]);
})();

export type PanchayatMapOfficer = {
  id: number;
  name: string;
  areaName?: string | null;
};

export type PanchayatMapReport = {
  id: number;
  latitude: number;
  longitude: number;
  status: string;
  address?: string | null;
  assignedOfficerId?: number | null;
};

interface PanchayatMapProps {
  officers: PanchayatMapOfficer[];
  reports: PanchayatMapReport[];
}

export function PanchayatMap({ officers, reports }: PanchayatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const hasZoomedRef = useRef(false);

  // Init effect: create map + tiles only; all layer drawing is in the redraw effect
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    async function init() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: false });
      mapRef.current = map;

      map.fitBounds(FALLBACK_BOUNDS, { padding: [28, 28] });
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(FALLBACK_BOUNDS, { padding: [28, 28] });
      }, 200);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      setMapReady(true);
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Redraw effect: draws all ward polygons, labels, and report markers.
  // Also zooms to assigned wards on first data arrival.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let rafId: number | undefined;
    let cancelled = false;

    rafId = requestAnimationFrame(async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      // Zoom to assigned wards once when officer data first arrives
      if (!hasZoomedRef.current && officers.length > 0) {
        const assignedWardNames = new Set(
          officers.map((o) => o.areaName).filter(Boolean)
        );
        const assignedWards = wardFeatures.filter((w) =>
          assignedWardNames.has(w.name)
        );
        if (assignedWards.length > 0) {
          const allLats = assignedWards.flatMap((w) => [
            w.bounds[0][0],
            w.bounds[1][0],
          ]);
          const allLons = assignedWards.flatMap((w) => [
            w.bounds[0][1],
            w.bounds[1][1],
          ]);
          map.flyToBounds(
            [
              [Math.min(...allLats), Math.min(...allLons)],
              [Math.max(...allLats), Math.max(...allLons)],
            ],
            { padding: [28, 28], duration: 0.6 }
          );
        }
        hasZoomedRef.current = true;
      }

      map.eachLayer((layer: any) => {
        if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
      });

      if (districtFeature) {
        L.polygon(districtFeature, {
          color: "#0d9488",
          weight: 2.5,
          fillOpacity: 0,
          interactive: false,
        }).addTo(map);
      }

      wardFeatures.forEach((ward) => {
        const officer = officers.find((o) => o.areaName === ward.name);
        const color = officer
          ? OFFICER_PALETTE[officers.indexOf(officer) % OFFICER_PALETTE.length]
          : "#d1d5db";

        L.polygon(ward.latlngs, {
          color: officer ? color : "#d1d5db",
          weight: officer ? 1.5 : 0.5,
          dashArray: officer ? undefined : "4 6",
          fillColor: officer ? color : "#f3f4f6",
          fillOpacity: officer ? 0.12 : 0.03,
          interactive: false,
        }).addTo(map);

        if (officer) {
          const icon = L.divIcon({
            html: `<div style="
              background:${color};
              color:#fff;
              padding:2px 8px;
              border-radius:20px;
              font-size:11px;
              font-weight:700;
              white-space:nowrap;
              box-shadow:0 1px 4px rgba(0,0,0,0.25);
            ">${officer.name}</div>`,
            className: "",
            iconAnchor: [0, 8],
          });
          L.marker(ward.centroid, { icon, interactive: false }).addTo(map);
        }
      });

      reports.forEach((report) => {
        const color = STATUS_COLORS[report.status] ?? "#6b7280";
        const marker = L.circleMarker([report.latitude, report.longitude], {
          radius: 6,
          fillColor: color,
          color: "#fff",
          weight: 1.5,
          fillOpacity: 0.88,
        });

        const popup = document.createElement("div");
        popup.style.cssText = "min-width:160px;padding:4px 0;";

        const badge = document.createElement("span");
        badge.style.cssText = `display:inline-block;font-size:10px;font-weight:800;
          text-transform:uppercase;letter-spacing:.06em;color:#fff;background:${color};
          padding:1px 7px;border-radius:99px;margin-bottom:5px;`;
        badge.textContent =
          report.status === "reported"
            ? "New"
            : report.status === "cleaning"
            ? "In Progress"
            : "Cleaned";
        popup.appendChild(badge);

        const addr = document.createElement("div");
        addr.style.cssText =
          "font-size:12px;font-weight:600;color:#111827;line-height:1.4;max-width:200px;white-space:normal;";
        addr.textContent =
          report.address ??
          `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E`;
        popup.appendChild(addr);

        marker.bindPopup(popup).addTo(map);
      });
    });

    return () => {
      cancelled = true;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
    };
  }, [officers, reports, mapReady]);

  return (
    <div
      ref={containerRef}
      className="z-0 w-full rounded-2xl overflow-hidden"
      style={{ height: 320 }}
    />
  );
}
