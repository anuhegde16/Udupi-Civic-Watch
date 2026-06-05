import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import geofencesData from "../data/geofences.json";

const SALIGRAMA_CENTER: [number, number] = [13.4945, 74.7158];

const ZONE_COLORS = ["#0d9488", "#f59e0b", "#f43f5e", "#8b5cf6", "#3b82f6", "#10b981"];

// Build zone name → Leaflet LatLng ring from GeoJSON (coords are [lon, lat])
function buildZoneRings(): Map<string, L.LatLng[]> {
  const map = new Map<string, L.LatLng[]>();
  for (const feature of geofencesData.features) {
    if (feature.geometry.type === "Polygon") {
      const name = (feature.properties as { name?: string })?.name;
      if (name) {
        const ring = (feature.geometry.coordinates[0] as [number, number][]).map(
          ([lon, lat]) => L.latLng(lat, lon)
        );
        map.set(name, ring);
      }
    }
  }
  return map;
}

function polygonCentroid(ring: L.LatLng[]): [number, number] {
  const lat = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
  const lng = ring.reduce((s, p) => s + p.lng, 0) / ring.length;
  return [lat, lng];
}

export interface OfficerZone {
  id: number;
  name: string;
  areaName?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
}

interface OfficerZonesMapProps {
  officers: OfficerZone[];
  onOfficerClick?: (id: number) => void;
  height?: string;
}

export function OfficerZonesMap({ officers, onOfficerClick, height = "360px" }: OfficerZonesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: true }).setView(SALIGRAMA_CENTER, 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const zoneRings = buildZoneRings();
    const layers: L.Layer[] = [];
    const allBounds: L.LatLngBounds[] = [];

    officers.forEach((officer, idx) => {
      const color = ZONE_COLORS[idx % ZONE_COLORS.length];
      const ring = officer.areaName ? zoneRings.get(officer.areaName) : undefined;

      if (ring && ring.length > 0) {
        const poly = L.polygon(ring, {
          color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 2.5,
        }).addTo(map);

        allBounds.push(poly.getBounds());

        const [cLat, cLng] = polygonCentroid(ring);
        const label = L.divIcon({
          className: "",
          html: `<div style="
            background: ${color};
            color: white;
            font-weight: 800;
            font-size: 12px;
            padding: 3px 10px;
            border-radius: 20px;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            cursor: pointer;
          ">${officer.name}</div>`,
          iconAnchor: [0, 0],
        });

        const marker = L.marker([cLat, cLng], { icon: label, interactive: true }).addTo(map);

        if (onOfficerClick) {
          poly.on("click", () => onOfficerClick(officer.id));
          marker.on("click", () => onOfficerClick(officer.id));
        }

        layers.push(poly, marker);
      } else {
        const fallbackIcon = L.divIcon({
          className: "",
          html: `<div style="
            background: ${color};
            color: white;
            font-weight: 800;
            font-size: 12px;
            padding: 3px 10px;
            border-radius: 20px;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            opacity: 0.6;
            cursor: pointer;
          ">${officer.name} (no zone)</div>`,
          iconAnchor: [0, 0],
        });
        const m = L.marker(SALIGRAMA_CENTER, { icon: fallbackIcon }).addTo(map);
        if (onOfficerClick) m.on("click", () => onOfficerClick(officer.id));
        layers.push(m);
      }
    });

    if (allBounds.length > 0) {
      const combined = allBounds.reduce((acc, b) => acc.extend(b));
      map.fitBounds(combined, { padding: [24, 24] });
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(combined, { padding: [24, 24] });
      }, 300);
    }

    return () => {
      layers.forEach((l) => map.removeLayer(l));
    };
  }, [officers, onOfficerClick]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: "inherit" }}
      className="z-0"
    />
  );
}
