import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import geofencesData from "../data/geofences.json";

const SALIGRAMA_CENTER: [number, number] = [13.4945, 74.7158];

function buildMarkerIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 28px; height: 28px;
      border-radius: 50%;
      background: ${color};
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      cursor: grab;
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const WARD_AMBER = "#f59e0b";

function getZoneRing(areaName: string): L.LatLng[] | null {
  for (const feature of geofencesData.features) {
    if (feature.geometry.type === "Polygon") {
      const name = (feature.properties as { name?: string })?.name;
      if (name === areaName) {
        return (feature.geometry.coordinates[0] as [number, number][]).map(
          ([lon, lat]) => L.latLng(lat, lon)
        );
      }
    }
  }
  return null;
}

function addWardContext(map: L.Map, activeAreaName?: string | null): L.Layer[] {
  const layers: L.Layer[] = [];
  for (const feature of geofencesData.features) {
    if (feature.geometry.type !== "Polygon") continue;
    const props = feature.properties as any;
    if (props?.type === "ward") {
      const ring = (feature.geometry.coordinates[0] as [number, number][]).map(
        ([lon, lat]) => L.latLng(lat, lon)
      );
      const isActive = props?.name === activeAreaName;
      layers.push(
        L.polygon(ring, {
          color: WARD_AMBER,
          fillColor: WARD_AMBER,
          fillOpacity: isActive ? 0.12 : 0.04,
          weight: isActive ? 2 : 0.8,
          dashArray: isActive ? undefined : "4 3",
          interactive: false,
        }).addTo(map)
      );
      const lats = ring.map((p) => p.lat);
      const lngs = ring.map((p) => p.lng);
      const cLat = lats.reduce((s, v) => s + v, 0) / lats.length;
      const cLng = lngs.reduce((s, v) => s + v, 0) / lngs.length;
      const wardNum = (props?.name as string)?.replace("Ward ", "") ?? "";
      layers.push(
        L.marker([cLat, cLng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="color:${WARD_AMBER};font-size:9px;font-weight:800;opacity:${isActive ? "1" : "0.6"};pointer-events:none;">${wardNum}</div>`,
            iconAnchor: [6, 6],
          }),
          interactive: false,
        }).addTo(map)
      );
    } else if (props?.type === "district") {
      // Outer Saligrama boundary — thick solid teal frame, no fill
      const ring = (feature.geometry.coordinates[0] as [number, number][]).map(
        ([lon, lat]) => L.latLng(lat, lon)
      );
      layers.push(
        L.polygon(ring, {
          color: "#0d9488",
          fillColor: "#0d9488",
          fillOpacity: 0,
          weight: 3.5,
          dashArray: undefined,
          interactive: false,
        }).addTo(map)
      );
    }
  }
  return layers;
}

interface OfficerAreaEditMapProps {
  lat: number;
  lng: number;
  areaName?: string | null;
  color?: string;
  onCenterChange: (lat: number, lng: number) => void;
  height?: string;
}

export function OfficerAreaEditMap({
  lat,
  lng,
  areaName,
  color = "#0d9488",
  onCenterChange,
  height = "280px",
}: OfficerAreaEditMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const onCenterChangeRef = useRef(onCenterChange);
  useEffect(() => { onCenterChangeRef.current = onCenterChange; }, [onCenterChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const zoneRing = areaName ? getZoneRing(areaName) : null;
    const initialCenter: [number, number] = lat && lng ? [lat, lng] : SALIGRAMA_CENTER;

    const map = L.map(containerRef.current, { zoomControl: true }).setView(initialCenter, 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Draw all ward + district context polygons
    addWardContext(map, areaName);

    if (zoneRing) {
      // Only use for fitBounds — addWardContext already renders the ward in amber
      const tempPoly = L.polygon(zoneRing);
      map.fitBounds(tempPoly.getBounds(), { padding: [30, 30] });
    }

    const marker = L.marker(initialCenter, {
      draggable: true,
      icon: buildMarkerIcon(color),
      zIndexOffset: 100,
    }).addTo(map);

    marker.on("dragend", () => {
      const { lat: mlat, lng: mlng } = marker.getLatLng();
      onCenterChangeRef.current(mlat, mlng);
    });

    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clat, lng: clng } = e.latlng;
      marker.setLatLng([clat, clng]);
      onCenterChangeRef.current(clat, clng);
    });

    markerRef.current = marker;
    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 350);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    setTimeout(() => mapRef.current?.invalidateSize(), 50);
  }, [height]);

  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;
    const latlng: [number, number] = [lat, lng];
    markerRef.current.setLatLng(latlng);
    if (!mapRef.current.getBounds().contains(latlng)) {
      mapRef.current.setView(latlng, mapRef.current.getZoom(), { animate: true });
    }
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: "inherit" }}
      className="z-0"
    />
  );
}
