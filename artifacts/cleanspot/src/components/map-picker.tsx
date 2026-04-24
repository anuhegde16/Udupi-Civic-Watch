import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const UDUPI_CENTER: [number, number] = [13.3409, 74.7421];

function buildIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 32px; height: 40px;
      display: flex; align-items: flex-start; justify-content: center;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
        <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#0e6b7c"/>
        <circle cx="16" cy="16" r="7" fill="white" opacity="0.9"/>
      </svg>
    </div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  });
}

interface MapPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (loc: { lat: number; lng: number }) => void;
  height?: string;
}

export function MapPicker({ value, onChange, height = "260px" }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = value ? [value.lat, value.lng] : UDUPI_CENTER;
    const zoom = value ? 15 : 13;

    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    if (value) {
      const m = L.marker([value.lat, value.lng], { draggable: true, icon: buildIcon() }).addTo(map);
      markerRef.current = m;
      m.on("dragend", () => {
        const { lat, lng } = m.getLatLng();
        onChange({ lat, lng });
      });
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const m = L.marker([lat, lng], { draggable: true, icon: buildIcon() }).addTo(map);
        markerRef.current = m;
        m.on("dragend", () => {
          const { lat: dlat, lng: dlng } = m.getLatLng();
          onChange({ lat: dlat, lng: dlng });
        });
      }
      onChange({ lat, lng });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !value) return;
    const latlng: [number, number] = [value.lat, value.lng];
    if (markerRef.current) {
      markerRef.current.setLatLng(latlng);
    } else {
      const m = L.marker(latlng, { draggable: true, icon: buildIcon() }).addTo(mapRef.current);
      markerRef.current = m;
      m.on("dragend", () => {
        const { lat, lng } = m.getLatLng();
        onChange({ lat, lng });
      });
    }
    mapRef.current.setView(latlng, Math.max(mapRef.current.getZoom(), 15));
  }, [value?.lat, value?.lng]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: "inherit" }}
      className="z-0"
    />
  );
}
