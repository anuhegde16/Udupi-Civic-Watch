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
        zoomControl: true,
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
      const popup = L.popup({ className: "waste-popup", maxWidth: 220 }).setContent(`
        <div style="font-family: 'Bricolage Grotesque', sans-serif; padding: 4px;">
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${color}; margin-bottom:4px;">${label}</div>
          ${spot.description ? `<div style="font-size:13px; font-weight:600; color:#1a1a1a; margin-bottom:4px;">${spot.description}</div>` : ""}
          ${spot.address ? `<div style="font-size:12px; color:#666; margin-bottom:4px;">${spot.address}</div>` : ""}
          <div style="font-size:11px; color:#999;">Reported ${timeAgo}</div>
          <a href="/track/${spot.id}" style="display:block; margin-top:8px; font-size:12px; font-weight:600; color:#0f766e; text-decoration:none;">View Report →</a>
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
