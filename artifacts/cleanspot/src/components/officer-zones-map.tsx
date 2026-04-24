import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const UDUPI_CENTER: [number, number] = [13.3409, 74.7421];

const ZONE_COLORS = ["#0d9488", "#f59e0b", "#f43f5e", "#8b5cf6", "#3b82f6", "#10b981"];

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

    const map = L.map(containerRef.current, { zoomControl: true }).setView(UDUPI_CENTER, 9);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layers: L.Layer[] = [];

    officers.forEach((officer, idx) => {
      const color = ZONE_COLORS[idx % ZONE_COLORS.length];

      if (
        officer.centerLat != null &&
        officer.centerLng != null &&
        officer.radiusKm != null
      ) {
        const center: [number, number] = [officer.centerLat, officer.centerLng];
        const circle = L.circle(center, {
          radius: officer.radiusKm * 1000,
          color,
          fillColor: color,
          fillOpacity: 0.12,
          weight: 2.5,
        }).addTo(map);

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

        const marker = L.marker(center, { icon: label, interactive: true }).addTo(map);

        if (onOfficerClick) {
          circle.on("click", () => onOfficerClick(officer.id));
          marker.on("click", () => onOfficerClick(officer.id));
        }

        layers.push(circle, marker);
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
        const m = L.marker(UDUPI_CENTER, { icon: fallbackIcon }).addTo(map);
        if (onOfficerClick) m.on("click", () => onOfficerClick(officer.id));
        layers.push(m);
      }
    });

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
