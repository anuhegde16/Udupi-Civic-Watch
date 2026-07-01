import { useEffect, useRef, useState } from "react";
import { MapPin, RefreshCw, Globe } from "lucide-react";
import geofencesData from "@/data/geofences.json";
import { useImageLightbox } from "@/components/image-lightbox";

function ensureYouAreHereStyle() {
  if (document.getElementById("ck-you-here-style")) return;
  const style = document.createElement("style");
  style.id = "ck-you-here-style";
  style.textContent = `
    @keyframes ck-you-pulse {
      0%, 100% { transform: scale(1); opacity: 0.55; }
      50% { transform: scale(1.9); opacity: 0; }
    }
    .ck-you-pulse { animation: ck-you-pulse 2.2s ease-out infinite; }
  `;
  document.head.appendChild(style);
}

function buildYouAreHereIcon(L: any) {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
      <div class="ck-you-pulse" style="position:absolute;inset:-5px;background:rgba(37,99,235,0.28);border-radius:50%;"></div>
      <div style="position:relative;z-index:1;width:14px;height:14px;background:#2563eb;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    tooltipAnchor: [0, -13],
  });
}

function pointInPolygon(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  const n = ring.length;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

function countForZone(spots: WasteSpot[], zoneName: string | null): number {
  if (!zoneName) return spots.length;
  const feat = geofencesData.features.find(
    (f) => (f.properties as any)?.name === zoneName && f.geometry.type === "Polygon"
  );
  if (!feat) return 0;
  const ring = feat.geometry.coordinates[0] as [number, number][];
  return spots.filter((s) => pointInPolygon(s.longitude, s.latitude, ring)).length;
}

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

interface Zone {
  name: string;
  bounds: [[number, number], [number, number]];
}

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const DISTRICT_CENTER: [number, number] = [13.3409, 74.7421];
const DISTRICT_ZOOM = 11;

const zones: Zone[] = geofencesData.features
  .filter((f) => f.geometry.type === "Polygon" && (f.properties as any)?.type === "district")
  .map((f) => {
    const coords = f.geometry.coordinates[0];
    const lats = coords.map(([, lat]) => lat);
    const lons = coords.map(([lon]) => lon);
    return {
      name: (f.properties as any)?.name ?? "Zone",
      bounds: [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
    };
  });

async function fetchSpots(): Promise<WasteSpot[]> {
  const res = await fetch(`${BASE_URL}/api/reports/public/map`);
  if (!res.ok) return [];
  return res.json();
}

export function LiveWasteMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const spotsRef = useRef<WasteSpot[]>([]);
  const activeZoneRef = useRef<string | null>(null);
  const youAreHereRef = useRef<any>(null);
  const [count, setCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [activeZone, setActiveZone] = useState<string | null>(zones[0]?.name ?? null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const { lightbox, open: openLightbox } = useImageLightbox();
  const openLightboxRef = useRef(openLightbox);
  useEffect(() => {
    openLightboxRef.current = openLightbox;
  }, [openLightbox]);

  // Recompute count from cached spots whenever the active zone changes
  useEffect(() => {
    activeZoneRef.current = activeZone;
    setCount(countForZone(spotsRef.current, activeZone));
  }, [activeZone]);

  // Softly request geolocation — no forced prompt, silently skipped on denial
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* permission denied or unavailable — map works as before */ },
      { timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // Place or update the "You Are Here" marker whenever location arrives or map becomes ready
  useEffect(() => {
    if (!userLocation || !mapReady) return;
    async function placeYouAreHere() {
      if (!leafletMapRef.current) return;
      const L = (await import("leaflet")).default;
      ensureYouAreHereStyle();
      const latlng: [number, number] = [userLocation!.lat, userLocation!.lng];
      if (youAreHereRef.current) {
        youAreHereRef.current.setLatLng(latlng);
      } else {
        const um = L.marker(latlng, {
          icon: buildYouAreHereIcon(L),
          interactive: false,
          zIndexOffset: 500,
        }).addTo(leafletMapRef.current);
        um.bindTooltip("You are here", { permanent: false, direction: "top", className: "text-xs font-bold" });
        youAreHereRef.current = um;
      }
    }
    placeYouAreHere();
  }, [userLocation, mapReady]);

  const loadSpots = async () => {
    const data = await fetchSpots();
    spotsRef.current = data;
    setCount(countForZone(data, activeZoneRef.current));
    setLastRefresh(new Date());
    return data;
  };

  useEffect(() => {
    async function init() {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (!mapRef.current || leafletMapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
      });

      // Start fitted to the first service zone (Saligrama); fall back to district
      if (zones[0]) {
        map.fitBounds(zones[0].bounds, { padding: [24, 24] });
      } else {
        map.setView(DISTRICT_CENTER, DISTRICT_ZOOM);
      }

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      for (const feature of geofencesData.features) {
        if (feature.geometry.type === "Polygon") {
          const props = feature.properties as any;
          const isWard = props?.type === "ward";
          const latlngs = feature.geometry.coordinates[0].map(
            ([lon, lat]) => [lat, lon] as [number, number]
          );
          const poly = L.polygon(latlngs, {
            // District = thick solid teal frame; wards = thin amber dashed lines inside
            color: isWard ? "#f59e0b" : "#0d9488",
            weight: isWard ? 1 : 3.5,
            dashArray: isWard ? "4 3" : undefined,
            fillColor: isWard ? "#f59e0b" : "#0d9488",
            fillOpacity: isWard ? 0.05 : 0,
          }).addTo(map);
          const name = props?.name ?? "Service Zone";
          poly.bindTooltip(name, {
            permanent: false,
            direction: "center",
            className: "zone-label",
          });
        }
      }

      map.on("popupopen", (e: any) => {
        const el = e.popup.getElement?.();
        const img = el?.querySelector?.("img");
        if (img && !img.dataset.lightboxBound) {
          img.dataset.lightboxBound = "true";
          img.style.cursor = "zoom-in";
          img.addEventListener("click", (ev: Event) => {
            ev.stopPropagation();
            openLightboxRef.current([img.src]);
          });
        }
      });

      leafletMapRef.current = map;
      setMapReady(true);

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
        youAreHereRef.current = null;
      }
    };
  }, []);

  function placeMarkers(L: any, map: any, data: WasteSpot[]) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    data.forEach((spot) => {
      const color =
        spot.status === "reported"
          ? "#ef4444"
          : spot.status === "cleaning"
            ? "#f97316"
            : "#22c55e";
      const label =
        spot.status === "reported"
          ? "Unattended"
          : spot.status === "cleaning"
            ? "Being Cleaned"
            : "Completed";

      const isCleaned = spot.status === "cleaned";
      const iconHtml = isCleaned
        ? `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 2px ${color}40,0 2px 6px rgba(0,0,0,0.18);"></div>`
        : `<div class="pulse-marker" style="--pulse-color: ${color}">
             <div class="pulse-ring pulse-ring-1"></div>
             <div class="pulse-ring pulse-ring-2"></div>
             <div class="pulse-core"></div>
           </div>`;

      const icon = L.divIcon({
        html: iconHtml,
        className: "",
        iconSize: isCleaned ? [22, 22] : [40, 40],
        iconAnchor: isCleaned ? [11, 11] : [20, 20],
      });

      const timeAgo = getTimeAgo(spot.createdAt);
      const imgHtml = spot.imageUrl
        ? `<div style="margin:-4px -4px 10px -4px; border-radius:8px 8px 0 0; overflow:hidden; height:130px;">
             <img src="${spot.imageUrl}" alt="Waste photo" style="width:100%; height:100%; object-fit:cover; display:block;" />
           </div>`
        : "";
      const popup = L.popup({ className: "waste-popup", maxWidth: 240 }).setContent(`
        <div style="font-family: 'Bricolage Grotesque', sans-serif; padding: 4px;">
          ${imgHtml}
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${color}; margin-bottom:4px;">${label}</div>
          ${spot.description ? `<div style="font-size:13px; font-weight:600; color:#1a1a1a; margin-bottom:4px; line-height:1.4;">${spot.description.length > 80 ? spot.description.slice(0, 80) + "…" : spot.description}</div>` : ""}
          ${spot.address ? `<div style="font-size:12px; color:#666; margin-bottom:4px;">${spot.address}</div>` : ""}
          <div style="font-size:11px; color:#999;">Reported ${timeAgo}</div>
          <a href="/track/${spot.id}" style="display:inline-block; margin-top:8px; font-size:12px; font-weight:700; color:#0f766e; text-decoration:none; background:#f0fdf4; padding:4px 10px; border-radius:6px;">View Report →</a>
        </div>
      `);

      const marker = L.marker([spot.latitude, spot.longitude], { icon })
        .bindPopup(popup)
        .addTo(map);
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

  const focusZone = (zone: Zone) => {
    setActiveZone(zone.name);
    leafletMapRef.current?.fitBounds(zone.bounds, { padding: [32, 32], animate: true, duration: 0.6 });
  };

  const resetView = () => {
    setActiveZone(null);
    leafletMapRef.current?.setView(DISTRICT_CENTER, DISTRICT_ZOOM, { animate: true, duration: 0.6 });
  };

  const handleZoomIn = () => leafletMapRef.current?.zoomIn();
  const handleZoomOut = () => leafletMapRef.current?.zoomOut();

  const btnBase =
    "w-11 h-11 flex items-center justify-center bg-white/95 backdrop-blur-sm text-gray-700 shadow-md rounded-xl border border-gray-200/80 hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-95 transition-all duration-150 cursor-pointer select-none";

  return (
    <div className="space-y-4">
      {/* Service area selector */}
      <div className="bg-card rounded-2xl border border-border/50 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Currently available service areas
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* All areas chip */}
          <button
            onClick={resetView}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all duration-200 cursor-pointer ${
              activeZone === null
                ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-primary/5"
            }`}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            All areas
          </button>
          {/* One chip per zone */}
          {zones.map((zone) => (
            <button
              key={zone.name}
              onClick={() => focusZone(zone)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all duration-200 cursor-pointer ${
                activeZone === zone.name
                  ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground hover:bg-primary/5"
              }`}
            >
              <MapPin className="w-3 h-3 shrink-0" />
              {zone.name}
            </button>
          ))}
          {/* Coming soon placeholder — guides future additions */}
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border border-dashed border-border/60 text-muted-foreground/50 cursor-default select-none">
            <span className="w-3 h-3 rounded-full border border-dashed border-current flex-shrink-0" />
            More coming soon
          </span>
        </div>
      </div>

      {/* Map card */}
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
              — {count} active {count === 1 ? "report" : "reports"}{activeZone ? ` in ${activeZone}` : " in Udupi District"}
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
          <button className={btnBase} onClick={resetView} aria-label="Re-center map" title="View all areas">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
            </svg>
          </button>
        </div>

        {/* Legend bar */}
        <div className="absolute bottom-0 left-0 right-0 z-[1000] flex items-center gap-3 px-4 py-2 bg-card/90 backdrop-blur-md border-t border-border/50">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-xs text-muted-foreground font-medium">Unattended</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
            </span>
            <span className="text-xs text-muted-foreground font-medium">Being cleaned</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500 shadow-sm shadow-green-400/60"></span>
            <span className="text-xs text-muted-foreground font-medium">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="16" height="10" viewBox="0 0 16 10">
              <rect x="0" y="3" width="16" height="4" rx="2" fill="#0e6b7c" fillOpacity="0.15" stroke="#0e6b7c" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            <span className="text-xs text-muted-foreground font-medium">Service zone</span>
          </div>
          {userLocation && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600 border border-white"></span>
              </span>
              <span className="text-xs text-muted-foreground font-medium">You are here</span>
            </div>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            Updated {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
      {lightbox}
    </div>
  );
}
