import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function buildPinIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 32px; height: 40px;
      display: flex; align-items: flex-start; justify-content: center;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
        <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#0d9488"/>
        <circle cx="16" cy="16" r="7" fill="white" opacity="0.9"/>
      </svg>
    </div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  });
}

interface ReportLocationMapProps {
  latitude: number;
  longitude: number;
  height?: string;
}

export function ReportLocationMap({ latitude, longitude, height = "220px" }: ReportLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: true,
      dragging: true,
    }).setView([latitude, longitude], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    L.marker([latitude, longitude], { icon: buildPinIcon() }).addTo(map);

    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 350);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  const handleCenter = () => {
    mapRef.current?.setView([latitude, longitude], 16, { animate: true });
  };
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  const btnBase =
    "w-11 h-11 flex items-center justify-center bg-white/95 backdrop-blur-sm text-gray-700 shadow-md rounded-xl border border-gray-200/80 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-95 transition-all duration-150 text-lg font-bold select-none cursor-pointer";

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Custom controls — top-right */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
        <button className={btnBase} onClick={handleZoomIn} aria-label="Zoom in" title="Zoom in">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button className={btnBase} onClick={handleZoomOut} aria-label="Zoom out" title="Zoom out">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button className={btnBase} onClick={handleCenter} aria-label="Center on report" title="Center on report">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
