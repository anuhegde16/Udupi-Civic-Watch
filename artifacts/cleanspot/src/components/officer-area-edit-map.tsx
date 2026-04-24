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

interface OfficerAreaEditMapProps {
  lat: number;
  lng: number;
  radiusKm: number;
  color?: string;
  onCenterChange: (lat: number, lng: number) => void;
  height?: string;
}

export function OfficerAreaEditMap({
  lat,
  lng,
  radiusKm,
  color = "#0d9488",
  onCenterChange,
  height = "280px",
}: OfficerAreaEditMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

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

    const marker = L.marker(center, {
      draggable: true,
      icon: buildCenterIcon(color),
    }).addTo(map);

    marker.on("drag", () => {
      const { lat: mlat, lng: mlng } = marker.getLatLng();
      circle.setLatLng([mlat, mlng]);
    });

    marker.on("dragend", () => {
      const { lat: mlat, lng: mlng } = marker.getLatLng();
      onCenterChange(mlat, mlng);
    });

    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clat, lng: clng } = e.latlng;
      marker.setLatLng([clat, clng]);
      circle.setLatLng([clat, clng]);
      onCenterChange(clat, clng);
    });

    markerRef.current = marker;
    circleRef.current = circle;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 50);
  }, [height]);

  useEffect(() => {
    if (!markerRef.current || !circleRef.current) return;
    const latlng: [number, number] = [lat, lng];
    markerRef.current.setLatLng(latlng);
    circleRef.current.setLatLng(latlng);
    mapRef.current?.setView(latlng, mapRef.current.getZoom());
  }, [lat, lng]);

  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.setRadius(radiusKm * 1000);
    if (mapRef.current && circleRef.current) {
      const bounds = circleRef.current.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [30, 30] });
      }
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
