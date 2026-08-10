import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import geofencesData from "../data/geofences.json";
import { formatWardLabel } from "@/lib/ward-names";

const PANCHAYAT_CENTERS: Record<string, [number, number]> = {
  Saligrama: [13.4945, 74.7158],
  Udupi: [13.3409, 74.7421],
};
const DEFAULT_CENTER: [number, number] = [13.4, 74.73];

const ZONE_COLORS = ["#0d9488", "#f59e0b", "#f43f5e", "#8b5cf6", "#3b82f6", "#10b981"];

const WARD_AMBER = "#f59e0b";

// Build geofence ward name → Leaflet LatLng ring (source coords are [lon, lat])
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

/** Draw background ward polygons (amber) for context, optionally one panchayat only. */
function drawWardBackground(map: L.Map, panchayat?: string | null): L.Layer[] {
  const layers: L.Layer[] = [];
  for (const feature of geofencesData.features) {
    const props = feature.properties as any;
    if (feature.geometry.type !== "Polygon" || props?.type !== "ward") continue;
    if (panchayat && props?.panchayat !== panchayat) continue;

    const ring = (feature.geometry.coordinates[0] as [number, number][]).map(
      ([lon, lat]) => L.latLng(lat, lon)
    );
    const rawName = (props?.name as string) ?? "";
    const wardLabel = formatWardLabel(rawName) || rawName.replace("Ward ", "") || rawName;
    const poly = L.polygon(ring, {
      color: WARD_AMBER,
      fillColor: WARD_AMBER,
      fillOpacity: 0.06,
      weight: 1,
      dashArray: "4 3",
      interactive: false,
    }).addTo(map);
    const [cLat, cLng] = [
      ring.reduce((s, p) => s + p.lat, 0) / ring.length,
      ring.reduce((s, p) => s + p.lng, 0) / ring.length,
    ];
    const label = L.divIcon({
      className: "",
      html: `<div style="color:${WARD_AMBER};font-size:9px;font-weight:800;opacity:0.7;pointer-events:none;">${wardLabel}</div>`,
      iconAnchor: [6, 6],
    });
    layers.push(poly, L.marker([cLat, cLng], { icon: label, interactive: false }).addTo(map));
  }
  return layers;
}

function polygonCentroid(ring: L.LatLng[]): [number, number] {
  const lat = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
  const lng = ring.reduce((s, p) => s + p.lng, 0) / ring.length;
  return [lat, lng];
}

export interface StaffZone {
  /** Unique across staff types — profile ids only collide otherwise. */
  key: string;
  name: string;
  /** Canonical geofence ward names covered by this person (may be several). */
  wardKeys: string[];
  centerLat?: number | null;
  centerLng?: number | null;
}

interface OfficerZonesMapProps {
  zones: StaffZone[];
  onZoneClick?: (key: string) => void;
  /** Restrict the ward backdrop and default view to one panchayat. */
  panchayat?: string | null;
  height?: string;
}

export function OfficerZonesMap({
  zones,
  onZoneClick,
  panchayat = null,
  height = "360px",
}: OfficerZonesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center = (panchayat && PANCHAYAT_CENTERS[panchayat]) || DEFAULT_CENTER;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, 12);

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

    // Ward backdrop first, so staff zones draw on top
    layers.push(...drawWardBackground(map, panchayat));

    zones.forEach((zone, idx) => {
      const color = ZONE_COLORS[idx % ZONE_COLORS.length];
      const rings = zone.wardKeys
        .map((key) => zoneRings.get(key))
        .filter((r): r is L.LatLng[] => Boolean(r && r.length));

      if (rings.length > 0) {
        rings.forEach((ring, ringIdx) => {
          const poly = L.polygon(ring, {
            color,
            fillColor: color,
            fillOpacity: 0.15,
            weight: 2.5,
          }).addTo(map);
          allBounds.push(poly.getBounds());
          layers.push(poly);
          if (onZoneClick) poly.on("click", () => onZoneClick(zone.key));

          // Label only the first ward so multi-ward staff don't clutter the map
          if (ringIdx === 0) {
            const [cLat, cLng] = polygonCentroid(ring);
            const suffix = rings.length > 1 ? ` +${rings.length - 1}` : "";
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
              ">${zone.name}${suffix}</div>`,
              iconAnchor: [0, 0],
            });
            const marker = L.marker([cLat, cLng], { icon: label, interactive: true }).addTo(map);
            if (onZoneClick) marker.on("click", () => onZoneClick(zone.key));
            layers.push(marker);
          }
        });
      } else if (zone.centerLat != null && zone.centerLng != null) {
        const icon = L.divIcon({
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
            opacity: 0.75;
            cursor: pointer;
          ">${zone.name}</div>`,
          iconAnchor: [0, 0],
        });
        const m = L.marker([zone.centerLat, zone.centerLng], { icon }).addTo(map);
        if (onZoneClick) m.on("click", () => onZoneClick(zone.key));
        allBounds.push(L.latLngBounds([zone.centerLat, zone.centerLng], [zone.centerLat, zone.centerLng]));
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
    } else {
      const center = (panchayat && PANCHAYAT_CENTERS[panchayat]) || DEFAULT_CENTER;
      map.setView(center, 12);
    }

    return () => {
      layers.forEach((l) => map.removeLayer(l));
    };
  }, [zones, onZoneClick, panchayat]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: "inherit" }}
      className="z-0"
    />
  );
}
