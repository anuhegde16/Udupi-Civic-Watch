import { useEffect, useRef, useState } from "react";
import { MapPin, AlertTriangle, RefreshCw } from "lucide-react";

interface WasteSpot {
  id: number;
  latitude: number;
  longitude: number;
  status: string;
  description: string | null;
  address: string | null;
  createdAt: string;
  imageUrl: string | null;
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function fetchSpots(): Promise<WasteSpot[]> {
  const res = await fetch(`${BASE_URL}/api/reports/public/map`);
  if (!res.ok) return [];
  return res.json();
}

export function LiveWasteMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [spots, setSpots] = useState<WasteSpot[]>([]);
  const [count, setCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadSpots = async () => {
    const data = await fetchSpots();
    setSpots(data);
    setCount(data.length);
    setLastRefresh(new Date());
    return data;
  };

  useEffect(() => {
    let map: any;

    async function init() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (!mapRef.current || leafletMapRef.current) return;

      map = L.map(mapRef.current, {
        center: [13.3409, 74.7421],
        zoom: 11,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      leafletMapRef.current = map;

      const data = await loadSpots();
      placeMarkers(L, map, data);
    }

    init();

    const interval = setInterval(async () => {
      const L = (await import("leaflet")).default;
      const data = await loadSpots();
      if (leafletMapRef.current) {
        placeMarkers(L, leafletMapRef.current, data);
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  function placeMarkers(L: any, map: any, data: WasteSpot[]) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    data.forEach((spot) => {
      const isReported = spot.status === "reported";
      const color = isReported ? "#ef4444" : "#f97316";
      const label = isReported ? "Unattended" : "Being Cleaned";

      const iconHtml = `
        <div class="pulse-marker" style="--pulse-color: ${color}">
          <div class="pulse-ring pulse-ring-1"></div>
          <div class="pulse-ring pulse-ring-2"></div>
          <div class="pulse-core"></div>
        </div>
      `;

      const icon = L.divIcon({
        html: iconHtml,
        className: "",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const timeAgo = getTimeAgo(spot.createdAt);
      const imgHtml = spot.imageUrl
        ? `<div style="margin:-4px -4px 10px -4px; border-radius:8px 8px 0 0; overflow:hidden; height:130px;">
             <img src="${spot.imageUrl}" alt="Waste photo" style="width:100%; height:100%; object-fit:cover; display:block;" />
           </div>`
        : "";
      const popup = L.popup({ className: "waste-popup", maxWidth: 240 }).setContent(`
        <div style="font-family: 'Bricolage Grotesque', sans-serif; padding: 4px; margin-top:${spot.imageUrl ? "0" : "0"};">
          ${imgHtml}
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${color}; margin-bottom:4px;">${label}</div>
          ${spot.description ? `<div style="font-size:13px; font-weight:600; color:#1a1a1a; margin-bottom:4px; line-height:1.4;">${spot.description.length > 80 ? spot.description.slice(0, 80) + "…" : spot.description}</div>` : ""}
          ${spot.address ? `<div style="font-size:12px; color:#666; margin-bottom:4px;">${spot.address}</div>` : ""}
          <div style="font-size:11px; color:#999;">Reported ${timeAgo}</div>
          <a href="/track/${spot.id}" style="display:inline-block; margin-top:8px; font-size:12px; font-weight:700; color:#0f766e; text-decoration:none; background:#f0fdf4; padding:4px 10px; border-radius:6px;">View Report →</a>
        </div>
      `);

      const marker = L.marker([spot.latitude, spot.longitude], { icon }).bindPopup(popup).addTo(map);
      markersRef.current.push(marker);
    });
  }

  function getTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(h / 24);
    if (d > 1) return `${d} days ago`;
    if (d === 1) return "yesterday";
    if (h >= 1) return `${h}h ago`;
    return "just now";
  }

  const handleRefresh = async () => {
    const L = (await import("leaflet")).default;
    const data = await loadSpots();
    if (leafletMapRef.current) {
      placeMarkers(L, leafletMapRef.current, data);
    }
  };

  const handleZoomIn = () => leafletMapRef.current?.zoomIn();
  const handleZoomOut = () => leafletMapRef.current?.zoomOut();
  const handleCenter = () =>
    leafletMapRef.current?.setView([13.3409, 74.7421], 11, { animate: true });

  const btnBase =
    "w-11 h-11 flex items-center justify-center bg-white/95 backdrop-blur-sm text-gray-700 shadow-md rounded-xl border border-gray-200/80 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-95 transition-all duration-150 cursor-pointer select-none";

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-border/50 shadow-xl bg-card">
      <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 py-3 bg-card/90 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          <span className="text-sm font-bold text-foreground">
            Live Waste Map
          </span>
          <span className="text-xs text-muted-foreground font-medium ml-1">
            — {count} unattended {count === 1 ? "spot" : "spots"} in Udupi District
          </span>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <div ref={mapRef} style={{ height: "420px", width: "100%" }} className="z-0" />

      {/* Custom map controls */}
      <div className="absolute top-[60px] right-3 z-[1000] flex flex-col gap-1.5">
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
        <button className={btnBase} onClick={handleCenter} aria-label="Re-center map" title="Re-center map">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
          </svg>
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center gap-4 px-4 py-2 bg-card/90 backdrop-blur-md border-t border-border/50">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm shadow-red-400/60" />
          <span className="text-xs text-muted-foreground">Unattended</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-orange-500 shadow-sm shadow-orange-400/60" />
          <span className="text-xs text-muted-foreground">Being cleaned</span>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          Updated {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
