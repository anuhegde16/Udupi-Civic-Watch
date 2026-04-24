import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const UDUPI_CENTER: [number, number] = [13.3409, 74.7421];

function buildCenterIcon(color: string) {
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

function buildEdgeIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 18px; height: 18px;
      border-radius: 50%;
      background: white;
      border: 3px solid ${color};
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      cursor: ew-resize;
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function eastEdgeLatLng(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): [number, number] {
  const deltaLng = radiusKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));
  return [centerLat, centerLng + deltaLng];
}

interface OfficerAreaEditMapProps {
  lat: number;
  lng: number;
  radiusKm: number;
  color?: string;
  onCenterChange: (lat: number, lng: number) => void;
  onRadiusChange: (radiusKm: number) => void;
  height?: string;
}

export function OfficerAreaEditMap({
  lat,
  lng,
  radiusKm,
  color = "#0d9488",
  onCenterChange,
  onRadiusChange,
  height = "280px",
}: OfficerAreaEditMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const edgeHandleRef = useRef<L.Marker | null>(null);

  const onCenterChangeRef = useRef(onCenterChange);
  const onRadiusChangeRef = useRef(onRadiusChange);
  const centerRef = useRef({ lat, lng });
  useEffect(() => { onCenterChangeRef.current = onCenterChange; }, [onCenterChange]);
  useEffect(() => { onRadiusChangeRef.current = onRadiusChange; }, [onRadiusChange]);
  useEffect(() => { centerRef.current = { lat, lng }; }, [lat, lng]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = lat && lng ? [lat, lng] : UDUPI_CENTER;

    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const circle = L.circle(center, {
      radius: radiusKm * 1000,
      color,
      fillColor: color,
      fillOpacity: 0.15,
      weight: 2.5,
    }).addTo(map);

    const centerMarker = L.marker(center, {
      draggable: true,
      icon: buildCenterIcon(color),
      zIndexOffset: 100,
    }).addTo(map);

    const edgePos = eastEdgeLatLng(center[0], center[1], radiusKm);
    const edgeHandle = L.marker(edgePos, {
      draggable: true,
      icon: buildEdgeIcon(color),
      zIndexOffset: 50,
    }).addTo(map);

    centerMarker.on("drag", () => {
      const { lat: mlat, lng: mlng } = centerMarker.getLatLng();
      circle.setLatLng([mlat, mlng]);
      const currentRadiusM = circle.getRadius();
      const currentRadiusKm = currentRadiusM / 1000;
      const newEdge = eastEdgeLatLng(mlat, mlng, currentRadiusKm);
      edgeHandle.setLatLng(newEdge);
    });

    centerMarker.on("dragend", () => {
      const { lat: mlat, lng: mlng } = centerMarker.getLatLng();
      onCenterChangeRef.current(mlat, mlng);
    });

    edgeHandle.on("drag", () => {
      const { lat: elat, lng: elng } = edgeHandle.getLatLng();
      const { lat: clat, lng: clng } = centerMarker.getLatLng();
      const newRadius = Math.max(1, Math.min(50, haversineKm(clat, clng, elat, elng)));
      circle.setRadius(newRadius * 1000);
      const newEdge = eastEdgeLatLng(clat, clng, newRadius);
      edgeHandle.setLatLng(newEdge);
    });

    edgeHandle.on("dragend", () => {
      const { lat: elat, lng: elng } = edgeHandle.getLatLng();
      const { lat: clat, lng: clng } = centerMarker.getLatLng();
      const newRadius = Math.max(1, Math.min(50, haversineKm(clat, clng, elat, elng)));
      onRadiusChangeRef.current(parseFloat(newRadius.toFixed(2)));
    });

    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clat, lng: clng } = e.latlng;
      centerMarker.setLatLng([clat, clng]);
      circle.setLatLng([clat, clng]);
      const currentRadiusKm = circle.getRadius() / 1000;
      edgeHandle.setLatLng(eastEdgeLatLng(clat, clng, currentRadiusKm));
      onCenterChangeRef.current(clat, clng);
    });

    markerRef.current = centerMarker;
    circleRef.current = circle;
    edgeHandleRef.current = edgeHandle;
    mapRef.current = map;

    const bounds = circle.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    // Invalidate after mount + again after sheet open animation finishes
    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 350);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      edgeHandleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    setTimeout(() => mapRef.current?.invalidateSize(), 50);
  }, [height]);

  useEffect(() => {
    if (!markerRef.current || !circleRef.current || !edgeHandleRef.current || !mapRef.current) return;
    const latlng: [number, number] = [lat, lng];
    markerRef.current.setLatLng(latlng);
    circleRef.current.setLatLng(latlng);
    const currentRadiusKm = circleRef.current.getRadius() / 1000;
    edgeHandleRef.current.setLatLng(eastEdgeLatLng(lat, lng, currentRadiusKm));
    // Only pan the map if the new center is outside the currently visible area
    if (!mapRef.current.getBounds().contains(latlng)) {
      mapRef.current.setView(latlng, mapRef.current.getZoom(), { animate: true });
    }
  }, [lat, lng]);

  useEffect(() => {
    if (!circleRef.current || !markerRef.current || !edgeHandleRef.current) return;
    circleRef.current.setRadius(radiusKm * 1000);
    const { lat: clat, lng: clng } = markerRef.current.getLatLng();
    edgeHandleRef.current.setLatLng(eastEdgeLatLng(clat, clng, radiusKm));
    const bounds = circleRef.current.getBounds();
    if (mapRef.current && bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [radiusKm]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: "inherit" }}
      className="z-0"
    />
  );
}
